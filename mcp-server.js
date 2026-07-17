/**
 * MCP Server for x402 GitHub & NPM Stats API
 * 
 * This file enables listing on MCP-Hive marketplace.
 * MCP-Hive connects AI agents with commercial MCP servers.
 * 
 * To submit to MCP-Hive:
 * 1. Go to https://mcp-hive.com/register
 * 2. Create an account
 * 3. Submit this server URL as an MCP provider
 * 4. Set pricing per tool invocation
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const SERVICE_URL = process.env.SERVICE_URL || 'https://myearnings-seven.vercel.app';

const server = new McpServer({
  name: 'x402 GitHub & NPM Stats',
  version: '1.0.0',
  description: 'Real-time GitHub trending repos, repo analytics, npm download stats, Hacker News stories, and DeFi yield data. Pay per request via x402 (USDC on Base).',
});

// Tool: GitHub Trending
server.tool(
  'github_trending',
  'Get trending GitHub repositories with stars, languages, and growth metrics. Costs $0.01 USDC per request via x402.',
  {
    language: z.string().optional().describe('Filter by programming language (e.g. python, javascript)'),
    since: z.enum(['daily', 'weekly', 'monthly']).optional().default('weekly').describe('Time period for trending'),
  },
  async ({ language, since }) => {
    const params = new URLSearchParams();
    if (language) params.set('language', language);
    if (since) params.set('since', since);
    
    const url = `${SERVICE_URL}/trending${params.toString() ? '?' + params : ''}`;
    const resp = await fetch(url);
    
    if (resp.status === 402) {
      return {
        content: [{
          type: 'text',
          text: `⚠️ Payment required: $0.01 USDC on Base. Use x402 client to pay. URL: ${url}`,
        }],
        isError: true,
      };
    }
    
    const data = await resp.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// Tool: Repo Stats
server.tool(
  'github_repo_stats',
  'Get deep repository analytics with health scoring, contributors, and language breakdown. Costs $0.02 USDC per request via x402.',
  {
    owner: z.string().describe('Repository owner/organization (e.g. facebook)'),
    repo: z.string().describe('Repository name (e.g. react)'),
  },
  async ({ owner, repo }) => {
    const url = `${SERVICE_URL}/repo-stats?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`;
    const resp = await fetch(url);
    
    if (resp.status === 402) {
      return {
        content: [{
          type: 'text',
          text: `⚠️ Payment required: $0.02 USDC on Base. Use x402 client to pay. URL: ${url}`,
        }],
        isError: true,
      };
    }
    
    const data = await resp.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// Tool: NPM Downloads
server.tool(
  'npm_downloads',
  'Get download counts, popularity tier, and metadata for any npm package. Costs $0.01 USDC per request via x402.',
  {
    package: z.string().describe('npm package name (e.g. express)'),
    period: z.enum(['day', 'week', 'month']).optional().default('month').describe('Download period'),
  },
  async ({ package: pkg, period }) => {
    const url = `${SERVICE_URL}/npm-downloads?package=${encodeURIComponent(pkg)}&period=${period}`;
    const resp = await fetch(url);
    
    if (resp.status === 402) {
      return {
        content: [{
          type: 'text',
          text: `⚠️ Payment required: $0.01 USDC on Base. Use x402 client to pay. URL: ${url}`,
        }],
        isError: true,
      };
    }
    
    const data = await resp.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// Tool: Hacker News
server.tool(
  'hackernews_stories',
  'Get top Hacker News stories with sentiment classification (positive/negative/neutral). Costs $0.01 USDC per request via x402.',
  {
    count: z.number().min(1).max(30).optional().default(20).describe('Number of stories to return'),
  },
  async ({ count }) => {
    const url = `${SERVICE_URL}/hackernews?count=${count}`;
    const resp = await fetch(url);
    
    if (resp.status === 402) {
      return {
        content: [{
          type: 'text',
          text: `⚠️ Payment required: $0.01 USDC on Base. Use x402 client to pay. URL: ${url}`,
        }],
        isError: true,
      };
    }
    
    const data = await resp.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// Tool: DeFi Yields
server.tool(
  'defi_yields',
  'Get top DeFi yield farming pools with TVL and APY data from DeFi Llama. Costs $0.02 USDC per request via x402.',
  {
    chain: z.string().optional().describe('Filter by blockchain (e.g. ethereum, arbitrum, base)'),
  },
  async ({ chain }) => {
    const params = new URLSearchParams();
    if (chain) params.set('chain', chain);
    const url = `${SERVICE_URL}/defi-yields${params.toString() ? '?' + params : ''}`;
    const resp = await fetch(url);
    
    if (resp.status === 402) {
      return {
        content: [{
          type: 'text',
          text: `⚠️ Payment required: $0.02 USDC on Base. Use x402 client to pay. URL: ${url}`,
        }],
        isError: true,
      };
    }
    
    const data = await resp.json();
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    };
  }
);

// Start the MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('✅ x402 GitHub & NPM Stats MCP Server running');
}

main().catch(console.error);
