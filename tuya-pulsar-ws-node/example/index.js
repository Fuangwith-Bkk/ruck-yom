/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
const TuyaWebsocket = require('../dist').default;

const client = new TuyaWebsocket({
  accessId: "your accessId",
  accessKey: "your accessKey",
  url: TuyaWebsocket.URL.CN,
  env: TuyaWebsocket.env.PROD,
  maxRetryTimes: 100,
});

client.open(() => {
  console.log('open');
});

client.message((ws, message) => {
  client.ackMessage(message.messageId);
  console.log('message', message);
});

client.reconnect(() => {
  console.log('reconnect');
});

client.ping(() => {
  console.log('ping');
});

client.pong(() => {
  console.log('pong');
});

client.close((ws, ...args) => {
  console.log('close', ...args);
});

client.error((ws, error) => {
  console.log('error', error);
});

client.start() // 开始接收消息
