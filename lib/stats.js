const ENDPOINT = 'https://api.github.com/graphql';

export function createGitHubClient(token, fetcher = fetch) {
  return async (query, variables = {}) => {
    const response = await fetcher(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Jaclyn25-profile-stats',
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('GitHub request failed');
    const result = await response.json();
    // Partial results would silently undercount private activity.
    if (result.errors?.length || !result.data) throw new Error('Incomplete GitHub response');
    return result.data;
  };
}

const REPOSITORIES = `repositories(first:100, ownerAffiliations:[OWNER], after:$after) {
  totalCount
  nodes { stargazerCount }
  pageInfo { hasNextPage endCursor }
}`;

export function yearRanges(createdAt, now) {
  const first = new Date(createdAt).getUTCFullYear();
  const last = now.getUTCFullYear();
  if (!Number.isInteger(first) || first < 2007 || first > last) throw new Error('Invalid account date');
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const year = first + index;
    return {
      from: new Date(Date.UTC(year, 0, 1)).toISOString(),
      to: new Date(Math.min(now.getTime(), Date.UTC(year + 1, 0, 1) - 1)).toISOString(),
    };
  });
}

export async function collectStats(github, username, now = new Date()) {
  const initial = await github(`query($login:String!,$after:String) {
    viewer { login }
    user(login:$login) {
      login createdAt
      pullRequests(first:1) { totalCount }
      issues(first:1) { totalCount }
      ${REPOSITORIES}
    }
  }`, { login: username, after: null });
  if (!initial.user || initial.viewer.login.toLowerCase() !== username.toLowerCase()) {
    throw new Error('Token must belong to the profile owner');
  }
  const user = initial.user;
  let repositories = user.repositories;
  let stars = 0;
  const cursors = new Set();
  while (true) {
    stars += repositories.nodes.reduce((sum, repo) => sum + repo.stargazerCount, 0);
    if (!repositories.pageInfo.hasNextPage) break;
    const cursor = repositories.pageInfo.endCursor;
    if (!cursor || cursors.has(cursor)) throw new Error('Invalid repository pagination');
    cursors.add(cursor);
    const next = await github(`query($login:String!,$after:String) {
      user(login:$login) { ${REPOSITORIES} }
    }`, { login: username, after: cursor });
    repositories = next.user.repositories;
  }

  let commits = 0;
  // Each contributionsCollection accepts at most one year. Separate calendar
  // years avoid overlaps, including leap years and activity before this year.
  const ranges = yearRanges(user.createdAt, now);
  for (let offset = 0; offset < ranges.length; offset += 5) {
    const batch = ranges.slice(offset, offset + 5);
    const fields = batch.map((range, index) => `y${index}: contributionsCollection(
      from:${JSON.stringify(range.from)}, to:${JSON.stringify(range.to)}
    ) { totalCommitContributions }`).join('\n');
    const data = await github(`query($login:String!) { user(login:$login) { ${fields} } }`, { login: username });
    for (let index = 0; index < batch.length; index++) {
      const count = data.user[`y${index}`]?.totalCommitContributions;
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Missing commit count');
      commits += count;
    }
  }
  return {
    stars, commits,
    prs: user.pullRequests.totalCount,
    issues: user.issues.totalCount,
    repositories: user.repositories.totalCount,
    updatedAt: now.toISOString(),
  };
}

export function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
}

export function renderStats(stats) {
  const metrics = [
    ['Total Stars', stats.stars],
    ['Total Commits', stats.commits],
    ['Total PRs', stats.prs],
    ['Total Issues', stats.issues],
    ['Owned Repositories', stats.repositories],
  ];
  const rows = metrics.map(([label, count], index) => {
    const y = 72 + index * 28;
    return `<text x="26" y="${y}" fill="#a9fef7">${label}</text><text x="454" y="${y}" text-anchor="end" fill="#a9fef7">${escapeXml(count.toLocaleString('en-US'))}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="265" viewBox="0 0 480 265" role="img" aria-labelledby="title desc">
  <title id="title">GitHub statistics</title>
  <desc id="desc">Public and authorized private activity. ${metrics.map(([label, count]) => `${label}: ${count}`).join('. ')}. Commits follow GitHub contribution rules.</desc>
  <rect x=".5" y=".5" width="479" height="264" rx="5" fill="#141321" stroke="#e4e2e2"/>
  <g font-family="Segoe UI,Arial,sans-serif" font-size="14" font-weight="600">
    <text x="26" y="32" fill="#fe428e" font-size="19">My GitHub Statistics</text>
    ${rows}
    <text x="26" y="226" fill="#a9fef7" font-size="11" font-weight="400">Public + authorized private activity · All years</text>
    <text x="26" y="246" fill="#a9fef7" font-size="10" font-weight="400">Fetched ${escapeXml(stats.updatedAt.replace('T', ' ').slice(0, 19))} UTC</text>
  </g>
</svg>`;
}

export function renderUnavailable() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="110" role="img"><title>GitHub statistics temporarily unavailable</title><rect width="480" height="110" rx="5" fill="#141321"/><g font-family="Segoe UI,Arial,sans-serif" fill="#a9fef7"><text x="24" y="45">GitHub statistics temporarily unavailable.</text><text x="24" y="75">Please check the profile links or try again later.</text></g></svg>';
}
