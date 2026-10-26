const express = require('express');
const { middleware, validateSignature, SignatureValidationFailed } = require('@line/bot-sdk');
const LineMessagingService = require('../services/lineMessaging');
const InteractionRouter = require('../services/interactionRouter');
const botIdentity = require('../services/botIdentity');
const logger = require('../utils/logger');

// Phase 2: interactive status query & device control, driven entirely by
// incoming LINE webhook events (trigger keyword / argument-less command, or
// a tap on a previously-sent Quick Reply/postback). See
// RUCKYOM_SPECIFICATION.md Section 2 and src/services/interactionRouter.js.

// Read the body as raw bytes, the same way @line/bot-sdk's middleware does
// when nothing parsed it first, and hand it over as req.rawBody (which the
// middleware prefers) — so the bytes are still available afterwards to try
// the other roles' secrets on a signature failure. Deliberately not
// express.raw()/express.json(): those decompress Content-Encoding bodies,
// including Brotli (CVE-2026-111497), before the signature is checked.
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// The role (other than the active one) whose channel secret validates this
// request's signature, or null. A configured bot that isn't active is still
// one of ours — e.g. bot-dev invited into the group before /switch dev ran
// on the server (2026-10-26), whose `/switch dev` was then rejected as 401
// with the active bot already removed from the group.
function inactiveSigningRole(req) {
  const signature = req.headers['x-line-signature'];
  if (!signature || !Buffer.isBuffer(req.rawBody)) return null;
  const active = botIdentity.getActiveRole();
  return (
    botIdentity.SWITCHABLE_ROLES.find((role) => {
      if (role === active) return false;
      const { channelSecret } = botIdentity.getCredentials(role);
      return Boolean(channelSecret) && validateSignature(req.rawBody, channelSecret, signature);
    }) || null
  );
}

function createWebhookServer() {
  const app = express();
  const lineService = new LineMessagingService();
  const router = new InteractionRouter(lineService);

  // Verifies the x-line-signature header against the *currently active*
  // role's channel secret (botIdentity.js) and parses the JSON body — a
  // request that fails signature verification never reaches the route
  // handler at all. Resolved fresh per request (not built once at server
  // startup) so /switch prod|dr|dev takes effect immediately. Only the
  // active role's events reach the route handler; one validly signed by
  // another configured bot (e.g. invited before /switch ran) is diverted
  // in the error handler below to handleInactiveRoleEvents instead.
  const verifySignature = async (req, res, next) => {
    try {
      req.rawBody = await readRawBody(req);
    } catch (err) {
      next(err);
      return;
    }
    const role = botIdentity.getActiveRole();
    const { channelSecret } = botIdentity.getCredentials(role);
    if (!channelSecret) {
      logger.error(`[WEBHOOK] No LINE_${role.toUpperCase()}_CHANNEL_SECRET configured for active role "${role}".`);
      res.status(500).end();
      return;
    }
    middleware({ channelSecret })(req, res, next);
  };

  app.post('/webhook', verifySignature, (req, res) => {
    // Ack immediately — LINE expects a fast response, and a slow/failed ack
    // just causes it to retry redelivering the same events. Event
    // processing (Tuya REST calls, LINE replies) happens after; failures
    // are logged internally rather than surfaced as an HTTP error.
    res.status(200).end();
    router
      .handleEvents(req.body.events || [])
      .catch((err) => logger.error('[WEBHOOK] Unhandled error processing events:', err));
  });

  // Without this, `middleware()` rejecting a bad/missing x-line-signature
  // (via SignatureValidationFailed, thrown through next(err)) falls through
  // to Express's default error handler, which returns 500 — misleading for
  // what's actually a signature-verification rejection, and inconsistent
  // with the DoD expectation of a 401 there.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof SignatureValidationFailed) {
      // Signed by one of our other bots: accept it (200, so LINE's Verify
      // passes too) and let the router handle the few things an inactive
      // bot's events may do — see handleInactiveRoleEvents.
      const otherRole = inactiveSigningRole(req);
      if (otherRole) {
        res.status(200).end();
        let body;
        try {
          body = JSON.parse(req.rawBody.toString());
        } catch (parseErr) {
          logger.error(`[WEBHOOK] Unparseable body from bot-${otherRole}:`, parseErr);
          return;
        }
        router
          .handleInactiveRoleEvents(otherRole, body.events || [])
          .catch((handleErr) => logger.error('[WEBHOOK] Unhandled error processing inactive-bot events:', handleErr));
        return;
      }
      logger.error('[WEBHOOK] Signature validation failed:', err.message);
      res.status(401).end();
      return;
    }
    logger.error('[WEBHOOK] Unhandled middleware error:', err);
    res.status(500).end();
  });

  return app;
}

module.exports = { createWebhookServer };
