import { mkdir, readFile, writeFile } from "node:fs/promises";

const username = process.env.GITHUB_USERNAME;
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY ?? `${username}/${username}`;
const [repositoryOwner, repositoryName] = repository.split("/", 2);

if (!username || !token) {
  throw new Error("GITHUB_USERNAME and GITHUB_TOKEN are required.");
}

const query = `
  query GithubStatistics(
    $username: String!
    $repositoryOwner: String!
    $repositoryName: String!
    $cursor: String
  ) {
    user(login: $username) {
      contributionsCollection {
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        totalRepositoriesWithContributedCommits
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
      repositories(
        first: 100
        after: $cursor
        ownerAffiliations: OWNER
        privacy: PUBLIC
        isFork: false
      ) {
        nodes {
          stargazerCount
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
    repository(owner: $repositoryOwner, name: $repositoryName) {
      defaultBranchRef {
        target {
          ... on Commit {
            history(first: 1) {
              totalCount
            }
          }
        }
      }
      pullRequests(states: OPEN) {
        totalCount
      }
      issues(states: OPEN) {
        totalCount
      }
    }
  }
`;

const githubHeaders = {
  Accept: "application/vnd.github+json",
  Authorization: `bearer ${token}`,
  "User-Agent": "Jaclyn25-profile-readme",
};

const fetchGraphQL = async (variables) => {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: githubHeaders,
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed with ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join(" "));
  }

  return payload.data;
};

const variables = {
  username,
  repositoryOwner,
  repositoryName,
  cursor: null,
};

let profileData;
let repositories = [];
do {
  profileData = await fetchGraphQL(variables);
  repositories = repositories.concat(profileData.user?.repositories?.nodes ?? []);

  const pageInfo = profileData.user?.repositories?.pageInfo;
  variables.cursor = pageInfo?.hasNextPage ? pageInfo.endCursor : null;
} while (variables.cursor);

const user = profileData.user;
const contributions = user?.contributionsCollection;
const calendar = contributions?.contributionCalendar;
const profileRepository = profileData.repository;

if (!user || !contributions || !calendar || !profileRepository) {
  throw new Error(`GitHub statistics are unavailable for ${username}.`);
}

const days = calendar.weeks
  .flatMap((week) => week.contributionDays)
  .sort((a, b) => a.date.localeCompare(b.date));

const isYesterday = (left, right) => {
  const leftDate = new Date(`${left}T00:00:00Z`);
  const rightDate = new Date(`${right}T00:00:00Z`);
  return Math.round((rightDate - leftDate) / 86_400_000) === 1;
};

let longestStreak = 0;
let runningStreak = 0;
for (let index = 0; index < days.length; index += 1) {
  const hasContribution = days[index].contributionCount > 0;
  const continues = index > 0 && isYesterday(days[index - 1].date, days[index].date);

  if (hasContribution) {
    runningStreak = continues && days[index - 1].contributionCount > 0 ? runningStreak + 1 : 1;
  } else {
    runningStreak = 0;
  }

  longestStreak = Math.max(longestStreak, runningStreak);
}

let currentIndex = days.length - 1;
if (days[currentIndex]?.contributionCount === 0) {
  currentIndex -= 1;
}

let currentStreak = 0;
for (; currentIndex >= 0; currentIndex -= 1) {
  if (days[currentIndex].contributionCount === 0) break;
  if (currentStreak > 0 && !isYesterday(days[currentIndex].date, days[currentIndex + 1].date)) break;
  currentStreak += 1;
}

const activeDays = days.filter((day) => day.contributionCount > 0).length;

const searchResponse = await fetch(
  `https://api.github.com/search/commits?q=author:${encodeURIComponent(username)}&per_page=1`,
  { headers: { ...githubHeaders, Accept: "application/vnd.github.cloak-preview+json" } },
);

if (!searchResponse.ok) {
  throw new Error(`GitHub commit search failed with ${searchResponse.status}.`);
}

const searchPayload = await searchResponse.json();
const allTimeCommits = searchPayload.total_count ?? 0;

const totalStars = repositories.reduce((sum, repo) => sum + repo.stargazerCount, 0);
const accountStats = {
  stars: totalStars,
  commits: contributions.totalCommitContributions,
  pullRequests: contributions.totalPullRequestContributions,
  issues: contributions.totalIssueContributions,
  contributedTo: contributions.totalRepositoriesWithContributedCommits,
};

const profileStats = {
  commits: profileRepository.defaultBranchRef?.target?.history?.totalCount ?? 0,
  pullRequests: profileRepository.pullRequests.totalCount,
  issues: profileRepository.issues.totalCount,
};

const formatCount = (value) => Number(value ?? 0).toLocaleString("en-US");

const escapeXml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);

const replaceTextAt = (source, x, y, value) =>
  source.replace(
    new RegExp(`(<text[^>]*x="${x}"[^>]*y="${y}"[^>]*>)[^<]*(</text>)`),
    `$1${escapeXml(value)}$2`,
  );

const renderStatistics = (template) => {
  const values = [
    [421, 289, formatCount(accountStats.stars)],
    [421, 332, formatCount(accountStats.commits)],
    [421, 377, formatCount(accountStats.pullRequests)],
    [421, 421, formatCount(accountStats.issues)],
    [421, 465, formatCount(accountStats.contributedTo)],
    [1350, 420, formatCount(allTimeCommits)],
    [434, 610, formatCount(profileStats.commits)],
    [908, 610, formatCount(profileStats.pullRequests)],
    [1370, 610, formatCount(profileStats.issues)],
    [160, 912, currentStreak],
    [460, 912, longestStreak],
    [806, 912, activeDays],
    [1166, 912, formatCount(calendar.totalContributions)],
  ];

  return values.reduce((svg, [x, y, value]) => replaceTextAt(svg, x, y, value), template);
};

const stat = (x, label, value) => `
  <g transform="translate(${x} 0)">
    <text x="0" y="0" fill="#f7f1ff" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700">${escapeXml(value)}</text>
    <text x="0" y="24" fill="#c6bfd2" font-family="Arial, Helvetica, sans-serif" font-size="12" letter-spacing="1.2">${escapeXml(label.toUpperCase())}</text>
  </g>`;

const contributionSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="860" height="260" viewBox="0 0 860 260" role="img" aria-labelledby="title description">
  <title id="title">GitHub contribution streak for ${escapeXml(username)}</title>
  <desc id="description">${escapeXml(currentStreak)} day current streak, ${escapeXml(longestStreak)} day longest streak, ${escapeXml(activeDays)} active days, and ${escapeXml(calendar.totalContributions)} total contributions.</desc>
  <rect width="860" height="260" rx="18" fill="#151221"/>
  <circle cx="770" cy="-8" r="170" fill="#8a2be2" opacity="0.13"/>
  <circle cx="840" cy="238" r="120" fill="#ff69b4" opacity="0.1"/>
  <text x="44" y="48" fill="#f7f1ff" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700">Contribution streak</text>
  <text x="44" y="72" fill="#c6bfd2" font-family="Arial, Helvetica, sans-serif" font-size="13">Updated daily from GitHub's contribution calendar</text>
  <line x1="44" y1="102" x2="816" y2="102" stroke="#3c354a"/>
  <g transform="translate(44 152)">
    ${stat(0, "Current streak", `${currentStreak} days`)}
    ${stat(190, "Longest streak", `${longestStreak} days`)}
    ${stat(380, "Active days", activeDays)}
    ${stat(570, "Total contributions", formatCount(calendar.totalContributions))}
  </g>
  <text x="44" y="226" fill="#ff69b4" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700">JACLYN25 / OPEN SOURCE ACTIVITY</text>
</svg>
`;

await mkdir("dist", { recursive: true });
await writeFile("dist/contribution-streak.svg", contributionSvg, "utf8");

const statisticsTemplate = await readFile("assets/github-statistics.svg", "utf8");
await writeFile("dist/github-statistics.svg", renderStatistics(statisticsTemplate), "utf8");
