import { calculateRank } from './rank.js';

const ENDPOINT = 'https://api.github.com/graphql';

export function createGitHubClient(token, fetcher = fetch) {
  const github = async (query, variables = {}) => {
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
  github.countCommits = async username => {
    const url = new URL('https://api.github.com/search/commits');
    url.searchParams.set('q', `author:${username}`);
    url.searchParams.set('per_page', '1');
    const response = await fetcher(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Jaclyn25-profile-stats',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('GitHub commit search failed');
    const result = await response.json();
    if (result.incomplete_results !== false || !Number.isSafeInteger(result.total_count) || result.total_count < 0) {
      throw new Error('Incomplete commit search');
    }
    return result.total_count;
  };
  return github;
}

const REPOSITORIES = `repositories(first:100, ownerAffiliations:[OWNER], after:$after) {
  totalCount
  nodes { stargazerCount }
  pageInfo { hasNextPage endCursor }
}`;

export async function collectStats(github, username, now = new Date()) {
  const initial = await github(`query($login:String!,$after:String) {
    viewer { login }
    user(login:$login) {
      login
      contributionsCollection {
        contributionCalendar { totalContributions }
        totalPullRequestReviewContributions
      }
      followers { totalCount }
      pullRequests(first:1) { totalCount }
      issues(first:1) { totalCount }
      ${REPOSITORIES}
    }
  }`, { login: username, after: null });
  if (!initial.user || initial.viewer.login.toLowerCase() !== username.toLowerCase()) {
    throw new Error('Token must belong to the profile owner');
  }
  const user = initial.user;
  const contributionsLastYear = user.contributionsCollection?.contributionCalendar?.totalContributions;
  if (!Number.isSafeInteger(contributionsLastYear) || contributionsLastYear < 0) {
    throw new Error('Missing contribution total');
  }
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

  // The authenticated search counts authored commits across all years in
  // indexed default branches, including private repositories the token can read.
  // Use total_count, not the paginated item count or contribution-calendar sum.
  const commits = await github.countCommits(username);
  const stats = {
    stars, commits, contributionsLastYear,
    prs: user.pullRequests.totalCount,
    issues: user.issues.totalCount,
    repositories: user.repositories.totalCount,
    updatedAt: now.toISOString(),
  };
  return { ...stats, rank: calculateRank({ ...stats,
    reviews: user.contributionsCollection.totalPullRequestReviewContributions,
    followers: user.followers.totalCount,
  }) };
}

export function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]);
}

export function renderStats(stats) {
  const metrics = [
    ['Contributions (last year)', stats.contributionsLastYear],
    ['Total Stars', stats.stars],
    ['Total Commits', stats.commits],
    ['Total PRs', stats.prs],
    ['Total Issues', stats.issues],
  ];
  const rows = metrics.map(([label, count], index) => {
    const y = 62 + index * 25;
    return `<text x="22" y="${y}" fill="#a9fef7">${label}</text><text x="274" y="${y}" text-anchor="end" fill="#a9fef7">${escapeXml(count.toLocaleString('en-US'))}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="430" height="186" viewBox="0 0 430 186" role="img" aria-labelledby="title desc">
  <title id="title">GitHub statistics</title>
  <desc id="desc">Public and authorized private activity. ${metrics.map(([label, count]) => `${label}: ${count}`).join('. ')}. Activity grade: ${escapeXml(stats.rank.level)}, calculated using the GitHub Readme Stats formula, not an official GitHub ranking. Commits follow GitHub authenticated search scope and indexing rules.</desc>
  <rect x=".5" y=".5" width="429" height="185" rx="5" fill="#141321" stroke="#e4e2e2"/>
  <g font-family="Segoe UI,Arial,sans-serif" font-size="13" font-weight="600">
    <text x="22" y="30" fill="#fe428e" font-size="18">My GitHub Statistics</text>
    ${rows}
    <g aria-label="Activity grade ${escapeXml(stats.rank.level)}">
      <circle cx="358" cy="109" r="40" fill="none" stroke="#fe428e" stroke-opacity=".2" stroke-width="6"/>
      <circle cx="358" cy="109" r="40" fill="none" stroke="#fe428e" stroke-width="6" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${stats.rank.percentile.toFixed(2)}" transform="rotate(-90 358 109)"/>
      <text x="358" y="109" text-anchor="middle" dominant-baseline="central" fill="#a9fef7" font-size="25">${escapeXml(stats.rank.level)}</text>
    </g>
  </g>
</svg>`;
}

export function renderUnavailable() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="110" role="img"><title>GitHub statistics temporarily unavailable</title><rect width="480" height="110" rx="5" fill="#141321"/><g font-family="Segoe UI,Arial,sans-serif" fill="#a9fef7"><text x="24" y="45">GitHub statistics temporarily unavailable.</text><text x="24" y="75">Please check the profile links or try again later.</text></g></svg>';
}
