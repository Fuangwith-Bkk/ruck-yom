# RuckYom (รักยม)

Real-time smart home security engine: consumes Tuya IoT sensor events over Pulsar WebSocket, pushes Thai-language alerts to a LINE group, and lets the group interact back — device status/history, control, arm/disarm, and quiet mode.

See [`RUCKYOM_SPECIFICATION.md`](./RUCKYOM_SPECIFICATION.md) for the full architecture, roadmap, and implementation reference.

**Status:** Phase 2 (Interactive Status Query & Device Control), Increments 1-4 shipped.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template and fill in your credentials:
   ```bash
   cp .env.example .env
   ```
3. Start the app:
   ```bash
   npm start
   ```

## Requirements

- Node.js >= 18.0.0
