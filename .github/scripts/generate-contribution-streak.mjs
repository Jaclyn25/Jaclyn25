import { mkdir, readFile, writeFile } from "node:fs/promises";

const username = process.env.GITHUB_USERNAME;
const token = process.env.GITHUB_TOKEN;

if (!username || !token) {
  throw new Error("GITHUB_USERNAME and GITHUB_TOKEN are required.");
}

const query = `
  query ContributionCalendar($username: String!) {
    user(login: $username) {
      contributionsCollection {
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
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `bearer ${token}`,
    "User-Agent": "Jaclyn25-profile-readme",
  },
  body: JSON.stringify({ query, variables: { username } }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed with ${response.status}.`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map((error) => error.message).join(" "));
}

const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar) {
  throw new Error(`No contribution calendar found for ${username}.`);
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
const totalContributions = calendar.totalContributions.toLocaleString("en-US");

const escapeXml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);

const stat = (x, label, value) => `
  <g transform="translate(${x} 0)">
    <text x="0" y="0" fill="#f7f1ff" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700">${escapeXml(value)}</text>
    <text x="0" y="24" fill="#c6bfd2" font-family="Arial, Helvetica, sans-serif" font-size="12" letter-spacing="1.2">${escapeXml(label.toUpperCase())}</text>
  </g>`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="860" height="260" viewBox="0 0 860 260" role="img" aria-labelledby="title description">
  <title id="title">GitHub contribution streak for ${escapeXml(username)}</title>
  <desc id="description">${escapeXml(currentStreak)} day current streak, ${escapeXml(longestStreak)} day longest streak, ${escapeXml(activeDays)} active days, and ${escapeXml(totalContributions)} total contributions.</desc>
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
    ${stat(570, "Total contributions", totalContributions)}
  </g>
  <text x="44" y="226" fill="#ff69b4" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700">JACLYN25 / OPEN SOURCE ACTIVITY</text>
</svg>
`;

await mkdir("dist", { recursive: true });
await writeFile("dist/contribution-streak.svg", svg, "utf8");

const statisticsTemplate = await readFile("assets/github-statistics.svg", "utf8");
const statisticsSvg = statisticsTemplate
  .replace(/(<text x="160" y="912">)[^<]+(<\/text>)/, `$1${currentStreak}$2`)
  .replace(/(<text x="460" y="912">)[^<]+(<\/text>)/, `$1${longestStreak}$2`)
  .replace(/(<text x="806" y="912">)[^<]+(<\/text>)/, `$1${activeDays}$2`)
  .replace(/(<text x="1166" y="912">)[^<]+(<\/text>)/, `$1${totalContributions}$2`);

await writeFile("dist/github-statistics.svg", statisticsSvg, "utf8");
