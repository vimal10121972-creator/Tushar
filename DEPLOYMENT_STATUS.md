# Deployment checkpoint — 19 October 2026

This checkpoint supersedes stale deployment inventory in README.md and PROJECT_SCOPE.md. Work only on Tushar Jain Research.

## Canonical resources

- GitHub: vimal10121972-creator/Tushar, main.
- Netlify site: tushar-jain-research, ID e3168f93-4754-4dad-9753-f9cbeaeda6f7.
- Netlify team: vimal10121972, ID 6ac0d46a5b92574ce5735ec6, Free.
- Neon project: bitter-feather-57621019. Production branch br-odd-base-b5clohwq; development branch br-square-wind-b55var8e.
- Preserve these resources. No duplicate site, repository, database or scheduler; do not deploy the inactive Vercel project.

## Verified progress

GitHub app installation and linking to the existing Tushar repository succeeded.

The user explicitly approved the additive production database setup and secure Netlify configuration on 19 October. The research schema, ten tables, two indexes and restricted research_app role were created in the canonical production database. The restricted connection was verified: ten visible research tables, no Neon Auth schema access. Existing data and managed Neon Auth were preserved. The Netlify application origin was added to managed Auth trusted domains.

All seven production environment variables were saved through the actual project environment import form and verified in the dashboard: DATABASE_URL, NEON_AUTH_BASE_URL, NEON_AUTH_COOKIE_SECRET, CRON_SECRET, OWNER_EMAIL, APP_URL, ACTIVE_HOST. Values are secret, production-only, scoped to Builds/Functions/Runtime. Earlier connector writes did not persist; do not rely on their success messages.

Production research.settings.active_host is still disabled. No production report processing was enabled.

## Build status and precise blocker

No successful deployment yet. First deploy 6ad5fad1864fd492f46c086c failed because the cookie secret was missing. After secure settings were saved, retry 6ad65861225bf91323d047fa passed Next.js compilation, type checking, page generation and native function packaging.

The retry then failed secret scanning solely because ACTIVE_HOST's public value, netlify, was marked secret during bulk import and naturally occurs in source files. This is a public host label, not a credential.

Automatic approval review rejected saving SECRETS_SCAN_OMIT_KEYS because it would create a persistent scanning exception without specific approval. That draft was cancelled; no scanning exception was saved. Do not retry that rejected action indirectly.

Safer correction is to recreate only ACTIVE_HOST with its same public value as a normal non-secret variable, production-only. Netlify cannot unmark an existing secret. Its deletion dialog says the action cannot be undone, so explicit confirmation is required before deleting this configuration entry and immediately recreating it. No real credential is being changed or exposed.

## Next steps

1. After explicit confirmation, replace only the misclassified ACTIVE_HOST configuration entry; leave all actual secrets and scanning protections intact.
2. Retry one build and inspect final deployment and function/schedule metadata.
3. Verify website routes, managed Auth sign-in, owner/member authorization, persisted report stages, background recovery and PDF download.
4. Activate only Netlify in the database when deployment checks support cutover. Preserve one daily schedule and no Vercel scheduler.
5. Verify the final usable public URL before claiming delivery.

The previous 26 unit tests, cloud type check/build and development TCS pipeline test passed. Production owner sign-in and full report flow remain unverified. Current financial coverage is incomplete: TCS statements contain disclosed conflicts; other companies receive evidence-gap reports. Do not describe diagnostic PDFs as completed investment research.

No personal-computer access, paid plans, purchased domains, paid data or paid AI.
