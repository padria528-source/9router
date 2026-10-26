# Turso durability mirror

9Router normally uses a local SQLite database. On hosts with ephemeral filesystems,
that file can disappear after a restart or redeploy.

This branch adds an optional Turso durability mirror without changing the existing
synchronous database contract used throughout 9Router.

## How it works

- Local SQLite remains the live database for fast synchronous reads/writes.
- When `TURSO_DATABASE_URL` is configured, 9Router connects to Turso at startup.
- The first rollout on a host that already has data (for example Railway + volume)
  automatically seeds Turso from the local SQLite database.
- Runtime writes are mirrored to Turso in order.
- A fresh host restores its local SQLite database from Turso automatically.
- SQLite maintenance PRAGMAs and local backup files remain local.

## Required environment variables

```env
TURSO_DATABASE_URL=libsql://your-db-your-org.turso.io
TURSO_AUTH_TOKEN=your-secret-token
```

Never commit the token.

## Safe Railway -> Turso -> new host rollout

1. Keep the current Railway deployment online.
2. Deploy this Turso-enabled branch to Railway first.
3. Add `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Railway Variables.
4. Redeploy once.
5. Confirm Railway logs show:
   - `[DB][Turso] seeding remote from local SQLite...`
   - `[DB][Turso] initial seed complete`
6. In Turso, verify Rows Written and Storage are no longer zero.
7. Test the existing Railway origin:
   - dashboard loads
   - provider accounts still exist
   - `/v1/models`
   - one streaming chat completion
8. Deploy the same branch to the replacement host with the same Turso variables.
9. On a fresh replacement host, logs should show:
   - `[DB][Turso] restoring local SQLite from Turso...`
   - `[DB][Turso] restore complete`
10. Verify provider accounts, API keys, aliases, combos, usage and routing settings.
11. Only after all checks pass should clients be switched away from Railway.

## Rollback

If anything looks wrong, remove the two Turso variables and redeploy the current
Railway branch. The local SQLite path and existing driver fallback chain remain
unchanged when Turso is not configured.
