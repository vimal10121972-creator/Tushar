# Deployment checkpoint — 20 October 2026

This supersedes stale deployment inventory in README.md and PROJECT_SCOPE.md.

## Live deployment
- Website: https://tushar-jain-research.netlify.app/
- Repository: vimal10121972-creator/Tushar, main.
- Netlify site e3168f93-4754-4dad-9753-f9cbeaeda6f7, existing vimal10121972 Free team.
- Successful production deploy: 6ad7377c535c400d14065da5, source commit be974d685f809848ba73d186a441d96f91af59d8, published 20 October 2026 09:43:23 UTC.
- Canonical Neon project bitter-feather-57621019; production branch br-odd-base-b5clohwq; isolated development branch br-square-wind-b55var8e.
- No alternate repository, database, website or Vercel deployment was created.

## Configuration
User approved and completed replacement of misclassified ACTIVE_HOST=netlify as a normal production-only variable. Six remaining settings retain secret storage and production-only scope. No secret-scanning exception was created; scanning passed.
Production schema and restricted research_app role were created with explicit approval; no Neon Auth schema access. Existing data and managed Auth preserved; Netlify origin trusted.
Netlify team-login protection now applies only to non-production deploys. Production homepage is public; application research remains behind verified email and owner/invited membership.
Production database active_host is netlify.

## Verified
- Next.js build, type check, page generation, secret scanning and native function packaging passed.
- Homepage and sign-in page load with HTTP 200; browser displays Tushar Jain Research.
- /api/health returns online.
- Anonymous /api/me and /api/reports return 401.
- Legacy /api/cron returns 404.
- Three functions deployed: Next.js server handler, research-worker (background invocation mode), research-daily.
- Exactly one deployed function schedule: research-daily at 03:10 UTC / 08:40 IST.
- Previous 26 tests and development pipeline test passed.

## Remaining validation and coverage
Owner sign-in, email verification, production report generation and PDF download have not been verified end to end. Do not claim full research completion.
Financial coverage remains incomplete: NSE identities and closing prices; TCS statements with disclosed conflicts; other companies receive evidence-gap reports. Diagnostic PDFs are not completed investment research.
Preserve existing financial engine, canonical database and GitHub repository. Cloud only, no paid services or upgrades. Use this existing site for subsequent fixes.
