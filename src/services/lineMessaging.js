const { messagingApi } = require('@line/bot-sdk');

class LineMessagingService {
  constructor() {
    this.client = new messagingApi.MessagingApiClient({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN
    });
    this.groupId = process.env.LINE_GROUP_ID;
  }

  async pushMessage(text) {
    if (!this.groupId) {
      throw new Error('LINE_GROUP_ID is missing from environment.');
    }

    await this.client.pushMessage({
      to: this.groupId,
      messages: [{ type: 'text', text }]
    });
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
