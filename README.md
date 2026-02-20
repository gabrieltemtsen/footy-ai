# Footy AI

Telegram-first football agent with optional Farcaster integration, powered by ElizaOS and ChanceDB probability snapshots.

## What it does

- Live football utility: fixtures, standings, live scores, fantasy tips
- Prediction-market context via ChanceDB (`/bwaps/leases`, `/snapshots/latest`)
- Match probability answers (home/draw/away)
- Basic watchlist intents for event-key monitoring:
  - `watch eventKey <EVENT_KEY> 5%`
  - `unwatch eventKey <EVENT_KEY>`
  - `watchlist`

## Integrations

- **Telegram** (primary focus now) via `@elizaos/plugin-telegram`
- **Farcaster** (enabled and kept available) via `@elizaos/plugin-farcaster`

## Environment

Copy `.env.example` to `.env` and set at least:

- LLM key: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- Telegram: `TELEGRAM_BOT_TOKEN`
- ChanceDB auth (preferred): `CHANCEDB_CAPABILITY_JWT`
  - optional x402 header fallback: `CHANCEDB_X402_PAYMENT`

Optional Farcaster keys:
- `FARCASTER_NEYNAR_API_KEY`
- `FARCASTER_SIGNER_UUID`
- `FARCASTER_FID`

## Run

```bash
# install deps
npm install

# dev
npm run dev

# build
npm run build
```

## Notes

- This repo uses Bun-oriented scripts in places; ensure Bun is installed for full local test/build parity where needed.
- ChanceDB docs reference: https://chancedb.com/docs/#mcp
