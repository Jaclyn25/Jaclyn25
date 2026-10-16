// Same scoring formula and thresholds as GitHub Readme Stats:
// https://github.com/anuraghazra/github-readme-stats/blob/master/src/calculateRank.js
// This is an activity grade, not an official GitHub ranking.
export function calculateRank({ commits = 0, prs = 0, issues = 0, reviews = 0, stars = 0, followers = 0 }) {
  const exponential = value => 1 - 2 ** -value;
  const saturation = value => value / (1 + value);
  const score = (
    2 * exponential(commits / 1000) +
    3 * exponential(prs / 50) +
    exponential(issues / 25) +
    exponential(reviews / 2) +
    4 * saturation(stars / 50) +
    saturation(followers / 10)
  ) / 12;
  const percentile = Math.max(0, Math.min(100, (1 - score) * 100));
  const thresholds = [1, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
  const levels = ['S', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C'];
  return { level: levels[thresholds.findIndex(limit => percentile <= limit)], percentile };
}
