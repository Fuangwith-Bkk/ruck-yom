const alertsTemplate = require('../templates/securityAlerts.json');

class TemplateEngine {
  constructor(templates = alertsTemplate) {
    this.templates = templates;
  }

  render(event) {
    const templateStr = this.templates[event.eventType] || this.templates['UNKNOWN_EVENT'];

    return templateStr.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
      if (key in event) {
        return event[key];
      }
      return match;
    });
  }
}

module.exports = TemplateEngine;
