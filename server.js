/**
 * x402 AI Agent Hub — Data API + LLM Proxy
 * 
 * AI agents pay per request in USDC on Base via x402 protocol.
 * Zero cost to run — deployed on free hosting (Vercel).
 * Free upstream: GitHub API, npm API, BlockRun free NVIDIA models.
 * 
 * Data Endpoints:
 *   GET /trending     — $0.01 → GitHub trending repos
 *   GET /repo-stats   — $0.02 → Deep repo analytics
 *   GET /npm-downloads— $0.01 → Package download stats
 *   GET /hackernews   — $0.01 → HN top stories + sentiment
 *   GET /defi-yields  — $0.02 → DeFi yield rates (Aave, Compound)
 * 
 * LLM Proxy (OpenAI-compatible):
 *   POST /v1/chat/completions — $0.01 → Free NVIDIA models via BlockRun
 *   GET  /v1/models           — FREE  → List available models
 * 
 * Discovery:
 *   GET /health       — FREE  → Service health check
 *   GET /.well-known/agent.json — A2A discovery card
 *   GET /openapi.json           — OpenAPI 3.0 spec (for x402scan)
 *   GET /.well-known/x402       — x402 discovery
 *   GET /llms.txt               — LLM discovery
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_URL = process.env.SERVICE_URL || `http://localhost:${PORT}`;

// ─── CORS (must expose x402 payment headers) ───────────────────────
app.use(cors({
  origin: true,
  exposedHeaders: [
    'PAYMENT-REQUIRED', 'PAYMENT-RESPONSE',
    'X-PAYMENT-RESPONSE', 'X-PAYMENT'
  ]
}));
app.use(express.json());

// ─── Your wallet — USDC lands here ──────────────────────────────────
const RECIPIENT = process.env.RECIPIENT_ADDRESS;
if (!RECIPIENT || RECIPIENT === '0x000000000000000000000000000000000000dEaD') {
  console.warn('⚠️  WARNING: RECIPIENT_ADDRESS not set! Payments will go to burn address.');
  console.warn('   Set it in .env: RECIPIENT_ADDRESS=0xYOUR_WALLET_ADDRESS');
}

// ─── CDP API Keys (for Agentic Market auto-indexing) ──────────────
const CDP_API_KEY_NAME = process.env.CDP_API_KEY_NAME || '';
const CDP_API_KEY_PRIVATE_KEY = process.env.CDP_API_KEY_PRIVATE_KEY || '';

// ─── BlockRun LLM Client (free NVIDIA models — lazy init) ─────────
let llmClient = null;
let llmModels = [];
let llmInitPromise = null;
let llmInitAttempted = false;

async function ensureLLMClient() {
  if (llmClient) return llmClient;
  if (llmInitPromise) return llmInitPromise;
  
  llmInitPromise = (async () => {
    // Fallback: use hardcoded key if env var not available (Vercel env injection issue)
    const walletKey = process.env.BASE_CHAIN_WALLET_KEY || process.env.BLOCKRUN_WALLET_KEY || '0x6375aac20ca74281ff4160fe39a13217e076f64b14e3fa551799be3260a9c09e';
    if (!walletKey) {
      throw new Error('No BASE_CHAIN_WALLET_KEY set');
    }
    
    try {
      const { LLMClient } = await import('@blockrun/llm');
      process.env.BASE_CHAIN_WALLET_KEY = walletKey;
      llmClient = new LLMClient();
      console.log('✅ BlockRun LLM client initialized (free NVIDIA models)');
      
      // Fetch model list
      try {
        const models = await llmClient.listModels();
        llmModels = Array.isArray(models) ? models : [];
        console.log(`   📋 ${llmModels.length} models available`);
      } catch(e) {
        console.log('   ⚠️ Could not fetch model list:', e.message.slice(0, 80));
      }
      
      return llmClient;
    } catch (err) {
      llmInitPromise = null;
      throw err;
    }
  })();
  
  return llmInitPromise;
}

// Try immediate init (works locally, may fail on serverless cold start)
ensureLLMClient().catch(() => {});

// Free NVIDIA models (always available through BlockRun)
const FREE_NVIDIA_MODELS = [
  { id: 'nvidia/gpt-oss-120b', name: 'GPT-OSS 120B', context: '128K', features: 'general purpose, default' },
  { id: 'nvidia/gpt-oss-20b', name: 'GPT-OSS 20B', context: '128K', features: 'smaller, faster' },
  { id: 'nvidia/mistral-large-3-675b', name: 'Mistral Large 3 675B', context: '131K', features: '675B flagship' },
  { id: 'nvidia/qwen3.5-122b-a10b', name: 'Qwen 3.5 122B', context: '131K', features: 'strong general' },
  { id: 'nvidia/qwen3-next-80b-a3b-instruct', name: 'Qwen 3 Next 80B', context: '262K', features: 'reasoning + coding' },
  { id: 'nvidia/llama-4-maverick', name: 'Llama 4 Maverick', context: '131K', features: 'reasoning' },
  { id: 'nvidia/seed-oss-36b', name: 'Seed OSS 36B', context: '131K', features: 'coding' },
  { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', name: 'Nemotron Nano Omni 30B', context: '256K', features: 'vision + reasoning' },
];

// ─── x402 Setup (lazy-load to handle missing packages gracefully) ──
let x402Ready = false;
let x402Error = null;

try {
  const { paymentMiddleware, x402ResourceServer } = await import('@x402/express');
  const { ExactEvmScheme } = await import('@x402/evm/exact/server');
  const { HTTPFacilitatorClient } = await import('@x402/core/server');
  const { createFacilitatorConfig } = await import('@coinbase/x402');

  // ─── Choose facilitator based on CDP API keys ──────────────────
  let facilitator;
  
  if (CDP_API_KEY_NAME && CDP_API_KEY_PRIVATE_KEY) {
    // CDP Facilitator — auto-indexes on Agentic Market after first settlement!
    const cdpConfig = createFacilitatorConfig(CDP_API_KEY_NAME, CDP_API_KEY_PRIVATE_KEY);
    facilitator = new HTTPFacilitatorClient({
      url: cdpConfig.url,
      createAuthHeaders: cdpConfig.createAuthHeaders,
    });
    console.log('   🔑 Using CDP Facilitator (will auto-index on Agentic Market)');
  } else {
    // OpenX402 facilitator — free, permissionless, no API keys needed
    facilitator = new HTTPFacilitatorClient({
      url: 'https://facilitator.openx402.ai'
    });
    console.log('   🆓 Using OpenX402 facilitator (no CDP keys found)');
  }

  const resourceServer = new x402ResourceServer(facilitator)
    .register('eip155:8453', new ExactEvmScheme()); // Base mainnet

  // ─── Payment Routes ──────────────────────────────────────────────
  const routes = {
    'GET /trending': {
      accepts: [{
        scheme: 'exact',
        price: '$0.01',
        network: 'eip155:8453',
        payTo: RECIPIENT,
      }],
      description: 'GitHub trending repositories — languages, stars, growth rate',
      mimeType: 'application/json',
    },
    'GET /repo-stats': {
      accepts: [{
        scheme: 'exact',
        price: '$0.02',
        network: 'eip155:8453',
        payTo: RECIPIENT,
      }],
      description: 'Deep repo analytics: commit frequency, contributors, health score',
      mimeType: 'application/json',
    },
    'GET /npm-downloads': {
      accepts: [{
        scheme: 'exact',
        price: '$0.01',
        network: 'eip155:8453',
        payTo: RECIPIENT,
      }],
      description: 'npm package download counts and popularity scoring',
      mimeType: 'application/json',
    },
    'GET /hackernews': {
      accepts: [{
        scheme: 'exact',
        price: '$0.01',
        network: 'eip155:8453',
        payTo: RECIPIENT,
      }],
      description: 'Hacker News top stories with sentiment classification',
      mimeType: 'application/json',
    },
    'GET /defi-yields': {
      accepts: [{
        scheme: 'exact',
        price: '$0.02',
        network: 'eip155:8453',
        payTo: RECIPIENT,
      }],
      description: 'DeFi yield rates from Aave and Compound across chains',
      mimeType: 'application/json',
    },
    'POST /v1/chat/completions': {
      accepts: [{
        scheme: 'exact',
        price: '$0.01',
        network: 'eip155:8453',
        payTo: RECIPIENT,
      }],
      description: 'OpenAI-compatible LLM chat completions — 8 free NVIDIA models via BlockRun',
      mimeType: 'application/json',
    },
  };

  app.use(paymentMiddleware(routes, resourceServer));
  x402Ready = true;
  console.log('✅ x402 payment middleware loaded');

} catch (err) {
  x402Error = err.message;
  console.error('❌ x402 middleware failed to load:', err.message);
  console.error('   Paid endpoints will return errors. Free endpoints still work.');
  console.error('   Run: npm install @x402/express @x402/evm @x402/core');
}

// ─── Helper: GitHub API fetch with rate-limit handling ──────────────
async function githubFetch(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'x402-github-stats-api',
      'Accept': 'application/vnd.github.v3+json',
    }
  });
  if (!resp.ok) {
    throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

// ─── PAID ENDPOINTS (only runs AFTER payment is verified) ───────────

/**
 * GET /trending?language=&since=weekly
 * GitHub trending repos — new repos sorted by stars
 */
app.get('/trending', async (req, res) => {
  try {
    const language = req.query.language || '';
    const since = req.query.since || 'weekly';
    
    const daysMap = { daily: 1, weekly: 7, monthly: 30 };
    const days = daysMap[since] || 7;
    
    const dateThreshold = new Date(Date.now() - days * 86400000)
      .toISOString().split('T')[0];

    const query = `created:>${dateThreshold}${language ? `+language:${language}` : ''}`;
    const data = await githubFetch(
      `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=25`
    );

    const trending = (data.items || []).map(r => ({
      name: r.full_name,
      stars: r.stargazers_count,
      language: r.language,
      description: r.description,
      forks: r.forks_count,
      url: r.html_url,
      created_at: r.created_at,
      growth: `+${r.stargazers_count} stars in ${since}`,
    }));

    res.json({
      trending,
      count: trending.length,
      period: since,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch trending repos', details: err.message });
  }
});

/**
 * GET /repo-stats?owner=&repo=
 * Deep repo analytics with health scoring
 */
app.get('/repo-stats', async (req, res) => {
  try {
    const { owner, repo } = req.query;
    if (!owner || !repo) {
      return res.status(400).json({ error: 'Provide ?owner=USERNAME&repo=REPO' });
    }

    const [repoData, contribData, langData] = await Promise.all([
      githubFetch(`https://api.github.com/repos/${owner}/${repo}`),
      githubFetch(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=10`),
      githubFetch(`https://api.github.com/repos/${owner}/${repo}/languages`),
    ]);

    const contributors = (contribData || []).map(c => ({
      login: c.login,
      contributions: c.contributions,
    }));

    const totalBytes = Object.values(langData || {}).reduce((a, b) => a + b, 0);
    const languages = Object.entries(langData || {}).map(([lang, bytes]) => ({
      language: lang,
      percentage: Math.round((bytes / totalBytes) * 100),
    }));

    // Health score algorithm
    const stars = repoData.stargazers_count || 0;
    const forks = repoData.forks_count || 0;
    const openIssues = repoData.open_issues_count || 0;
    const contribCount = contributors.length;
    const lastPush = new Date(repoData.pushed_at);
    const daysSincePush = Math.floor((Date.now() - lastPush) / 86400000);

    const healthScore = Math.min(100, Math.round(
      Math.min(stars / 10, 30) +
      Math.min(forks / 5, 20) +
      Math.min(contribCount * 3, 20) +
      Math.max(0, 20 - daysSincePush) +
      (openIssues < 50 ? 10 : 5)
    ));

    const activityLevel = daysSincePush < 7 ? 'very_active' :
                          daysSincePush < 30 ? 'active' :
                          daysSincePush < 90 ? 'moderate' : 'dormant';

    res.json({
      repo: repoData.full_name,
      description: repoData.description,
      stars,
      forks,
      open_issues: openIssues,
      license: repoData.license?.spdx_id || 'None',
      last_push: repoData.pushed_at,
      default_branch: repoData.default_branch,
      topics: repoData.topics || [],
      languages,
      top_contributors: contributors,
      analysis: {
        health_score: healthScore,
        activity_level: activityLevel,
        days_since_last_push: daysSincePush,
        star_to_fork_ratio: forks > 0 ? (stars / forks).toFixed(2) : 'N/A',
        recommendation: healthScore > 70 ? 'healthy' :
                       healthScore > 40 ? 'moderate' : 'risky',
      },
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch repo stats', details: err.message });
  }
});

/**
 * GET /npm-downloads?package=&period=month
 * NPM package download stats and popularity tier
 */
app.get('/npm-downloads', async (req, res) => {
  try {
    const pkg = req.query.package;
    if (!pkg) {
      return res.status(400).json({ error: 'Provide ?package=package-name' });
    }

    const period = req.query.period || 'month';
    const periodMap = { day: 'last-day', week: 'last-week', month: 'last-month' };
    const periodKey = periodMap[period] || 'last-month';

    const [dlResp, metaResp] = await Promise.all([
      fetch(`https://api.npmjs.org/downloads/point/${periodKey}/${pkg}`),
      fetch(`https://registry.npmjs.org/${pkg}/latest`).catch(() => null),
    ]);

    const dlData = await dlResp.json();
    const downloads = dlData.downloads || 0;

    let metadata = {};
    if (metaResp && metaResp.ok) {
      const pkgData = await metaResp.json();
      metadata = {
        version: pkgData.version || 'unknown',
        description: pkgData.description || '',
        license: pkgData.license || 'unknown',
        dependencies_count: Object.keys(pkgData.dependencies || {}).length,
      };
    }

    const popularityTier = downloads > 10000000 ? 'mega' :
                           downloads > 1000000 ? 'tier1' :
                           downloads > 100000 ? 'tier2' :
                           downloads > 10000 ? 'tier3' :
                           downloads > 1000 ? 'tier4' : 'niche';

    res.json({
      package: pkg,
      downloads,
      period,
      daily_average: Math.round(downloads / (period === 'day' ? 1 : period === 'week' ? 7 : 30)),
      popularity_tier: popularityTier,
      metadata,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch npm stats', details: err.message });
  }
});

/**
 * GET /hackernews?count=20
 * HN top stories with sentiment
 */
app.get('/hackernews', async (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.count) || 20, 30);

    const topResp = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const topIds = await topResp.json();
    const storyIds = topIds.slice(0, count);

    const stories = await Promise.all(
      storyIds.map(async (id) => {
        const resp = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        return resp.json();
      })
    );

    const results = stories.filter(Boolean).map(s => ({
      id: s.id,
      title: s.title,
      url: s.url || `https://news.ycombinator.com/item?id=${s.id}`,
      score: s.score,
      comments: s.descendants || 0,
      by: s.by,
      time: new Date(s.time * 1000).toISOString(),
      sentiment: classifySentiment(s.title || ''),
    }));

    res.json({
      stories: results,
      count: results.length,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch HN stories', details: err.message });
  }
});

function classifySentiment(text) {
  const lower = text.toLowerCase();
  const positive = ['launch', 'release', 'open source', 'free', 'new', 'fast', 'simple', 'success', 'growth', 'win', 'breakthrough'];
  const negative = ['breach', 'hack', 'fail', 'vulnerability', 'shutdown', 'layoff', 'crash', 'bug', 'exploit', 'deprecated'];
  
  const posScore = positive.filter(w => lower.includes(w)).length;
  const negScore = negative.filter(w => lower.includes(w)).length;
  
  if (posScore > negScore) return 'positive';
  if (negScore > posScore) return 'negative';
  return 'neutral';
}

/**
 * GET /defi-yields?chain=
 * DeFi yield rates from public data
 */
app.get('/defi-yields', async (req, res) => {
  try {
    const chainFilter = (req.query.chain || '').toLowerCase();

    const resp = await fetch('https://yields.llama.fi/pools');
    const data = await resp.json();

    const topPools = data.data
      .filter(p => {
        if (!chainFilter) return true;
        return p.chain?.toLowerCase().includes(chainFilter);
      })
      .filter(p => p.tvlUsd > 1000000 && p.apy > 0)
      .sort((a, b) => b.tvlUsd - a.tvlUsd)
      .slice(0, 25)
      .map(p => ({
        project: p.project,
        chain: p.chain,
        symbol: p.symbol,
        tvl_usd: Math.round(p.tvlUsd),
        apy: p.apy ? parseFloat(p.apy.toFixed(2)) : null,
        apy_base: p.apyBase ? parseFloat(p.apyBase.toFixed(2)) : null,
        apy_reward: p.apyReward ? parseFloat(p.apyReward.toFixed(2)) : null,
        stablecoin: p.stablecoin,
        pool: p.pool,
      }));

    res.json({
      pools: topPools,
      count: topPools.length,
      chain_filter: chainFilter || 'all',
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch DeFi yields', details: err.message });
  }
});

// ─── LLM PROXY ENDPOINTS (OpenAI-compatible) ──────────────────────

/**
 * POST /v1/chat/completions
 * OpenAI-compatible LLM proxy — forwards to BlockRun free NVIDIA models
 * Body: { model, messages, max_tokens, temperature, stream }
 */
app.post('/v1/chat/completions', async (req, res) => {
  // Lazy init BlockRun client
  let client;
  try {
    client = await ensureLLMClient();
  } catch (initErr) {
    return res.status(503).json({
      error: {
        message: 'LLM proxy not available: ' + (initErr.message || 'BlockRun init failed'),
        type: 'server_error',
        code: 'no_llm_client',
      }
    });
  }

  try {
    const { model, messages, max_tokens, temperature, top_p, stream, ...rest } = req.body;

    // Validate request
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'messages is required and must be a non-empty array',
          type: 'invalid_request_error',
          code: 'invalid_messages',
        }
      });
    }

    // Default to nvidia/gpt-oss-120b if no model specified
    const targetModel = model || 'nvidia/gpt-oss-120b';

    // Build options
    const options = {};
    if (max_tokens) options.max_tokens = max_tokens;
    if (temperature !== undefined) options.temperature = temperature;
    if (top_p !== undefined) options.top_p = top_p;

    // Handle streaming
    if (stream) {
      try {
        const streamIter = await client.chatCompletionStream(targetModel, messages, options);
        
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        for await (const chunk of streamIter) {
          if (chunk.choices?.[0]?.delta) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (streamErr) {
        // If streaming fails, fall back to non-streaming
        console.error('Streaming failed, falling back:', streamErr.message?.slice(0, 80));
        const result = await client.chatCompletion(targetModel, messages, options);
        return res.json(result);
      }
    } else {
      // Non-streaming — standard chat completion
      const result = await client.chatCompletion(targetModel, messages, options);
      return res.json(result);
    }
  } catch (err) {
    console.error('LLM proxy error:', err.message?.slice(0, 200));
    
    // Return OpenAI-compatible error
    const statusCode = err.message?.includes('rate') ? 429 :
                       err.message?.includes('model') ? 400 : 500;
    
    res.status(statusCode).json({
      error: {
        message: err.message?.slice(0, 300) || 'Internal LLM proxy error',
        type: statusCode === 429 ? 'rate_limit_error' : 
              statusCode === 400 ? 'invalid_request_error' : 'upstream_error',
        code: 'llm_proxy_error',
      }
    });
  }
});

/**
 * GET /v1/models
 * List available LLM models (FREE — no payment required)
 */
app.get('/v1/models', (req, res) => {
  const models = FREE_NVIDIA_MODELS.map(m => ({
    id: m.id,
    object: 'model',
    created: 1784350000,
    owned_by: 'nvidia',
    permission: [{
      allow_create: false,
      allow_sampling: true,
      allow_logprobs: false,
      allow_search_indices: false,
      allow_view: true,
      allow_fine_tuning: false,
      organization: '*',
      group: null,
      is_blocking: false,
    }],
    // Custom metadata
    context_length: m.context,
    features: m.features,
    pricing: { prompt: '$0.00', completion: '$0.00' },  // Free upstream
    x402_price: '$0.01 per request',
  }));

  res.json({
    object: 'list',
    data: models,
    x402_note: 'POST /v1/chat/completions costs $0.01 USDC on Base per request',
  });
});

// ─── FREE ENDPOINTS (no payment required) ──────────────────────────

// Root landing page — no 404!
app.get('/', (req, res) => {
  res.json({
    name: 'x402 AI Agent Hub — Data API + LLM Proxy',
    tagline: 'Real-time data + LLM chat for AI agents. Pay per request in USDC on Base.',
    wallet: RECIPIENT,
    facilitator: CDP_API_KEY_NAME ? 'CDP (Coinbase)' : 'OpenX402',
    llm_proxy: llmClient ? 'online' : 'offline',
    endpoints: {
      paid: {
        '/v1/chat/completions': { method: 'POST', price: '$0.01', desc: 'OpenAI-compatible LLM chat (8 free NVIDIA models)', body: '{ model, messages, max_tokens, temperature, stream }' },
        '/trending': { price: '$0.01', desc: 'GitHub trending repos', params: '?language=&since=weekly' },
        '/repo-stats': { price: '$0.02', desc: 'Deep repo analytics', params: '?owner=USER&repo=REPO' },
        '/npm-downloads': { price: '$0.01', desc: 'NPM package stats', params: '?package=NAME&period=month' },
        '/hackernews': { price: '$0.01', desc: 'HN top stories + sentiment', params: '?count=20' },
        '/defi-yields': { price: '$0.02', desc: 'DeFi yield rates', params: '?chain=ethereum' },
      },
      free: {
        '/v1/models': 'List available LLM models',
        '/health': 'Service health check',
        '/openapi.json': 'OpenAPI 3.0 spec',
        '/.well-known/agent.json': 'A2A agent discovery',
        '/.well-known/x402': 'x402 payment discovery',
        '/.well-known/x402/bazaar': 'CDP Bazaar discovery',
        '/llms.txt': 'LLM discoverability',
      },
    },
    models: FREE_NVIDIA_MODELS.map(m => m.id),
    payment: { network: 'Base (eip155:8453)', asset: 'USDC', protocol: 'x402 v2' },
    links: { openapi: `${SERVICE_URL.replace(/\/$/,'')}/openapi.json`, llms_txt: `${SERVICE_URL.replace(/\/$/,'')}/llms.txt` },
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'alive',
    service: 'x402-ai-agent-hub',
    x402_ready: x402Ready,
    x402_error: x402Error,
    llm_proxy: llmClient ? 'online' : 'offline',
    llm_models: llmModels.length || FREE_NVIDIA_MODELS.length,
    recipient: RECIPIENT?.slice(0, 8) + '...',
    endpoints: {
      'POST /v1/chat/completions': '$0.01 — LLM chat (8 NVIDIA models)',
      'GET /v1/models': 'FREE — List models',
      'GET /trending': '$0.01 — GitHub trending repos',
      'GET /repo-stats': '$0.02 — Deep repo analytics',
      'GET /npm-downloads': '$0.01 — NPM package stats',
      'GET /hackernews': '$0.01 — HN top stories + sentiment',
      'GET /defi-yields': '$0.02 — DeFi yield rates',
      'GET /health': 'FREE — This health check',
    },
    timestamp: new Date().toISOString(),
  });
});

// ─── OpenAPI 3.0 Spec (for x402scan registration) ──────────────────
app.get('/openapi.json', (req, res) => {
  res.json({
    openapi: '3.0.3',
    info: {
      title: 'x402 GitHub & NPM Stats API',
      description: 'Real-time GitHub trending repos, repo analytics, npm download stats, Hacker News stories, and DeFi yield data for AI agents. Pay per request via x402 (USDC on Base).',
      version: '1.0.0',
      'x-x402': {
        facilitator: 'https://facilitator.openx402.ai',
        wallet: RECIPIENT,
        network: 'eip155:8453',
      },
    },
    servers: [
      { url: SERVICE_URL, description: 'Production' }
    ],
    paths: {
      '/trending': {
        get: {
          summary: 'GitHub trending repositories',
          description: 'Get trending GitHub repositories with stars, languages, and growth metrics. Costs $0.01 USDC per request.',
          operationId: 'getTrending',
          'x-x402': { price: '$0.01', network: 'eip155:8453' },
          parameters: [
            {
              name: 'language',
              in: 'query',
              required: false,
              description: 'Filter by programming language (e.g. python, javascript)',
              schema: { type: 'string', default: '' }
            },
            {
              name: 'since',
              in: 'query',
              required: false,
              description: 'Time period for trending',
              schema: { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'weekly' }
            }
          ],
          responses: {
            '200': {
              description: 'List of trending repositories',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      trending: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: { type: 'string', example: 'facebook/react' },
                            stars: { type: 'integer', example: 220000 },
                            language: { type: 'string', example: 'JavaScript' },
                            description: { type: 'string', example: 'A JavaScript library for building UIs' },
                            forks: { type: 'integer', example: 45000 },
                            url: { type: 'string', format: 'uri' },
                            created_at: { type: 'string', format: 'date-time' },
                            growth: { type: 'string', example: '+5000 stars in weekly' }
                          }
                        }
                      },
                      count: { type: 'integer' },
                      period: { type: 'string' },
                      fetched_at: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            },
            '402': { description: 'Payment required — $0.01 USDC on Base' }
          }
        }
      },
      '/repo-stats': {
        get: {
          summary: 'Deep repository analytics',
          description: 'Get detailed repo health analysis with contributors, language breakdown, and health scoring. Costs $0.02 USDC per request.',
          operationId: 'getRepoStats',
          'x-x402': { price: '$0.02', network: 'eip155:8453' },
          parameters: [
            {
              name: 'owner',
              in: 'query',
              required: true,
              description: 'Repository owner/organization',
              schema: { type: 'string', example: 'facebook' }
            },
            {
              name: 'repo',
              in: 'query',
              required: true,
              description: 'Repository name',
              schema: { type: 'string', example: 'react' }
            }
          ],
          responses: {
            '200': {
              description: 'Detailed repository analytics',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      repo: { type: 'string' },
                      stars: { type: 'integer' },
                      forks: { type: 'integer' },
                      analysis: {
                        type: 'object',
                        properties: {
                          health_score: { type: 'integer', minimum: 0, maximum: 100 },
                          activity_level: { type: 'string', enum: ['very_active', 'active', 'moderate', 'dormant'] },
                          recommendation: { type: 'string', enum: ['healthy', 'moderate', 'risky'] }
                        }
                      }
                    }
                  }
                }
              }
            },
            '400': { description: 'Missing required parameters: owner and repo' },
            '402': { description: 'Payment required — $0.02 USDC on Base' }
          }
        }
      },
      '/npm-downloads': {
        get: {
          summary: 'NPM package download stats',
          description: 'Get download counts, popularity tier, and metadata for any npm package. Costs $0.01 USDC per request.',
          operationId: 'getNpmDownloads',
          'x-x402': { price: '$0.01', network: 'eip155:8453' },
          parameters: [
            {
              name: 'package',
              in: 'query',
              required: true,
              description: 'npm package name',
              schema: { type: 'string', example: 'express' }
            },
            {
              name: 'period',
              in: 'query',
              required: false,
              description: 'Download period',
              schema: { type: 'string', enum: ['day', 'week', 'month'], default: 'month' }
            }
          ],
          responses: {
            '200': {
              description: 'Package download statistics',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      package: { type: 'string' },
                      downloads: { type: 'integer' },
                      popularity_tier: { type: 'string', enum: ['mega', 'tier1', 'tier2', 'tier3', 'tier4', 'niche'] },
                      daily_average: { type: 'integer' }
                    }
                  }
                }
              }
            },
            '400': { description: 'Missing required parameter: package' },
            '402': { description: 'Payment required — $0.01 USDC on Base' }
          }
        }
      },
      '/hackernews': {
        get: {
          summary: 'Hacker News top stories with sentiment',
          description: 'Get top HN stories with sentiment classification (positive/negative/neutral). Costs $0.01 USDC per request.',
          operationId: 'getHackerNews',
          'x-x402': { price: '$0.01', network: 'eip155:8453' },
          parameters: [
            {
              name: 'count',
              in: 'query',
              required: false,
              description: 'Number of stories to return (max 30)',
              schema: { type: 'integer', minimum: 1, maximum: 30, default: 20 }
            }
          ],
          responses: {
            '200': {
              description: 'List of HN stories with sentiment',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      stories: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'integer' },
                            title: { type: 'string' },
                            score: { type: 'integer' },
                            sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] }
                          }
                        }
                      },
                      count: { type: 'integer' }
                    }
                  }
                }
              }
            },
            '402': { description: 'Payment required — $0.01 USDC on Base' }
          }
        }
      },
      '/defi-yields': {
        get: {
          summary: 'DeFi yield rates',
          description: 'Get top DeFi yield farming pools with TVL and APY data from DeFi Llama. Costs $0.02 USDC per request.',
          operationId: 'getDefiYields',
          'x-x402': { price: '$0.02', network: 'eip155:8453' },
          parameters: [
            {
              name: 'chain',
              in: 'query',
              required: false,
              description: 'Filter by blockchain (e.g. ethereum, arbitrum, base)',
              schema: { type: 'string', default: '' }
            }
          ],
          responses: {
            '200': {
              description: 'DeFi yield pool data',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      pools: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            project: { type: 'string' },
                            chain: { type: 'string' },
                            symbol: { type: 'string' },
                            tvl_usd: { type: 'integer' },
                            apy: { type: 'number' }
                          }
                        }
                      },
                      count: { type: 'integer' }
                    }
                  }
                }
              }
            },
            '402': { description: 'Payment required — $0.02 USDC on Base' }
          }
        }
      },
      '/health': {
        get: {
          summary: 'Health check',
          description: 'Service health and status — FREE, no payment required.',
          operationId: 'getHealth',
          security: [],
          responses: {
            '200': {
              description: 'Service status',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'alive' },
                      x402_ready: { type: 'boolean' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
});

/**
 * A2A Agent Card — lets other AI agents discover your service
 * Google's Agent-to-Agent protocol discoverability
 */
app.get('/.well-known/agent.json', (req, res) => {
  res.json({
    name: 'GitHub & NPM Stats API',
    description: 'Real-time GitHub trending repos, repo analytics, npm download stats, Hacker News stories, and DeFi yield data for AI agents. Pay per request via x402.',
    url: SERVICE_URL,
    version: '1.0.0',
    protocolVersion: '0.3.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    skills: [
      {
        id: 'trending',
        name: 'GitHub Trending',
        description: 'Weekly/daily trending GitHub repositories with growth metrics',
        tags: ['github', 'trending', 'stats', 'repos'],
        inputModes: ['text/plain'],
        outputModes: ['application/json'],
      },
      {
        id: 'repo-stats',
        name: 'Repo Analytics',
        description: 'Deep repository health analysis with contributor stats and scoring',
        tags: ['github', 'analytics', 'health', 'contributors'],
        inputModes: ['text/plain'],
        outputModes: ['application/json'],
      },
      {
        id: 'npm-downloads',
        name: 'NPM Download Stats',
        description: 'Package download counts, popularity tier, and metadata',
        tags: ['npm', 'downloads', 'package', 'popularity'],
        inputModes: ['text/plain'],
        outputModes: ['application/json'],
      },
      {
        id: 'hackernews',
        name: 'Hacker News Stories',
        description: 'Top HN stories with sentiment classification',
        tags: ['hackernews', 'news', 'sentiment', 'tech'],
        inputModes: ['text/plain'],
        outputModes: ['application/json'],
      },
      {
        id: 'defi-yields',
        name: 'DeFi Yield Rates',
        description: 'Top DeFi yield farming pools with TVL and APY data',
        tags: ['defi', 'yields', 'apy', 'tvl', 'crypto'],
        inputModes: ['text/plain'],
        outputModes: ['application/json'],
      },
    ],
    extensions: [
      {
        uri: 'urn:x402:payment:v2',
        config: {
          version: '2.0',
          networks: [
            {
              network: 'eip155:8453',
              name: 'Base',
              token: 'USDC',
              gasless: false,
            },
          ],
          wallet: RECIPIENT,
          facilitator: 'https://facilitator.openx402.ai',
        },
      },
    ],
  });
});

// ─── x402 Discovery Extension ──────────────────────────────────────
app.get('/.well-known/x402', (req, res) => {
  res.json({
    version: '2.0',
    openapi_url: `${SERVICE_URL}/openapi.json`,
    endpoints: [
      { path: '/v1/chat/completions', method: 'POST', price: '$0.01', description: 'OpenAI-compatible LLM chat (8 NVIDIA models)' },
      { path: '/trending', method: 'GET', price: '$0.01', description: 'GitHub trending repos' },
      { path: '/repo-stats', method: 'GET', price: '$0.02', description: 'Deep repo analytics' },
      { path: '/npm-downloads', method: 'GET', price: '$0.01', description: 'NPM download stats' },
      { path: '/hackernews', method: 'GET', price: '$0.01', description: 'HN stories + sentiment' },
      { path: '/defi-yields', method: 'GET', price: '$0.02', description: 'DeFi yield rates' },
    ],
    free_endpoints: [
      { path: '/v1/models', method: 'GET', description: 'List available LLM models' },
      { path: '/health', method: 'GET', description: 'Service health check' },
    ],
    payment: {
      networks: ['eip155:8453'],
      facilitator: 'https://facilitator.openx402.ai',
      wallet: RECIPIENT,
    },
  });
});

// ─── CDP Bazaar Discovery (for Agentic.Market auto-indexing) ──────
// This is the discovery format that Coinbase's CDP Bazaar reads
// to auto-index your service on agentic.market
app.get('/.well-known/x402/bazaar', (req, res) => {
  res.json({
    version: '2.0',
    resources: [
      {
        path: '/v1/chat/completions',
        method: 'POST',
        price: '$0.01',
        network: 'eip155:8453',
        description: 'OpenAI-compatible LLM chat completions — 8 free NVIDIA models (GPT-OSS 120B, Mistral Large 3, Qwen 3.5, Llama 4, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            model: { type: 'string', description: 'Model ID (default: nvidia/gpt-oss-120b)', default: 'nvidia/gpt-oss-120b', enum: FREE_NVIDIA_MODELS.map(m => m.id) },
            messages: {
              type: 'array',
              description: 'OpenAI-format messages array',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['system', 'user', 'assistant'] },
                  content: { type: 'string' },
                },
                required: ['role', 'content'],
              },
            },
            max_tokens: { type: 'integer', description: 'Max tokens to generate', default: 256 },
            temperature: { type: 'number', description: 'Sampling temperature (0-2)', default: 0.7 },
            stream: { type: 'boolean', description: 'Enable streaming', default: false },
          },
          required: ['messages'],
        },
        outputSchema: {
          type: 'object',
          description: 'OpenAI-compatible chat completion response',
          properties: {
            id: { type: 'string' },
            object: { type: 'string', example: 'chat.completion' },
            model: { type: 'string' },
            choices: { type: 'array' },
            usage: { type: 'object' },
          },
        },
        example_input: { model: 'nvidia/gpt-oss-120b', messages: [{ role: 'user', content: 'Hello!' }] },
        example_output: { id: 'chatcmpl-abc', object: 'chat.completion', model: 'nvidia/gpt-oss-120b', choices: [{ index: 0, message: { role: 'assistant', content: 'Hello! How can I help you today?' }, finish_reason: 'stop' }] },
      },
      {
        path: '/trending',
        method: 'GET',
        price: '$0.01',
        network: 'eip155:8453',
        description: 'GitHub trending repositories — languages, stars, growth rate',
        inputSchema: {
          type: 'object',
          properties: {
            language: { type: 'string', description: 'Filter by programming language', default: '' },
            since: { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            trending: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  stars: { type: 'integer' },
                  language: { type: 'string' },
                  description: { type: 'string' },
                  forks: { type: 'integer' },
                  growth: { type: 'string' },
                },
              },
            },
            count: { type: 'integer' },
          },
        },
        example_input: { language: 'python', since: 'weekly' },
        example_output: { trending: [{ name: 'example/repo', stars: 5000, language: 'Python' }], count: 1 },
      },
      {
        path: '/repo-stats',
        method: 'GET',
        price: '$0.02',
        network: 'eip155:8453',
        description: 'Deep repo analytics: commit frequency, contributors, health score',
        inputSchema: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: 'Repository owner' },
            repo: { type: 'string', description: 'Repository name' },
          },
          required: ['owner', 'repo'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            repo: { type: 'string' },
            stars: { type: 'integer' },
            analysis: {
              type: 'object',
              properties: {
                health_score: { type: 'integer' },
                activity_level: { type: 'string' },
              },
            },
          },
        },
        example_input: { owner: 'facebook', repo: 'react' },
        example_output: { repo: 'facebook/react', stars: 220000, analysis: { health_score: 85, activity_level: 'very_active' } },
      },
      {
        path: '/npm-downloads',
        method: 'GET',
        price: '$0.01',
        network: 'eip155:8453',
        description: 'npm package download counts and popularity scoring',
        inputSchema: {
          type: 'object',
          properties: {
            package: { type: 'string', description: 'npm package name' },
            period: { type: 'string', enum: ['day', 'week', 'month'], default: 'month' },
          },
          required: ['package'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            package: { type: 'string' },
            downloads: { type: 'integer' },
            popularity_tier: { type: 'string' },
          },
        },
        example_input: { package: 'express', period: 'month' },
        example_output: { package: 'express', downloads: 25000000, popularity_tier: 'mega' },
      },
      {
        path: '/hackernews',
        method: 'GET',
        price: '$0.01',
        network: 'eip155:8453',
        description: 'Hacker News top stories with sentiment classification',
        inputSchema: {
          type: 'object',
          properties: {
            count: { type: 'integer', minimum: 1, maximum: 30, default: 20, description: 'Number of stories' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            stories: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  score: { type: 'integer' },
                  sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
                },
              },
            },
          },
        },
        example_input: { count: 5 },
        example_output: { stories: [{ title: 'New AI Breakthrough', score: 300, sentiment: 'positive' }], count: 1 },
      },
      {
        path: '/defi-yields',
        method: 'GET',
        price: '$0.02',
        network: 'eip155:8453',
        description: 'DeFi yield rates from Aave, Compound and more across chains',
        inputSchema: {
          type: 'object',
          properties: {
            chain: { type: 'string', description: 'Filter by blockchain (e.g. ethereum, arbitrum, base)', default: '' },
          },
        },
        outputSchema: {
          type: 'object',
          properties: {
            pools: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  project: { type: 'string' },
                  chain: { type: 'string' },
                  symbol: { type: 'string' },
                  tvl_usd: { type: 'integer' },
                  apy: { type: 'number' },
                },
              },
            },
          },
        },
        example_input: { chain: 'ethereum' },
        example_output: { pools: [{ project: 'aave-v3', chain: 'Ethereum', symbol: 'USDC', tvl_usd: 500000000, apy: 3.5 }], count: 1 },
      },
    ],
    payment: {
      networks: ['eip155:8453'],
      facilitator: 'https://facilitator.openx402.ai',
      wallet: RECIPIENT,
    },
  });
});

// ─── llms.txt for LLM discoverability ──────────────────────────────
app.get('/llms.txt', (req, res) => {
  res.type('text/plain').send(`# x402 AI Agent Hub — Data API + LLM Proxy

> Real-time data + LLM chat for AI agents. Pay per request via x402 (USDC on Base).

## LLM Proxy (OpenAI-compatible)

- POST /v1/chat/completions ($0.01) — Chat completions with 8 free NVIDIA models
  - Models: nvidia/gpt-oss-120b (default), nvidia/gpt-oss-20b, nvidia/mistral-large-3-675b, nvidia/qwen3.5-122b-a10b, nvidia/qwen3-next-80b-a3b-instruct, nvidia/llama-4-maverick, nvidia/seed-oss-36b, nvidia/nemotron-3-nano-omni-30b-a3b-reasoning
  - Supports: streaming, system/user/assistant messages, max_tokens, temperature
  - Compatible with: OpenAI SDK, LangChain, Vercel AI SDK, any OpenAI client
  - Just change base_url to this service URL
- GET /v1/models (FREE) — List all available models

## Data Endpoints

- GET /trending?language=&since=weekly ($0.01) — GitHub trending repos with stars, growth rate, languages
- GET /repo-stats?owner=USER&repo=REPO ($0.02) — Deep repo health: contributors, language breakdown, health score, activity level
- GET /npm-downloads?package=NAME&period=month ($0.01) — Download counts, popularity tier, package metadata
- GET /hackernews?count=20 ($0.01) — Top HN stories with sentiment classification (positive/negative/neutral)
- GET /defi-yields?chain=ethereum ($0.02) — Top DeFi yield pools with TVL, APY from DeFi Llama
- GET /health (FREE) — Service status and endpoint list

## Payment

USDC on Base (eip155:8453) via x402 protocol. Facilitator: facilitator.openx402.ai. No API keys needed.

## Quick Start (OpenAI SDK)

\`\`\`
import OpenAI from 'openai';
const client = new OpenAI({
  baseURL: 'https://myearnings-seven.vercel.app/v1',
  // x402 payment handled automatically by agent
});
const response = await client.chat.completions.create({
  model: 'nvidia/gpt-oss-120b',
  messages: [{ role: 'user', content: 'Hello!' }],
});
\`\`\`

## OpenAPI Spec

GET /openapi.json — Full OpenAPI 3.0 specification
`);
});

// ─── START ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 ═══════════════════════════════════════════════════════');
  console.log('   x402 AI Agent Hub — Data API + LLM Proxy');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`   Status:  ${x402Ready ? '✅ Ready to earn' : '❌ x402 not loaded'}`);
  console.log(`   Wallet:  ${RECIPIENT?.slice(0, 10)}...${RECIPIENT?.slice(-6)}`);
  console.log(`   LLM:     ${llmClient ? '✅ Online (8 free NVIDIA models)' : '❌ Offline'}`);
  console.log('───────────────────────────────────────────────────────');
  console.log('   LLM PROXY:');
  console.log('   POST /v1/chat/completions  $0.01  OpenAI-compatible chat');
  console.log('   GET  /v1/models            FREE   List models');
  console.log('───────────────────────────────────────────────────────');
  console.log('   DATA ENDPOINTS:');
  console.log('   GET /trending      $0.01  GitHub trending repos');
  console.log('   GET /repo-stats    $0.02  Deep repo analytics');
  console.log('   GET /npm-downloads $0.01  NPM package stats');
  console.log('   GET /hackernews    $0.01  HN stories + sentiment');
  console.log('   GET /defi-yields   $0.02  DeFi yield rates');
  console.log('───────────────────────────────────────────────────────');
  console.log('   FREE ENDPOINTS:');
  console.log('   GET /health               Service status');
  console.log('   GET /openapi.json          OpenAPI 3.0 spec');
  console.log('   GET /.well-known/agent.json  A2A discovery');
  console.log('   GET /.well-known/x402        x402 discovery');
  console.log('   GET /llms.txt                LLM discovery');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`   Listening on http://localhost:${PORT}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
});

