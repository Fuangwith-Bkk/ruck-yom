const { messagingApi } = require('@line/bot-sdk');
const botIdentity = require('./botIdentity');

class LineMessagingService {
  constructor() {
    this._client = null;
    this._clientToken = null;
  }

  // Rebuilds the underlying SDK client only when the token actually
  // changed since the last call, rather than caching one role at
  // construction time — /switch (botIdentity.js) can change the active
  // role at any moment, and two separate instances of this class exist
  // (app.js's and webhook/server.js's), so there's no single place to push
  // an invalidation into both. Cheap to re-check on every call instead.
  _clientFor(role) {
    const { accessToken } = botIdentity.getCredentials(role);
    if (!accessToken) {
      throw new Error(`LINE_${role.toUpperCase()}_CHANNEL_ACCESS_TOKEN is missing from environment.`);
    }
    if (this._clientToken !== accessToken) {
      this._client = new messagingApi.MessagingApiClient({ channelAccessToken: accessToken });
      this._clientToken = accessToken;
    }
    return this._client;
  }

  // `content` is either a plain string (wrapped as a text message, the
  // original/common case — every alert template renders to a string) or a
  // pre-built message object/array (e.g. statusReport.js's Flex รายงาน
  // table for the daily summary) — same accepts-either pattern as
  // replyMessage below.
  async pushMessage(content) {
    const role = botIdentity.getActiveRole();
    const { groupId } = botIdentity.getCredentials(role);
    if (!groupId) {
      throw new Error(
        `No groupId known yet for role "${role}" — invite bot-${role} into the group first (its groupId is learned automatically from its first event there).`
      );
    }

    const messages =
      typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [content];

    await this._clientFor(role).pushMessage({
      to: groupId,
      messages
    });
  }

  // LINE's monthly push-message quota + how much of it has been used so
  // far this month — surfaced in รายงาน (statusReport.js) so a nearly-spent
  // quota isn't a silent surprise. Both are lightweight GETs against LINE's
  // own API, unrelated to Tuya. Callers decide how to handle a failure
  // (statusReport.js treats it as best-effort, same as houseMode/quietMode).
  async getQuota() {
    const client = this._clientFor(botIdentity.getActiveRole());
    const [quota, consumption] = await Promise.all([
      client.getMessageQuota(),
      client.getMessageQuotaConsumption()
    ]);
    return { quota, consumption };
  }

  // For responding to an incoming webhook event (Phase 2 interactive menu).
  // Uses the event's replyToken instead of pushMessage's fixed groupId — it
  // doesn't count against the push-message quota and works in whichever
  // chat (group or 1:1) the triggering event came from. replyToken expires
  // ~1 minute after the event, so this must be called promptly.
  //
  // Always uses the currently active role's credentials — correct because
  // server.js only ever verifies (and therefore only ever forwards) a
  // webhook event whose signature matches that same active role's channel
  // secret at the moment it arrives, so "active role" and "role that
  // delivered this replyToken" are always the same thing by construction.
  // /switch relies on this too: interactionRouter.js sends its confirmation
  // reply *before* calling botIdentity.setActiveRole(), so it still goes
  // out via the outgoing role, exactly matching the replyToken it's tied to.
  async replyMessage(replyToken, messages) {
    const client = this._clientFor(botIdentity.getActiveRole());
    await client.replyMessage({
      replyToken,
      messages: Array.isArray(messages) ? messages : [messages]
    });
  }
}

module.exports = LineMessagingService;
