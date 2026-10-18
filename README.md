# Tushar Jain Research

Evidence-led Indian Equity Analysis. The binding project boundaries are in PROJECT_SCOPE.md.

## Delivery status

This is the existing website, now prepared for Netlify Free. It is not yet a verified production release. GitHub access was repaired on 18 October 2026 by installing the ChatGPT Codex Connector. The existing repository is vimal10121972-creator/Tushar. No alternate repository is used.

The app includes Next.js/React/TypeScript pages, invite-gated Neon Auth, a Neon-backed resumable report queue, deterministic financial calculations, and checked A4 PDFs. Current financial coverage is incomplete: the NSE EQ identity directory and recent completed-session closes; TCS consolidated IFRS annual/quarterly workbook extraction. TCS source discrepancies are withheld and disclosed. Other companies receive explicit evidence-gap reports. Do not describe diagnostic PDFs as completed investment research.

## Canonical resources

- Repository: https://github.com/vimal10121972-creator/Tushar
- Production host: Netlify Free, team vimal10121972. No site existed at the latest inventory; create at most one site for this repository after the connection is available.
- Neon project: bitter-feather-57621019, tushar-jain-research, Free plan.
- Production branch: br-odd-base-b5clohwq. Existing managed Neon Auth is preserved. Research tables are not yet migrated to production.
- Isolated development branch: br-square-wind-b55var8e, research-development. Synthetic QA membership exists only here.
- Existing inactive Vercel project: prj_rWYcz23RApyte51q4oQOioHnQKQJ. Do not deploy to it. The Vercel cron configuration has been removed from source.

Do not change unrelated projects or create another database/repository. Cloud workspace only; no personal-computer access. No paid plans, domains, data, AI services or overages.

## Netlify execution

`netlify.toml` builds with Node 24 and `npm run build`, publishing `.next`. Netlify manages the OpenNext adapter automatically. `.netlify/` is excluded from Git.

Foreground API routes enqueue work in Postgres and send a small authenticated request to the native research-worker background function. The background function budgets each invocation to approximately 220 seconds, below Netlify's 15-minute ceiling. Each of the six stages is checkpointed. Atomic leases prevent concurrent ownership; idempotency keys prevent duplicate reports. Network and database requests have timeouts. Interrupted work remains queued for manual retry or the daily recovery pass.

The research-daily scheduled function only dispatches a background recovery task, within its 30-second execution limit. It runs once daily at 03:10 UTC / 08:40 IST. It is the only production scheduler. Preview contexts cannot dispatch or process production jobs. A database active_host setting must match the runtime ACTIVE_HOST value before either a manual or scheduled worker can process work. Migrations default that setting to disabled; activate netlify only during verified cutover. The legacy HTTP cron endpoint is disabled in production.

Runtime has no dependency on ChatGPT conversations, subscriptions, connectors, Automations or paid AI inference.

## Secrets and access

Configure DATABASE_URL, NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET, CRON_SECRET, OWNER_EMAIL, APP_URL and ACTIVE_HOST in Netlify, scoped to the production context and Builds/Functions. Use the canonical production Neon branch, never the development connection. APP_URL must be the actual HTTPS site origin; ACTIVE_HOST must be netlify. Generate independent strong cookie and worker secrets. No secret belongs in source, netlify.toml, the client bundle, screenshots or logs. The example environment file contains placeholders only.

Use the existing managed Neon Auth instance and configure its trusted origin for the actual Netlify URL. Application authorization additionally requires verified email and owner or invited membership. Reports are private; sharing is limited to active members. SQL is parameterized. Mutation requests check Origin. Native background requests use timing-safe bearer verification before any database work, and credential-bearing dispatches reject redirects.

## Free-plan bounds

Verified 18 October 2026: Netlify Free includes a hard 300-credit monthly limit; production deploys consume 15 credits, compute 10 credits/GB-hour, bandwidth 20 credits/GB, and requests 2 credits/10,000. See https://www.netlify.com/pricing/ and https://docs.netlify.com/build/functions/background-functions/. Hitting the free allowance can pause availability; do not enable paid upgrades or recharge.

Application limits: owner 10 reports/day, member 3/day, workspace 20/day and 100/month; at most three active schedules per user; PDF maximum 2.5 MB; generation pauses above 350 MB database size. These bounds reduce usage but are not a promise of uninterrupted service or protection from every source of traffic.

## Validation

- 26 unit tests passed: financial arithmetic, WACC/DCF/scenarios/sensitivity, sector exclusions, beta/RSI, annual versus quarterly extraction, source conflicts, PDF quality, worker authentication, preview isolation and secure asynchronous dispatch.
- TypeScript check passed after Netlify migration.
- Production Next.js build passed after isolating stale generated cache files.
- Previous development-branch real-source test completed all six persisted TCS stages and produced a nine-page BLOCKED diagnostic PDF. Duplicate-enqueue and concurrent-worker checks passed for that test.
- Netlify deployed functions, owner signup/verification, production authorization, report completion after closing the browser and final PDF download are not yet end-to-end verified.

## Release sequence

1. Commit the reviewed source to the existing Tushar repository; keep secrets and generated artifacts excluded.
2. Sign into the existing Netlify account and link this repository to a single site in the existing Free team. Set secrets before building. Keep production locked/private until validation is complete.
3. Review and apply migrations/001_research.sql to the canonical production Neon branch, without copying development data. Configure managed Auth trusted origins.
4. Set research.settings.active_host to the JSON string netlify once the sole Netlify deployment is ready. Confirm no Vercel or GitHub Actions schedule exists.
5. Verify sign-in and email verification, owner/member authorization, invite access, report stages/resume, idempotency, PDF quality/download, data-gap labels and the public homepage.
6. Publish only the verified Netlify site. Return its actual URL; never claim a guessed address is live.
7. Broaden validated company financial coverage, peer metrics, ownership/news/governance, adjusted price history and sector valuation workflows before claiming complete institutional research coverage.

## Commands

`npm test`, `npm run typecheck`, `npm run build` run in the cloud workspace. The build requires valid-shaped Neon Auth configuration. `tests/cloud-pipeline.ts` is a separate explicit development-only integration check; it is not part of the default test glob and must use only the isolated development connection.

Independent educational analysis; no SEBI registration claimed. No guarantee of accuracy or investment performance.
