import { collectStats, createGitHubClient, renderStats, renderUnavailable } from '../lib/stats.js';

export function makeHandler({ env = process.env, fetcher = fetch, now = () => new Date() } = {}) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      res.statusCode = 405;
      return res.end();
    }
    try {
      if (!env.GITHUB_TOKEN?.trim()) throw new Error('Missing token');
      const username = env.GITHUB_USERNAME || 'Jaclyn25';
      // No query parameters select a user or repository. This token serves only
      // its owner's aggregate card; raw API responses never leave the server.
      const stats = await collectStats(createGitHubClient(env.GITHUB_TOKEN, fetcher), username, now());
      const svg = renderStats(stats);
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.setHeader('CDN-Cache-Control', 'public, s-maxage=300');
      res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=300');
      res.statusCode = 200;
      return res.end(req.method === 'HEAD' ? undefined : svg);
    } catch {
      // Never return/log upstream errors: they may contain private resource data.
      res.statusCode = 503;
      return res.end(req.method === 'HEAD' ? undefined : renderUnavailable());
    }
  };
}

export default makeHandler();
