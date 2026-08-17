const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Every credential set this deployment knows about. `dev` is the
// developer's own local/testing identity, never chat-switchable. `prod`
// and `dr` are the two real house bots — LINE doesn't allow two bots to be
// members of the same group chat at once, so exactly one of these two is
// ever actually sitting in the family group. /switch dr|prod
// (interactionRouter.js) only ever toggles between these two.
//
// This module never touches LINE group membership itself — the human
// removes/invites the bots by hand in the LINE app. All it owns is: which
// credential set outgoing messages use (getActiveRole/setActiveRole), and
// each role's groupId, auto-learned the moment that role's bot is next
// seen in a group chat (learnGroupId) rather than requiring it to be
// copied into .env by hand.
const ALL_ROLES = ['dev', 'prod', 'dr'];
const SWITCHABLE_ROLES = ['prod', 'dr'];

// Persisted the same "best-effort, existence/content is the only contract"
// tier as quietMode.js's crash marker — a restart mid-way through a switch
// should resume as the role that was actually being switched to, not
// silently fall back to whatever LINE_ACTIVE_ROLE says in .env.
const STATE_FILE = process.env.LINE_ROLE_STATE_FILE || path.join(__dirname, '../../line-role-state.json');

function _load() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    }
  } catch (err) {
    logger.error('[BOT_IDENTITY] Failed to load state:', err);
  }
  return {};
}

const _initialState = _load();
// LINE_ACTIVE_ROLE is only the *initial* value before the first /switch —
// once persisted, the state file wins on every later boot.
let activeRole = _initialState.activeRole || process.env.LINE_ACTIVE_ROLE || 'dev';
let learnedGroupIds = _initialState.groupIds || {};

function _persist() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ activeRole, groupIds: learnedGroupIds }));
  } catch (err) {
    logger.error('[BOT_IDENTITY] Failed to persist state:', err);
  }
}

function getActiveRole() {
  return activeRole;
}

function setActiveRole(role) {
  if (!SWITCHABLE_ROLES.includes(role)) {
    throw new Error(`Role "${role}" is not switchable — expected one of: ${SWITCHABLE_ROLES.join(', ')}`);
  }
  activeRole = role;
  _persist();
  logger.info(`[BOT_IDENTITY] Active role switched to "${role}"`);
}

// groupId prefers a value learned live from an incoming webhook event
// (interactionRouter.js calls learnGroupId() the moment a role's channel is
// next seen in a group chat) over whatever's in .env — a bot's groupId for
// a given physical group is only knowable once it's actually received an
// event from that group, so a freshly manually-invited bot works with zero
// pre-configuration.
function getCredentials(role) {
  const prefix = `LINE_${role.toUpperCase()}_`;
  return {
    accessToken: process.env[`${prefix}CHANNEL_ACCESS_TOKEN`],
    channelSecret: process.env[`${prefix}CHANNEL_SECRET`],
    groupId: learnedGroupIds[role] || process.env[`${prefix}GROUP_ID`]
  };
}

function isConfigured(role) {
  const { accessToken, channelSecret } = getCredentials(role);
  return Boolean(accessToken && channelSecret);
}

function learnGroupId(role, groupId) {
  if (!groupId || learnedGroupIds[role] === groupId) return;
  learnedGroupIds[role] = groupId;
  _persist();
  logger.info(`[BOT_IDENTITY] Learned groupId for role "${role}"`);
}

module.exports = {
  ALL_ROLES,
  SWITCHABLE_ROLES,
  getActiveRole,
  setActiveRole,
  getCredentials,
  isConfigured,
  learnGroupId
};
