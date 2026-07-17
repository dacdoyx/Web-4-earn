# 🔑 How to Get CDP API Keys (for Agentic Market Auto-Indexing)

This guide walks you through creating a free Coinbase Developer Platform (CDP)
account and API keys. Once added to your Vercel deployment, your x402 service
will automatically appear on Agentic Market (47,000+ paying AI agents).

---

## Step 1: Create a CDP Account (2 minutes)

1. Open this link on your phone/browser:
   👉 **https://portal.cdp.coinbase.com**

2. You'll see a Coinbase sign-in page. Click one of:
   - **"Sign in with Google"** (easiest)
   - **"Sign in with Apple"**
   - Or create a new Coinbase account with email

3. After signing in, a **project is auto-created** for you.

---

## Step 2: Create an API Key (1 minute)

1. After signing in, you'll see the CDP Dashboard
2. Click **"API Keys"** in the top navigation bar
3. Click the **"Create API key"** button
4. A modal will appear. Fill in:
   - **Nickname:** `x402-service` (or any name you like)
   - **Signature Algorithm:** Leave as default (Ed25519 is fine)
5. Click **"Create API key"**

6. ⚠️ IMPORTANT: A modal will appear with TWO values:
   - **API Key Name** (looks like: `organizations/xxxxx/apiKeys/yyyyy`)
   - **Private Key** (a long string starting with `-----BEGIN PRIVATE KEY-----`)

7. **COPY BOTH VALUES** — the private key is ONLY shown once!
   - Click **"Download API key"** to save a JSON file, OR
   - Copy them manually to a safe place

---

## Step 3: Add Keys to Vercel (2 minutes)

1. Go to **https://vercel.com/dashboard**
2. Click your **Web-4-earn** project
3. Go to **Settings → Environment Variables**
4. Add these TWO variables:

   **Variable 1:**
   - Name: `CDP_API_KEY_NAME`
   - Value: *(paste your API Key Name, e.g. `organizations/xxxxx/apiKeys/yyyyy`)*
   - Environments: check all three

   **Variable 2:**
   - Name: `CDP_API_KEY_PRIVATE_KEY`  
   - Value: *(paste your full Private Key, including the BEGIN/END lines)*
   - Environments: check all three

5. Also update this variable:
   - Name: `FACILITATOR_URL`
   - Value: `https://api.cdp.coinbase.com/platform/v2/x402`

6. Click **Save**

---

## Step 4: Redeploy (1 minute)

1. Go to **Deployments** tab
2. Click **···** on latest deployment → **Redeploy**
3. Wait for deployment to complete

---

## Step 5: Verify (1 minute)

1. Visit: `https://your-app.vercel.app/health`
2. Check that it shows `"x402_ready": true`

---

## Step 6: Trigger Auto-Indexing on Agentic Market

After redeploying with CDP keys, the FIRST payment that goes through
the CDP facilitator will automatically index your service on Agentic Market.

**To trigger this:**
- Option A: Use a second wallet to pay for one of your endpoints (see x402-payment-client/pay.js)
- Option B: Just wait — any AI agent that finds you on x402scan and pays will trigger indexing
- Option C: Use Agentic Market's "AgentCash" test button on your x402scan listing

Once indexed, you'll appear here:
👉 **https://agentic.market**

---

## 📋 Quick Checklist

- [ ] Go to https://portal.cdp.coinbase.com → Sign in
- [ ] API Keys → Create API key → Copy Key Name + Private Key
- [ ] Vercel → Settings → Environment Variables → Add CDP_API_KEY_NAME
- [ ] Vercel → Settings → Environment Variables → Add CDP_API_KEY_PRIVATE_KEY
- [ ] Vercel → Settings → Environment Variables → Add FACILITATOR_URL = https://api.cdp.coinbase.com/platform/v2/x402
- [ ] Redeploy on Vercel
- [ ] Verify /health returns x402_ready: true
- [ ] First payment = auto-listed on Agentic Market! 🎉

---

## 💡 Also Do: Register on MCP-Hive

While you're at it, register on MCP-Hive too:

1. Go to **https://mcp-hive.com/register**
2. Sign up with **GitHub** (your dacdoyx account)
3. After login, go to Provider Dashboard
4. Click **"Add Server"**
5. Fill in:
   - Name: `x402 GitHub & NPM Stats`
   - Description: `Real-time GitHub trending repos, repo analytics, npm download stats, Hacker News stories, and DeFi yield data for AI agents. Pay per request via x402.`
   - Category: `Data`
   - Pricing: Per-request ($0.01-0.02 USDC)
   - MCP Config: Point to your Vercel URL
6. Submit for review (usually approved within 24 hours)
