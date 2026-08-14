const alertsTemplate = require('../templates/securityAlerts.json');

class TemplateEngine {
  constructor(templates = alertsTemplate, botName = process.env.LINE_BOT_NAME || 'รักยม') {
    this.templates = templates;
    this.botName = botName;
  }

  render(event) {
    const templateStr = this.templates[event.eventType] || this.templates['UNKNOWN_EVENT'];
    const context = { botName: this.botName, ...event };

    return templateStr.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
      if (key in context) {
        return context[key];
      }
      return match;
    });
  }
}

module.exports = TemplateEngine;
