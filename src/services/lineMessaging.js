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
}

module.exports = LineMessagingService;
