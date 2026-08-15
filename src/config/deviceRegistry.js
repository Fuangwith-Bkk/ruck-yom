const fs = require('fs');
const path = require('path');

// Maps Tuya device_id -> { name, category, dpProfile }. `dpProfile` names a
// key in src/config/dpProfiles.js and must match the device's real Tuya
// Product Category (Tuya IoT Platform → Device → Basic Information) — see
// dpProfiles.js for why this has to be per-device, not guessed.
// Actual mapping lives in deviceRegistry.json (untracked — contains real
// device IDs, kept out of git like .env). See deviceRegistry.example.json
// for the shape. Unmapped device IDs fall back to a truncated-ID label in
// sensorNormalizer.js, and get no dpProfile (all their DPs surface as
// UNKNOWN_EVENT until registered).
const registryPath = path.join(__dirname, 'deviceRegistry.json');

let registry = {};
if (fs.existsSync(registryPath)) {
  registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
}

module.exports = registry;
