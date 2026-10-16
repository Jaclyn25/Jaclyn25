# Private + public GitHub statistics on Vercel

This repository includes a dependency-free Node.js function at `/api/stats`.
It publishes only aggregate numbers. It does not return repository names,
code, tokens, or raw GitHub responses. There are no scheduled bot commits.

## Deploy

1. Import `Jaclyn25/Jaclyn25` into Vercel. Use framework **Other**, root directory
   `.`, Node.js **22.x**. The checked-in `vercel.json` sets no build command and
   uses `public` as the static output directory; keep those settings.
2. Add these server-side Production environment variables before deploying:
   - `GITHUB_USERNAME`: `Jaclyn25`
   - `GITHUB_TOKEN`: a personal access token owned by `Jaclyn25`.
3. A fine-grained token can be limited to the repositories you want to count.
   Select the relevant resource owner and repositories; grant read access to
   Contents, Pull requests, and Issues (Metadata read access is automatic).
   A fine-grained token is limited to one resource owner and may require
   organization approval; it will not cover every organization automatically.
   If you need repositories across owners, a classic token with `repo` and
   `read:user` can be used where organization policy permits. Classic `repo`
   is a broad permission, even though this service makes only read requests.
   Authorize organization SSO where required. Choose an expiration date and
   replace the secret on Vercel before it expires.
4. Keep the value in Vercel's environment settings. Never commit it, include it
   in an image URL, or paste it in chat. Do not use a `NEXT_PUBLIC_` variable.
5. Deploy, then visit `https://YOUR-PROJECT.vercel.app/api/stats`. Confirm the
   image loads and the fetched timestamp and totals look correct. The endpoint
   must be public for GitHub's image proxy; check Vercel Deployment Protection
   if you see a login page instead of the SVG.
6. Replace **only** the stats image URL in `README.md` with that verified URL.
   Keep the current public card working until the private card is verified.

## What the numbers mean

- PRs and issues: all-time authored records visible to the token, public and
  authorized private. Repository access can limit these totals.
- Commits: sum of `totalCommitContributions` for each calendar year since account
  creation. This follows GitHub's contribution rules (including branch and
  author-email rules); it is not every commit from every branch. This metric
  can differ from the old card's public commit search count.
- Stars and owned repositories: the owner's repositories visible to the token.
  Stars are paginated beyond the first 100 repositories. The card labels owned
  repositories explicitly; this is not an all-time count of contributed repos.
- The language and streak cards in the README still use the existing external
  services. Their scope and refresh timing are unchanged by deploying this
  function.

The CDN cache is five minutes, with browser revalidation. A new fetch happens
on a request after expiry, not on a timer. GitHub's image proxy and upstream
indexing can still delay visible updates; five minutes is not an end-to-end SLA.
The fetched timestamp makes a stale image identifiable. Failed or incomplete
requests produce an uncached unavailable card instead of a misleading zero.
Only the configured owner's token works; URL parameters cannot select a
different user or expose individual private resources.

Run `npm test` locally. Tests use synthetic GitHub responses; no token is needed.
A live check with the production token is still required to verify its private
repository permissions. GitHub does not report a universal missing-access flag.

References: [Vercel Node.js functions](https://vercel.com/docs/functions/runtimes/node-js),
[Vercel cache headers](https://vercel.com/docs/headers/cache-control-headers),
[GitHub token permissions](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens),
[GitHub contribution rules](https://docs.github.com/en/account-and-profile/concepts/contributions-visible-on-your-profile).
