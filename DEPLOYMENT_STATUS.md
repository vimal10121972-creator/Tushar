# Deployment checkpoint — 19 October 2026

This file updates the deployment inventory in README.md. Work only on Tushar Jain Research.

## Canonical resources

- GitHub: vimal10121972-creator/Tushar, main.
- Netlify site: tushar-jain-research, ID e3168f93-4754-4dad-9753-f9cbeaeda6f7.
- Netlify team: vimal10121972, ID 6ac0d46a5b92574ce5735ec6, Free.
- Neon project: bitter-feather-57621019. Production branch br-odd-base-b5clohwq; development branch br-square-wind-b55var8e.
- Do not create another site, repository, database project or scheduler. Do not deploy the inactive Vercel project.

## Verified state

The user authorized the Netlify GitHub app installation for only Tushar. Installation succeeded. The existing Netlify site is private and has no successful deployment. Repository linking is prepared in the site's own Link repository flow, with main, npm run build, .next and netlify/functions. The final Deploy Tushar action has not been submitted.

On 19 October the Netlify connector reported a successful ACTIVE_HOST environment-variable upsert, but both its read-back and the Netlify dashboard showed no variables. The previous six upserts were therefore not confirmed persisted. Do not assume secrets are stored. The cloud-browser form is the next supported configuration route, after destination-specific approval for credentials/secrets.

## Approval blocker

Automatic approval review rejected the production migration transaction because it interpreted the instruction to keep the canonical database unchanged as forbidding schema and role additions. Do not retry or bypass this rejection without explicit clarification/approval.

The prepared change uses migrations/001_research.sql: a research schema, ten application tables, two indexes, and an initially disabled host setting. The proposed application login role research_app receives CRUD only on research tables and sequence access, not Neon Auth tables. Existing data and the existing Neon Auth service remain in place. Deployment additionally needs its actual HTTPS origin allowed in managed Neon Auth and the production connection stored securely in this Netlify project.

The rejected transaction did not execute. Production research tables and role have not been created by this workflow. No production job processing has been activated.

## Remaining work

1. Obtain explicit approval for the additive production schema/role, its runtime permissions, login-origin configuration, and secure storage of the Neon connection/app secrets in Netlify.
2. Recheck production state, apply the reviewed migration once, provision the restricted role and securely configure the seven production environment variables.
3. Finish linking this existing site to Tushar and deploy. Verify persistence, build and native background/scheduled functions.
4. Activate only Netlify after checks. Verify sign-in, private authorization, resumable report processing and PDF download before delivering a usable URL.
5. Retain honest evidence-gap disclosures: current financial-source coverage is incomplete, as documented in README.md.

No personal-computer access, paid plans, purchased domains, paid data, or paid AI services are authorized.
