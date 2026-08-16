const { messagingApi } = require('@line/bot-sdk');

class LineMessagingService {
  constructor() {
    this.client = new messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
    });
    this.groupId = process.env.LINE_GROUP_ID;
  }

  // `content` is either a plain string (wrapped as a text message, the
  // original/common case — every alert template renders to a string) or a
  // pre-built message object/array (e.g. statusReport.js's Flex รายงาน
  // table for the daily summary) — same accepts-either pattern as
  // replyMessage below.
  async pushMessage(content) {
    if (!this.groupId) {
      throw new Error('LINE_GROUP_ID is missing from environment.');
    }

    const messages =
      typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [content];

    await this.client.pushMessage({
      to: this.groupId,
      messages
    });
  }

  // LINE's monthly push-message quota + how much of it has been used so
  // far this month — surfaced in รายงาน (statusReport.js) so a nearly-spent
  // quota isn't a silent surprise. Both are lightweight GETs against LINE's
  // own API, unrelated to Tuya. Callers decide how to handle a failure
  // (statusReport.js treats it as best-effort, same as houseMode/quietMode).
  async getQuota() {
    const [quota, consumption] = await Promise.all([
      this.client.getMessageQuota(),
      this.client.getMessageQuotaConsumption()
    ]);
    return { quota, consumption };
  }

  // For responding to an incoming webhook event (Phase 2 interactive menu).
  // Uses the event's replyToken instead of pushMessage's fixed groupId — it
  // doesn't count against the push-message quota and works in whichever
  // chat (group or 1:1) the triggering event came from. replyToken expires
  // ~1 minute after the event, so this must be called promptly.
  async replyMessage(replyToken, messages) {
    await this.client.replyMessage({
      replyToken,
      messages: Array.isArray(messages) ? messages : [messages]
    });
  }
}

module.exports = LineMessagingService;
