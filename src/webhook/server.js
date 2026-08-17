const express = require('express');
const { middleware, SignatureValidationFailed } = require('@line/bot-sdk');
const LineMessagingService = require('../services/lineMessaging');
const InteractionRouter = require('../services/interactionRouter');
const botIdentity = require('../services/botIdentity');
const logger = require('../utils/logger');

// Phase 2: interactive status query & device control, driven entirely by
// incoming LINE webhook events (trigger keyword / argument-less command, or
// a tap on a previously-sent Quick Reply/postback). See
// RUCKYOM_SPECIFICATION.md Section 2 and src/services/interactionRouter.js.
function createWebhookServer() {
  const app = express();
  const lineService = new LineMessagingService();
  const router = new InteractionRouter(lineService);

  // Verifies the x-line-signature header against the *currently active*
  // role's channel secret (botIdentity.js) and parses the JSON body — a
  // request that fails signature verification never reaches the route
  // handler at all. Resolved fresh per request (not built once at server
  // startup) so /switch dr|prod takes effect immediately: only one bot is
  // ever actually a member of the group at a time (LINE doesn't allow two),
  // so whichever role is active is always the only one whose signature can
  // legitimately validate anyway.
  const verifySignature = (req, res, next) => {
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
