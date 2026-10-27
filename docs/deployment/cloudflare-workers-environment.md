# Cloudflare Workers Environment Variables Matrix

**Application:** `9Router v0.5.104`
**Target Runtime:** Cloudflare Workers (`wrangler.jsonc` + Wrangler Secrets)

---

## 1. Environment Variable Reference Matrix

| Variable Name | Purpose | Secret? | Required on Workers? | Default / Example Value | Storage Location | Notes / Validation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `TURSO_DATABASE_URL` | Turso / libSQL HTTP endpoint | No | **YES** | `libsql://9router-staging-org.turso.io` | `wrangler.jsonc` (`vars`) | Must use `libsql://` or `https://` scheme. |
| `TURSO_AUTH_TOKEN` | Turso database JWT token | **YES** | **YES** | `eyJhbGciOi...` | Cloudflare Secrets (`wrangler secret put`) | Generated via `turso db tokens create`. |
| `TURSO_SYNC_INTERVAL_MS` | State polling/sync interval in ms | No | No | `10000` | `wrangler.jsonc` (`vars`) | Optional. Controls background sync frequency. |
| `JWT_SECRET` | Secret key for signing session tokens and cookies | **YES** | **YES** | Minimum 32-character random string | Cloudflare Secrets (`wrangler secret put`) | Required for `/api/auth/*` and dashboard protection. |
| `REQUIRE_LOGIN` | Force login even if accessing via loopback | No | No | `true` | `wrangler.jsonc` (`vars`) | Automatically `true` on remote workers. |
| `NODE_ENV` | Environment mode | No | No | `production` | Set by OpenNext automatically | Controls React production optimizations. |
| `NEXT_PUBLIC_APP_VERSION` | Client-visible version tag | No | No | `0.5.104` | Built into bundle | Injected at build time by Next.js. |
| `DEFAULT_LOCALE` | Default language for UI | No | No | `en` | `wrangler.jsonc` (`vars`) | `en`, `zh`, etc. |
| `DISABLE_RATE_LIMIT` | Bypass API rate limiting | No | No | `false` | `wrangler.jsonc` (`vars`) | Set to `true` only during debugging. |

---

## 2. Setting Variables vs Secrets

### 2.1 Public Variables (`wrangler.jsonc`)
Public configuration that does not contain sensitive tokens should be defined in the `vars` block of `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "TURSO_DATABASE_URL": "libsql://9router-staging-[your-org].turso.io",
    "REQUIRE_LOGIN": "true",
    "TURSO_SYNC_INTERVAL_MS": "10000"
  }
}
```

### 2.2 Encrypted Secrets (Cloudflare Key Management)
Sensitive credentials must be provisioned via Wrangler CLI without being written to files:

```bash
# Upload Turso Token
npx wrangler secret put TURSO_AUTH_TOKEN --name 9router-staging

# Upload JWT Secret
npx wrangler secret put JWT_SECRET --name 9router-staging
```

### 2.3 Local Development Variables (`.dev.vars`)
For local testing with `npx wrangler dev`, create a `.dev.vars` file in the project root (automatically git-ignored):

```ini
# .dev.vars (DO NOT COMMIT)
TURSO_DATABASE_URL=libsql://your-local-or-test-db.turso.io
TURSO_AUTH_TOKEN=your-turso-token-here
JWT_SECRET=super-secret-local-dev-jwt-key-32chars
```
