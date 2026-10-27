# Cloudflare Workers Staging Runbook

**Service Name:** `9router-staging`
**Target Environment:** Cloudflare Workers (Staging)
**Applicable Version:** `9Router v0.5.104`
**Prerequisites:** Cloudflare Account (Free or Paid), Turso Account, Node.js 20+

---

## 1. Safety & Production Isolation Policy

> [!IMPORTANT]
> - Never execute deployment commands against production environments or domains without explicit owner authorization.
> - The staging deployment target is named `9router-staging` to ensure complete isolation from any production resources.
> - Secrets must **NEVER** be hardcoded in repository files or committed to Git.

---

## 2. Step-by-Step Staging Setup & Deployment

### Step 1: Authenticate Cloudflare CLI
Verify that Wrangler is logged into the intended Cloudflare account:

```bash
npx wrangler whoami
```

If not logged in:
```bash
npx wrangler login
```

---

### Step 2: Prepare Turso Remote Database
1. Log in to Turso CLI:
   ```bash
   turso auth login
   ```
2. Create a dedicated staging database:
   ```bash
   turso db create 9router-staging
   ```
3. Retrieve the database URL:
   ```bash
   turso db show 9router-staging --url
   # Output example: libsql://9router-staging-[your-org].turso.io
   ```
4. Generate an authentication token:
   ```bash
   turso db tokens create 9router-staging
   # Output: eyJhbGciOi... (Save securely)
   ```

---

### Step 3: Configure Cloudflare Secrets & Environment Variables

#### Set Secrets via Wrangler
Run the following commands to upload secrets to Cloudflare's encrypted key-value store:

```bash
# 1. Set the Turso authentication token
npx wrangler secret put TURSO_AUTH_TOKEN --name 9router-staging

# 2. Set the JWT secret used for dashboard sessions and auth cookies
npx wrangler secret put JWT_SECRET --name 9router-staging
```

#### Configure Non-Secret Variables
Ensure `wrangler.jsonc` contains the public database URL and configuration flags:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "9router-staging",
  "main": ".open-next/worker.js",
  "compatibility_date": "2026-03-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": {
    "directory": ".open-next/assets",
    "binding": "ASSETS"
  },
  "vars": {
    "TURSO_DATABASE_URL": "libsql://9router-staging-[your-org].turso.io"
  }
}
```

---

### Step 4: Build and Deploy to Cloudflare Staging

Execute the build and deploy pipeline:

```bash
# 1. Build the OpenNext Cloudflare bundle
npm run build:worker

# 2. Deploy to Cloudflare Workers staging
npx wrangler deploy
```

Upon successful deployment, Wrangler will print the staging URL:
```text
Uploaded 9router-staging (x.xx sec)
Deployed 9router-staging triggers (x.xx sec)
  https://9router-staging.[your-subdomain].workers.dev
Current Version ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

---

## 3. Post-Deployment Verification (Smoke Tests)

Replace `<STAGING_URL>` with your actual deployment URL:

```bash
# 1. Check application version
curl -s https://<STAGING_URL>/api/version
# Expected: {"currentVersion":"0.5.104"}

# 2. Check liveness probe
curl -s https://<STAGING_URL>/api/health?probe=liveness
# Expected: {"ok":true,"status":"live"}

# 3. Check full database readiness
curl -s https://<STAGING_URL>/api/health
# Expected: {"ok":true,"db":"connected"} (HTTP 200)

# 4. Verify static assets
curl -I https://<STAGING_URL>/manifest.webmanifest
# Expected: HTTP/2 200

# 5. Verify UI redirect
curl -I https://<STAGING_URL>/
# Expected: HTTP/2 307 (Location: /dashboard)
```

---

## 4. Rollback Procedure

If unexpected errors or regressions occur on staging:

### Option A: Instant Wrangler Rollback (Recommended)
Cloudflare retains previous worker deployments and supports zero-downtime rollback:

```bash
# List recent versions
npx wrangler deployments list --name 9router-staging

# Rollback to the previous deployment version
npx wrangler rollback --name 9router-staging
```

### Option B: Local Rebuild & Redeploy
Check out a known stable commit and redeploy:

```bash
git checkout <stable-commit-hash>
npm run build:worker
npx wrangler deploy
```

---

## 5. Troubleshooting & Common Pitfalls

| Symptom | Cause | Solution |
| :--- | :--- | :--- |
| `HTTP 503` on `/api/health` | `TURSO_DATABASE_URL` or `TURSO_AUTH_TOKEN` is missing or invalid. | Run `npx wrangler secret put TURSO_AUTH_TOKEN` and verify `TURSO_DATABASE_URL` in `wrangler.jsonc`. |
| `HTTP 403 Forbidden` on `/dashboard` | Remote worker does not bypass auth for non-localhost clients (`isLocalRequest` is false). | Log in via `/login` with valid credentials or include `Authorization: Bearer <token>`. |
| Bundle size warning (`> 3 MB`) | Static assets bundled into worker code instead of asset binding. | Ensure `wrangler.jsonc` has `"assets": { "directory": ".open-next/assets", "binding": "ASSETS" }`. |
| `Uncaught Error: setServers` | Legacy DNS resolver code executed. | Verify that `src/lib/tunnel/shared/dnsResolver.js` has the defensive try-catch patch applied. |
