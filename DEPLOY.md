# 🚀 Deploy Your x402 Money-Maker — Step by Step

Your code is ready in `/home/user/x402-github-stats/`. Follow these steps to go live.

---

## STEP 1: Push to GitHub (5 min)

### 1a. Create a new repo on GitHub
- Go to https://github.com/new
- Repo name: `x402-github-stats` (or whatever you want)
- Make it **Public**
- Do NOT initialize with README (we already have one)
- Click **Create repository**

### 1b. Push your code

Copy the files from this workspace to your local machine, then:

```bash
# On your local machine
mkdir x402-github-stats && cd x402-github-stats
git init
git branch -M main

# Copy these files from the workspace into this folder:
#   - server.js
#   - package.json
#   - package-lock.json
#   - vercel.json
#   - README.md
#   - .gitignore

# Or just download them all — they're in /home/user/x402-github-stats/

git add -A
git commit -m "🚀 x402 GitHub & NPM Stats API"
git remote add origin https://github.com/YOUR_USERNAME/x402-github-stats.git
git push -u origin main
```

---

## STEP 2: Create Your .env Locally

Create a `.env` file (this is NOT pushed to GitHub — it's in .gitignore):

```env
RECIPIENT_ADDRESS=0xde524fddf721fe3376916deff77b7e9f3593b4e9
SERVICE_URL=https://your-app-name.vercel.app
PORT=3000
```

You'll update `SERVICE_URL` after deploying to Vercel.

---

## STEP 3: Deploy to Vercel (2 min)

### 3a. Go to https://vercel.com and sign up (free)
- Sign in with GitHub

### 3b. Import your repo
- Click **"Add New" → Project**
- Select your `x402-github-stats` repo
- Framework Preset: **Other**
- Root Directory: `./` (default)
- Build Command: leave empty
- Output Directory: leave empty

### 3c. Add Environment Variables
In the Vercel deploy settings, add these environment variables:

| Key | Value |
|---|---|
| `RECIPIENT_ADDRESS` | `0xde524fddf721fe3376916deff77b7e9f3593b4e9` |
| `SERVICE_URL` | `https://your-app-name.vercel.app` (fill in after deploy) |

### 3d. Click **Deploy**
Your app will be live at something like:
`https://x402-github-stats-abc123.vercel.app`

### 3e. Update SERVICE_URL
After first deploy, go to:
- **Settings → Environment Variables**
- Update `SERVICE_URL` to your actual Vercel URL
- **Redeploy** (Deployments → latest → Redeploy)

---

## STEP 4: Verify It's Working

Visit these URLs in your browser:

| URL | Expected Result |
|---|---|
| `https://your-app.vercel.app/health` | ✅ JSON status (FREE) |
| `https://your-app.vercel.app/trending` | 📛 402 Payment Required |
| `https://your-app.vercel.app/repo-stats` | 📛 402 Payment Required |
| `https://your-app.vercel.app/.well-known/agent.json` | ✅ A2A discovery card |
| `https://your-app.vercel.app/.well-known/x402` | ✅ x402 discovery |
| `https://your-app.vercel.app/llms.txt` | ✅ LLM docs |

**If `/trending` returns 402 — you're earning. That means AI agents that pay will get through.**

---

## STEP 5: Register on Marketplaces (5 min each)

These are where 4,400+ paying AI agents discover services. All free to register.

### 5a. x402scan Bazaar
1. Go to https://x402scan.com
2. Register your service with your Vercel URL
3. Your endpoints appear in the Bazaar for agents to find

### 5b. OpenX402
1. Go to https://openx402.ai/register
2. Submit your service URL and wallet address
3. Listed in the permissionless facilitator directory

### 5c. Agentic.market (Coinbase's x402 App Store)
1. Go to https://agentic.market
2. Submit your service — 523 services, 69K agents
3. Highest-visibility distribution

### 5d. MCP-Hive (Optional)
1. Go to https://mcp-hive.com
2. Submit as founding provider — 0% fee
3. Per-invocation MCP marketplace

---

## STEP 6: Watch the Money Come In 💰

Monitor your earnings:
- **x402scan scanner**: https://x402scan.com — real-time transaction feed
- **BaseScan**: https://basescan.org/address/0xde524fddf721fe3376916deff77b7e9f3593b4e9 — check your USDC balance
- **OpenX402 scanner**: https://openx402.ai/scanner

---

## 💡 Pro Tips to Earn More

1. **Add more endpoints** — Each new data source = new revenue stream
2. **Higher-value data = higher prices** — AI-enriched analysis can charge $0.25+
3. **Register everywhere** — Discovery is the #1 challenge, be on every marketplace
4. **Add caching** — Faster responses = more repeat customers
5. **Monitor what agents are buying** — Check x402scan daily, build what's in demand

---

## 📊 Revenue Reality Check

| Traffic Level | Daily Revenue | Monthly Revenue |
|---|---|---|
| 100 requests/day | ~$1 | ~$30 |
| 1,000 requests/day | ~$10 | ~$300 |
| 10,000 requests/day | ~$100 | ~$3,000 |

Remember: 4,400 buyers vs 477 sellers. You're on the supply side. 🐰
