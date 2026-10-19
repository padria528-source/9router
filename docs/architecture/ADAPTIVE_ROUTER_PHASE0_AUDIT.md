# Adaptive Intelligence Router — Phase 0 Repository Audit

Status: BLOCKED for advancement; discovery and scoped offline checks completed. This is not production acceptance.

## Scope and preservation

User-authorized repository audit and specification drafts only. No production source changes, installations, provider inference, deployments, credential edits, data migrations, external writes, commits or changes to other repositories. Source is authoritative; vault notes are historical context only. Existing credentials and user databases were not opened. Nonsecret Hermes model settings were inspected without printing the configuration.

Repository: `C:/Users/PADRI ALI/AntiGravity/9router` (confirmed; no D: relocation needed).
Branch: `migrate-turso`, tracks `origin/migrate-turso`.
Baseline: `c6b99e44cefc9294c20ecd440ce631962318d9b2`.
Initial worktree: clean; staged and unstaged diff checks exit 0.
Recent history: c6b99e44 nonstream response formats; 7258476f custom Railway/upstream merge; a99cf572 upstream 0.5.95; fbcaa282 Responses completion watchdog; 7111db35 usage completion timing.

## Stack and extension seams

- Root package `9router-app` 0.5.95: plain JavaScript, Next.js 16 declared, React 19.2.4, ESLint 9. No TypeScript migration is needed. Installed host Node v24.16.0 / npm 11.13.0; Docker targets Node 22 Alpine. Package versions are declarations, not assertions of every resolved dependency.
- Root development/start scripts specify 20127; Docker specifies PORT=20128. Historical URLs must not override actual deployment configuration.
- Compatibility routes `/v1/chat/completions`, `/v1/messages`, `/v1/responses`, `/v1beta/*` are rewritten by `next.config.mjs:60` to Next API routes.
- `src/sse/handlers/chat.js:70` authenticates according to settings, detects capabilities at :94, expands combos at :97, selects accounts at :235, and invokes `handleChatCore` at :270. Adaptive policy belongs after auth and before dispatch, not in a duplicate gateway.
- `src/sse/services/model.js:38` resolves provider IDs/aliases/custom node prefixes, prioritizes combo names, and reuses the open-sse resolver. `open-sse/config/providerModels.js:3` now derives models from registry entries; its older description as a separate authoritative matrix is stale.
- `open-sse/providers/registry/*`: per-provider definitions; generated index must not be hand-edited. Capabilities and reasoning control already live in `open-sse/providers/capabilities.js`, `thinkingLevels.js`, and `translator/concerns/thinkingUnified.js`.
- `open-sse/executors/index.js:70` chooses specialized executors or DefaultExecutor. Existing translation, refresh, account cooldown and stream infrastructure must be reused.
- `src/modes/orchestrator.js` implements Single/Tunggal, Council/Dewan, Debate/Debat. `src/app/api/dashboard/chat/completions/route.js:76` forwards single calls and :103/:141 invokes the existing mode orchestrator. These are separate from routing policy and must stay operational.

## Persistence and security boundaries

Both `src/lib/localDb.js` and `src/lib/usageDb.js` are SQLite-layer shims. Usage is no longer necessarily a separate usage.json/log.txt subsystem. `src/lib/db/paths.js:6` stores `DATA_DIR/db/data.sqlite`; Windows fallback is APPDATA/9router via `src/lib/dataDir.js:8`. Driver chain is Bun / better-sqlite3 / node:sqlite / sql.js; Node >=24 skips better-sqlite3. Optional Turso mirror wraps local storage after migrations (`driver.js:71`). Never test against inherited Turso credentials.

`custom-server.js:49` derives socket peer identity and removes forged forwarding/peer headers. `src/dashboardGuard.js:151` validates keys and :224 gates remote compatibility APIs; local-only routes have a distinct gate. The key repository's `validateApiKey` returns a boolean (`apiKeysRepo.js:70`), not an owner object. Adaptive ownership therefore needs a narrowly projected active-key ID without changing existing auth callers. Existing local bypass does NOT authorize future verification callbacks. New task/evidence APIs require explicit authenticated principals even on loopback. Preserve JWT/session auth and provider refresh behavior.

Existing `cc`/`cx` registry transports have deprecation/RISK_NOTICE markers and CLI identity headers; Claude also declares OAuth tool cloaking. Existing adapter presence is NOT proof of officially supported third-party subscription access. Adaptive eligibility must exclude such paths unless a supported, documented integration is established; do not add impersonation, session-cookie extraction or token import to this project.

Privacy debt: request details/debug logging can contain content. `src/proxy.js:36` can log a cookie-header prefix on one anomaly path (static finding, not exploit reproduction). `src/lib/db/repos/usageRepo.js:136` returns cost 0 when price/usage is absent and :289 writes empty meta; adaptive telemetry must retain null/unknown separately rather than infer free use or verification. No remediation is performed in this documentation phase.

## Model evidence

Static catalog entries are not account availability:

- Claude Code `cc`: Sonnet 5.5 `claude-sonnet-5-5`, Opus 5.5 `claude-opus-5-5`; only Haiku 4.5 appears. Haiku 5.5 was not found in the engine catalog. Direct `anthropic` static catalog is older.
- Codex `cx`: `gpt-6-luna`, `gpt-6-sol`, `gpt-6.1-sol`, `gpt-6-astra`. Direct `openai` static catalog lacks GPT-6 entries. Keep Sol version explicitly pinned; do not choose 6.1 merely because it is first in the catalog or currently selected in a session.
- Direct `gemini`: `gemini-3.5-flash-lite`, `gemini-3.7-flash`, `gemini-3.8-flash`, `gemini-3.1-pro-preview`; Antigravity has separate upstream mappings. No approved L4 Pro ranking or account capability evidence was collected.
- Official docs retrieved support GPT-6 Luna/Astra and GPT-6.1 Sol model IDs, and Gemini 3.8 Flash. Public documentation is not account permission or live inference evidence. Claude effort docs mention Opus 5.5 while overview tables differ; use exact model/account evidence rather than extrapolation.
- GPT-6.1 Sol tools require Responses; Chat Completions does not support its tool calling. Luna tools with low effort require Responses. Gemini 3.8 Flash supports low/medium/high, not minimal. Generic existing reasoning normalization clamps some inputs; adaptive strict rejection must precede it and validate the final wire request.

## Integrations and read-only service checks

- Hermes default profile config: provider=custom, base_url=`https://9router-online-production.up.railway.app/v1`, persisted default=`cc/claude-opus-5-5`. Current conversation explicitly reports `cx/gpt-6.1-sol`; session selection and saved default differ and neither was changed.
- `docs/integrations/hermes.md` confirms standard Bearer gateway compatibility, but its recommendation to put an API key in config conflicts with current Hermes skill guidance; do not copy that practice.
- Hermes official index exposes middleware and observer hooks. Their existence is documented; installed runtime compatibility and custom `/provider` or `/routing` commands are NOT proven. Separate Phase 8 plugin integration; no Hermes Core changes.
- TCP connection attempts: 127.0.0.1:20127 and :20128 refused (10061); :5678 accepted. No local gateway was started.
- GET `http://localhost:5678/healthz`: HTTP 200, status=ok. This proves health only, not workflow integration. No n8n source or workflow credentials were read; no n8n integration file was found in repository-name search.
- GET Railway `/api/health`: HTTP 200, ok=true. GET `/api/version`: HTTP 200, commit=c6b99e4, deploymentMode=local. This metadata does not prove full deployment SHA or hosted login restrictions.
- Hosted browser Codex UI branch (`providers/[id]/page.js:1741`, `OAuthModal.js:386`) blocks local browser OAuth and exposes existing alternatives. Server auto-import uses `isHosted()` (`api/oauth/codex/auto-import/route.js:16`). Public host reporting local is a configuration discrepancy requiring inspection before acceptance; not a confirmed credential leak. Do not change production settings or restore removed login features.
- No railway-specific repository config file was found. Dockerfile and existing deployment-mode helpers are the inspectable deployment contract. Railway account/variables/volume topology were not inspected.

## Executed verification

No paid traffic. Only public docs/health/version GETs; no model-list calls that may invoke dynamic credential refresh.

| Command/check | Exit | Result |
| --- | --- | --- |
| git root/status/branch/log/HEAD | each 0 | repository confirmed, clean |
| node --version; npm --version | each 0 | v24.16.0; 11.13.0 |
| direct local installed Vitest, selected 10 files, JSON reporter | 0 | 198 passed, 0 failed, 0 skipped |
| node --loader ./helpers/aliases-loader.mjs --test, four native files | 0 | 38 passed, 0 failed, 0 skipped |
| verify-no-regression.mjs focused-results.json | 0 | scoped assertions only; not full-suite acceptance |
| verify-alias.mjs | 0 | alias snapshot equal |
| verify-oauth-urls.mjs | 0 | OAuth URL snapshot equal |
| verify-providers.mjs | 1 | pre-existing codex.headers snapshot drift |
| git diff --quiet; git diff --cached --quiet | each 0 | no tracked edits before docs |

Selected Vitest files: capabilities, capabilities-sonnet-5-5, combo-routing, combo-capabilities, combo-fusion, chat-modes, deployment-mode, local-request-peer-trust-3294, nonstream-provider-client-format, translator/thinking-unified. JSON reporter calls nested describe groups suites (45); file count is 10, not 45 files. Native files: auth/saml, unit/cline-auth, unit/kimchi, unit/kimchi-strip-reasoning.

Evidence directory: `C:/Users/PADRI ALI/AppData/Local/hermes/cache/scratch/adaptive-router-phase0/`: focused-results.json, focused-run.log, native-run.log, focused-regression.log, catalog-checks.json, tracked-before.json. Test environment used isolated DATA_DIR, disabled background refresh, removed inherited provider-key/token/Turso variables. No user database was used.

## Baseline limits and technical debt

Historical committed baseline-results.json: 674 total tests, 628 passed, 26 failed, 20 pending; 209 reported suite groups, 17 failed groups. Current known-fails.txt has 24 entries, not the 26 claimed in CLAUDE.md. Current tests source inventory has 337 *.test.js files. These figures refer to different artifacts, not a freshly executed full baseline.

Full offline baseline, ESLint and build were NOT run. Root `npm test` delegates to tests Vitest; the manifest no longer hardcodes old Unix paths. Native suites are excluded by Vitest and need separate execution. `tests/scripts/run-offline.mjs` isolates DATA_DIR and strips Turso, but glob exclusions alone do not guarantee no provider traffic: unit/antigravity-cache.test.js has env-gated real OAuth/inference and reads a user DB. xAI discovery and source initialization also require inspection/mocking. Full baseline needs audited exclusions plus a fail-closed outbound network guard before execution. Cloud embeddings directory is absent; credentialed real/live suites and DB stress tests remain excluded. Build can load local environment/bootstrap; run later in an isolated verified configuration, not against existing secrets or live settings.

Mandatory unresolved gates: provider-snapshot drift disposition; complete safe baseline; account-supported model/effort availability; authenticated verifier/spend authorization; installed Hermes extension version; hosted-login deployment-mode discrepancy. None may be silently relabeled N/A.

## Document and preservation closeout

Four review documents were created. `.gitignore` was changed only to allow those exact documents under the existing ignored docs tree; unrelated documents remain ignored. No production source, authentication, model registry, credentials, deployment settings or user data was changed.

Executed scratch `validate-documents.py`: final exit 0. Checks: all 20 PRD sections, 13 phase entries, 5 proposed ADRs, local document links, no unfinished placeholders, common credential-pattern scan, retained test totals, exact changed-file scope and `git diff --check` (exit 0). A first validation attempt exited 1 because its inventory assertion did not account for the original intentional `.env.example` exclusion; the check was corrected to disclose the subset, not to ignore a changed source file.

Preservation evidence: 1,739 pre-task tracked-file hashes compared; 1,738 unchanged, only `.gitignore` intentionally differs. The remaining tracked `.env.example` was deliberately excluded from content/hash reads and verified separately by `git diff HEAD --quiet -- .env.example` (exit 0) against the initially clean worktree. Untracked/ignored user credentials and data were not byte-audited; no write operation targeted them. Scratch evidence includes `document-validation.json` and the runnable validator. This is documentation validation, not a full code/build/security acceptance.

## Phase disposition

Phase 0: BLOCKED for mandatory baseline gate. Phase 1 documents may be drafted as safe independent work, but are NOT approved. Phase 2+ execution remains BLOCKED. Next safe action: review the three specification drafts, approve the pinned Sol version and safe account/fallback policy, then authorize bounded baseline isolation and drift disposition. No implementation or deployment follows automatically.
