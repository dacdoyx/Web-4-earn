# 🚀 x402 GitHub & NPM Stats API

**Earn USDC from AI agents — zero cost, zero funding required.**

5 paid endpoints wrapping free data sources (GitHub, npm, Hacker News, DeFi Llama) behind x402 paywalls. AI agents pay per request in USDC on Base. You just need a wallet address.

## 📋 Endpoints

| Endpoint | Price | Data Source |
|---|---|---|
| `GET /trending?language=&since=weekly` | $0.01 | GitHub API (free) |
| `GET /repo-stats?owner=&repo=` | $0.02 | GitHub API (free) |
| `GET /npm-downloads?package=&period=month` | $0.01 | npm API (free) |
| `GET /hackernews?count=20` | $0.01 | Firebase HN API (free) |
| `GET /defi-yields?chain=` | $0.02 | DeFi Llama API (free) |
| `GET /health` | FREE | — |

## 🏃 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Set your wallet address
Edit `.env`:
```
RECIPIENT_ADDRESS=0xYOUR_BASE_WALLET_ADDRESS
SERVICE_URL=https://your-app.vercel.app
```

### 3. Run locally
```bash
npm start
```

### 4. Deploy to Vercel (FREE)
```bash
npm i -g vercel
vercel login
vercel deploy --prod
```

### 5. Register on x402scan Bazaar
Go to https://x402scan.com and register your service — 4,400+ paying agents can find you.

## 💰 Revenue Model

- **Cost to run:** $0 (free Vercel hobby tier)
- **Per request:** $0.01-0.02 USDC
- **At 1,000 requests/day:** ~$15-30/month
- **At 10,000 requests/day:** ~$150-300/month
- **Margins:** 95%+ (only cost is free-tier hosting)

## 🔍 Discovery

Your service is discoverable via:
- **A2A:** `/.well-known/agent.json` — Google's Agent-to-Agent protocol
- **x402:** `/.well-known/x402` — x402 discovery extension
- **LLM:** `/llms.txt` — LLM-friendly documentation
- **x402scan Bazaar** — Agent marketplace listing
- **OpenX402** — Permissionless facilitator registry

## ⚙️ How x402 Works

```
1. AI agent sends HTTP request
2. Server responds: 402 Payment Required ($0.01 USDC on Base)
3. Agent signs payment via wallet
4. Agent retries with payment proof in headers
5. Facilitator verifies & settles on-chain (~2 seconds)
6. Server delivers data
```

No API keys. No accounts. No login. Payment IS authentication.

## 📦 Tech Stack

- **Express.js** — HTTP server
- **@x402/express** — x402 payment middleware
- **@x402/evm** — EVM payment scheme (Base)
- **@x402/core** — Facilitator client
- **OpenX402** — Permissionless facilitator (free, no signup)

## 🔗 Links

- [x402 Protocol](https://x402.org)
- [OpenX402 Facilitator](https://openx402.ai)
- [x402scan Bazaar](https://x402scan.com)
- [Awesome x402](https://github.com/xpaysh/awesome-x402)
