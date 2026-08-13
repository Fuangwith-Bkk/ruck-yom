class IDeduplicator {
  async isDuplicate(messageId) {
    throw new Error('IDeduplicator.isDuplicate() must be implemented by a subclass.');
  }
}

module.exports = IDeduplicator;
