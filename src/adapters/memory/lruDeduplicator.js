const { LRUCache } = require('lru-cache');
const IDeduplicator = require('../../contracts/IDeduplicator');

class LRUDeduplicator extends IDeduplicator {
  constructor(ttlMs = 300000, maxItems = 2000) {
    super();
    this.cache = new LRUCache({
      max: maxItems,
      ttl: ttlMs,
      allowStale: false,
      updateAgeOnGet: false,
    });
  }

  async isDuplicate(messageId) {
    if (!messageId) return false;

    if (this.cache.has(messageId)) {
      return true;
    }

    this.cache.set(messageId, true);
    return false;
  }
}

module.exports = LRUDeduplicator;
