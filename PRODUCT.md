# Product

## Register

brand

## Users

Recruiters, clients, collaborators, and other developers viewing Jacqueline Saad's GitHub profile on desktop or mobile.

## Product Purpose

Present Jacqueline's real projects, technical strengths, and GitHub activity as a clear, credible developer portfolio that encourages visitors to explore the work.

## Brand Personality

Technical, confident, approachable. The profile should feel polished and energetic without becoming noisy or decorative for its own sake.

## Anti-references

Avoid cluttered widget collections, uneven card layouts, broken image placeholders, unexplained metrics, and project descriptions that do not link to real work.

## Design Principles

- Make proof of real work the center of the profile.
- Use clear hierarchy so important metrics are understood at a glance.
- Keep third-party widgets orderly, consistent, and easy to scan.
- Prefer working links and honest labels over decorative filler.

## Accessibility & Inclusion

Use meaningful alt text, readable contrast, descriptive link labels, and layouts that remain understandable when images fail to load or when the profile is viewed on a narrow screen.

## GitHub Activity Data

- Embed remote SVG endpoints directly in `README.md`. Do not save metric snapshots under `assets/` or use scheduled bot commits to refresh them.
- The stats card reports public commits across years (`include_all_commits=true`), authored PRs, issues, received stars, and repositories contributed to. The old profile-repository commit badge counted only this README repository, so it was removed.
- Stats and language cards request a two-hour cache (`cache_seconds=7200`). The streak endpoint currently advertises a one-day cache. Provider caches and GitHub's image proxy can delay visible changes; these are automatic refreshes, not instant updates.
- Public services cannot be given access to private repositories by adding `count_private=true`. Private repository statistics require a separately hosted service with server-side credentials. Never put a GitHub token in a README URL.
- The streak card follows GitHub contribution activity; its total includes more than commits. Language percentages describe repository code, not proficiency or time spent.
- Keep direct GitHub links for contributions, PRs, and commits available when an external card is unavailable. Public endpoints can hit rate limits or stop working.
- Reference documentation: [GitHub Readme Stats](https://github.com/anuraghazra/github-readme-stats) and [GitHub Readme Streak Stats](https://github.com/DenverCoder1/github-readme-streak-stats). The original stats project is now unmaintained; recheck provider health before changing endpoints.

## Self-hosted Statistics

`api/stats.js` is the Vercel alternative for public and authorized private totals.
It requires a server-side `GITHUB_TOKEN` owned by `GITHUB_USERNAME` (default
`Jaclyn25`). It sums qualifying commit contributions across calendar years,
counts all-time authored PRs and issues visible to the token, and paginates
owned repositories for stars. Only aggregate numbers are returned. The service
requests a five-minute CDN cache; GitHub's image proxy can add delay. It does
not change the external language or streak cards. See `DEPLOYMENT.md` for token
scope, deployment, and verification before changing the README image URL.
