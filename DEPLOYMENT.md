# Hostinger + Supabase deployment

## Current architecture

The Node.js server runs the portal and enforces its existing role and station permissions. Supabase stores eleven operational collections in separate tables, persistent sessions, shared login limits and private meter photos. Each record retains its original JSON shape to preserve historical calculations and audit snapshots. This is a compatibility schema, not a fully normalized reporting warehouse.

Passwords remain scrypt hashes and sign-in remains the portal's own authentication. This release does not use Supabase Auth, introduce public registration, or require existing users to change passwords. Cookie tokens are hashed before cloud storage.

All portal tables have RLS enabled and browser-role grants revoked. Only the server role can execute the load/save functions. Supabase's informational “RLS Enabled No Policy” notice is intentional: browser roles have no direct table access. Station authorization is enforced in the Node.js server.

Updates use a transaction and revision check. Conflicts return a refresh-and-retry message rather than overwriting a newer save. This release loads full collections per request and is suitable for a small pilot; high-volume deployments require paginated queries and narrower transactions.

## Hostinger settings

- Framework: Other (Node.js backend).
- Node: 24 LTS.
- Entry file: server.cjs.
- Root directory: repository root.
- Start command: npm start.
- Build command, if required: npm run build.
- Domain: fuelstation90.com.

Set these in private server environment settings:

```text
NODE_ENV=production
PUBLIC_ORIGIN=https://fuelstation90.com
BIND_ADDRESS=0.0.0.0
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET
```

Never prefix the secret with PUBLIC or expose it in frontend code. Do not store it in GitHub. The host supplies PORT. No persistent local data disk is needed in Supabase mode. Without SUPABASE_URL, local development continues using the existing data folder.

Hostinger instructions: https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/

## Initial migration

The canonical schema is in supabase/schema.sql. The connected project has the schema applied through named Supabase migrations. Do not reapply the canonical create script to an existing schema.

Stop writes to the local portal before final migration. Create and verify a backup. Add SUPABASE_URL and SUPABASE_SECRET_KEY to a private .env file, then run from the project directory:

```sh
node --env-file=.env --preserve-symlinks-main --preserve-symlinks import-cloud.cjs data
```

The importer refuses a nonempty cloud database. It creates a private portal-evidence bucket with JPEG/PNG and 3 MB upload restrictions, uploads referenced photos into station folders, verifies their bytes, imports the records in one transaction, and compares records after import. An interrupted photo upload can resume only when existing cloud bytes match the source. A failed verification stops migration; investigate before routing traffic.

Keep local files as the rollback copy. Do not resume operational writes to the local copy after cloud cutover. Confirm the domain, HTTPS, all three roles, reading photos, reports and reconciliation before live operational use.

## Validation and remaining work

Run npm test for isolated application, hosting and mocked cloud API tests. Database permissions, transaction rollback/conflict handling and shared login limits are also checked against the connected Supabase project. Mocked transport tests do not replace live API and hosting checks.

Before production acceptance, complete backup scheduling and cloud restore drills, monitoring, account recovery, full server-side image decoding and physical phone testing. Unreferenced photos from failed or replaced drafts need a retention job. Review Supabase's backup coverage for your plan; database backups do not themselves back up Storage objects.

The optional Docker/Caddy files remain an alternative server-hosting route. They are not required for Hostinger's managed Node.js hosting.
