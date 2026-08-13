const fs = require('fs');
const path = require('path');

// Maps Tuya device_id -> human-readable Thai device name.
// Actual mapping lives in deviceRegistry.json (untracked — contains real
// device IDs, kept out of git like .env). See deviceRegistry.example.json
// for the shape, and poc/all-status.js to list your linked devices' IDs.
// Unmapped device IDs fall back to a truncated-ID label in sensorNormalizer.js.
const registryPath = path.join(__dirname, 'deviceRegistry.json');

let registry = {};
if (fs.existsSync(registryPath)) {
  registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
}

module.exports = registry;
