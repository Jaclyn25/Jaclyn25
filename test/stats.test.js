import test from 'node:test';
import assert from 'node:assert/strict';
import { collectStats, createGitHubClient } from '../lib/stats.js';
import { makeHandler } from '../api/stats.js';
import { calculateRank } from '../lib/rank.js';

const now = new Date('2026-10-17T12:00:00Z');
function initial() {
  return {
    viewer: { login: 'Jaclyn25' },
    user: {
      createdAt: '2025-03-03T00:00:00Z',
      contributionsCollection: { contributionCalendar: { totalContributions: 3150 }, totalPullRequestReviewContributions: 2 },
      followers: { totalCount: 10 },
      pullRequests: { totalCount: 19 }, issues: { totalCount: 7 },
      repositories: { totalCount: 101, nodes: [{ stargazerCount: 2 }], pageInfo: { hasNextPage: true, endCursor: 'page2' } },
    },
  };
}
function responseMock() {
  return { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body; } };
}

test('uses all-time commit search independently of calendar contributions and paginates stars', async () => {
  const calls = [];
  const results = [initial(), { user: { repositories: { nodes: [{ stargazerCount: 4 }], pageInfo: { hasNextPage: false } } } }, { user: { y0: { totalCommitContributions: 1800 }, y1: { totalCommitContributions: 1400 } } }];
  const github = async (query, variables) => { calls.push({ query, variables }); return results.shift(); };
  github.countCommits = async username => { assert.equal(username, 'Jaclyn25'); return 3200; };
  const stats = await collectStats(github, 'Jaclyn25', now);
  const { rank, ...totals } = stats;
  assert.deepEqual(totals, { stars: 6, commits: 3200, contributionsLastYear: 3150, prs: 19, issues: 7, repositories: 101, updatedAt: now.toISOString() });
  assert.ok(Number.isFinite(rank.percentile));
  assert.equal(calls[1].variables.after, 'page2');
  assert.equal(calls.length, 2);
});

test('commit search authenticates and uses total_count beyond the 1000-item search limit', async () => {
  const github = createGitHubClient('secret', async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/search/commits');
    assert.equal(parsed.searchParams.get('q'), 'author:Jaclyn25');
    assert.equal(options.headers.Authorization, 'Bearer secret');
    return { ok: true, json: async () => ({ total_count: 3200, incomplete_results: false, items: [{}] }) };
  });
  assert.equal(await github.countCommits('Jaclyn25'), 3200);
});

test('zero commit totals are valid', async () => {
  const github = createGitHubClient('secret', async () => ({ ok: true, json: async () => ({ total_count: 0, incomplete_results: false }) }));
  assert.equal(await github.countCommits('Jaclyn25'), 0);
});

test('incomplete commit searches fail instead of publishing a partial total', async () => {
  const github = createGitHubClient('secret', async () => ({ ok: true, json: async () => ({ total_count: 423, incomplete_results: true }) }));
  await assert.rejects(github.countCommits('Jaclyn25'), /Incomplete commit search/);
});

test('rejects tokens belonging to another user', async () => {
  const data = initial(); data.viewer.login = 'someone-else';
  await assert.rejects(collectStats(async () => data, 'Jaclyn25', now), /profile owner/);
});

test('rejects partial GraphQL results rather than publishing incomplete totals', async () => {
  const github = createGitHubClient('secret', async () => ({ ok: true, json: async () => ({ data: {}, errors: [{ message: 'private-name' }] }) }));
  await assert.rejects(github('query {}'), /Incomplete/);
});

test('failure card never leaks token or GitHub error details and cannot be cached', async () => {
  const res = responseMock();
  const handler = makeHandler({ env: { GITHUB_TOKEN: 'secret-token' }, fetcher: async () => { throw new Error('secret-token private-repo'); } });
  await handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.doesNotMatch(res.body, /secret-token|private-repo/);
});

test('successful card exposes aggregates only and requests a five-minute CDN cache', async () => {
  const data = initial(); data.user.repositories.pageInfo.hasNextPage = false;
  const responses = [data, { user: { y0: { totalCommitContributions: 1000 }, y1: { totalCommitContributions: 2000 } } }];
  const res = responseMock();
  await makeHandler({ env: { GITHUB_TOKEN: 'secret-token' }, now: () => now, fetcher: async url => ({ ok: true, json: async () => url.includes('/search/commits') ? { total_count: 3000, incomplete_results: false } : { data: responses.shift() } }) })({ method: 'GET', url: '/api/stats?username=someone-else' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Vercel-CDN-Cache-Control'], 'public, s-maxage=300');
  assert.match(res.body, /3,000/);
  assert.match(res.body, /Contributions \(last year\)/);
  assert.match(res.body, /3,150/);
  assert.match(res.body, /Activity grade/);
  assert.doesNotMatch(res.body, /secret-token|someone-else|stargazerCount/);
});

test('activity grade improves with activity and supports the full grade range', () => {
  const empty = calculateRank({});
  assert.equal(empty.level, 'C');
  assert.equal(empty.percentile, 100);
  const strong = calculateRank({ commits: 100000, prs: 10000, issues: 10000, reviews: 10000, stars: 100000, followers: 100000 });
  assert.equal(strong.level, 'S');
  assert.ok(strong.percentile < calculateRank({ commits: 1000, prs: 50 }).percentile);
});

test('blocks non-read methods before calling GitHub', async () => {
  const res = responseMock();
  await makeHandler({ fetcher: () => { throw new Error('must not call'); } })({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET, HEAD');
});
