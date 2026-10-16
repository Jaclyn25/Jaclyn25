import test from 'node:test';
import assert from 'node:assert/strict';
import { collectStats, createGitHubClient, yearRanges } from '../lib/stats.js';
import { makeHandler } from '../api/stats.js';

const now = new Date('2026-10-17T12:00:00Z');
function initial() {
  return {
    viewer: { login: 'Jaclyn25' },
    user: {
      createdAt: '2025-03-03T00:00:00Z',
      pullRequests: { totalCount: 19 }, issues: { totalCount: 7 },
      repositories: { totalCount: 101, nodes: [{ stargazerCount: 2 }], pageInfo: { hasNextPage: true, endCursor: 'page2' } },
    },
  };
}
function responseMock() {
  return { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(body) { this.body = body; } };
}

test('sums commit contributions across years and paginates owned repository stars', async () => {
  const calls = [];
  const results = [initial(), { user: { repositories: { nodes: [{ stargazerCount: 4 }], pageInfo: { hasNextPage: false } } } }, { user: { y0: { totalCommitContributions: 1800 }, y1: { totalCommitContributions: 1400 } } }];
  const stats = await collectStats(async (query, variables) => { calls.push({ query, variables }); return results.shift(); }, 'Jaclyn25', now);
  assert.deepEqual(stats, { stars: 6, commits: 3200, prs: 19, issues: 7, repositories: 101, updatedAt: now.toISOString() });
  assert.equal(calls[1].variables.after, 'page2');
  assert.match(calls[2].query, /2025-01-01/);
  assert.match(calls[2].query, /2026-10-17/);
});

test('year ranges cover leap years without overlapping calendar years', () => {
  const ranges = yearRanges('2024-06-01T00:00:00Z', now);
  assert.equal(ranges[0].to, '2024-12-31T23:59:59.999Z');
  assert.equal(ranges[1].from, '2025-01-01T00:00:00.000Z');
  assert.equal(ranges.at(-1).to, now.toISOString());
});

test('long account histories use multiple batches and retain zero counts', async () => {
  const data = initial();
  data.user.createdAt = '2020-01-01T00:00:00Z';
  data.user.repositories.pageInfo.hasNextPage = false;
  let call = 0;
  const stats = await collectStats(async () => {
    call++;
    if (call === 1) return data;
    if (call === 2) return { user: Object.fromEntries([0, 1, 2, 3, 4].map(index => [`y${index}`, { totalCommitContributions: 10 }])) };
    return { user: { y0: { totalCommitContributions: 0 }, y1: { totalCommitContributions: 5 } } };
  }, 'Jaclyn25', now);
  assert.equal(call, 3);
  assert.equal(stats.commits, 55);
});

test('missing yearly totals fail instead of undercounting', async () => {
  const data = initial(); data.user.repositories.pageInfo.hasNextPage = false;
  let call = 0;
  await assert.rejects(collectStats(async () => ++call === 1 ? data : { user: { y0: { totalCommitContributions: 1 } } }, 'Jaclyn25', now), /Missing commit count/);
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
  await makeHandler({ env: { GITHUB_TOKEN: 'secret-token' }, now: () => now, fetcher: async () => ({ ok: true, json: async () => ({ data: responses.shift() }) }) })({ method: 'GET', url: '/api/stats?username=someone-else' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Vercel-CDN-Cache-Control'], 'public, s-maxage=300');
  assert.match(res.body, /3,000/);
  assert.doesNotMatch(res.body, /secret-token|someone-else|stargazerCount/);
});

test('blocks non-read methods before calling GitHub', async () => {
  const res = responseMock();
  await makeHandler({ fetcher: () => { throw new Error('must not call'); } })({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET, HEAD');
});
