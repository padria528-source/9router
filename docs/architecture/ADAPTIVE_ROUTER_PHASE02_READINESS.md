# Adaptive Router Phase 0.2 — readiness and owner decisions

Status: PARTIAL; Phase 0 BLOCKED; Phase 1 review complete, owner approval pending; Phases 2–12 LOCKED. No deployment or runtime-model approval. Baseline HEAD: c6b99e44cefc9294c20ecd440ce631962318d9b2 on migrate-turso.

## Hosted security and authorization

The shared server deployment check no longer lets explicit local mode override a public URL, conflicting public URL, invalid URL/scheme/mode or Railway hosting marker. Host-credential access additionally requires positive local configuration; an unconfigured server denies that capability. Browser detection is not a server authorization boundary.

Codex, Cursor, Kiro, Zed and MiMo import handlers deny before host reads when hosted/ambiguous. OpenAI status diagnostics do not inspect host credentials in that state. The dynamic OAuth handler denies desktop proxy/session actions, Codex authorization and MiMo desktop-pass-token access under the same condition. Middleware applies the hosted restriction before dashboard/CLI authentication, and all auto-import paths use the existing local-peer/authentication gate. No host/IP-header trust model was weakened. Explicit local synthetic authentication remains covered.

The independent source review found four additional issues, remediated before closeout: shared MiMo usage/session acquisition no longer implicitly reads Desktop cookies (explicit per-connection credentials remain supported, including hosted); desktop proxy/session/authorization actions and local MiMo exchange require a trusted local caller plus JWT or CLI authentication even with requireLogin=false; completed/failed poll responses allowlist status/connectionId and fixed error instead of private verifiers or access tokens; the CLI child environment defaults DEPLOYMENT_MODE to local only when absent, preserving configured modes, conflicting URLs and hosting markers. MiMo session diagnostics omit raw upstream bodies and arbitrary exception content. Review follow-up regressions pass; the independent reviewer did not rerun or approve the repaired code. The explicit Desktop-import helper remains a local capability protected by its callers; no provider inference/account access was used to validate it.

These are local-source controls, not proof that the deployed public service is hardened. Read-only Railway metadata identified service 9router-online, successful deployment of the baseline commit, one sfo replica, Dockerfile builder, public target port 8080 and /app/data volume. Exact environment variables and authenticated restrictions were NOT retrieved. Public GET health/version returned 200, version reported deploymentMode=local; providers and Codex auto-import returned 401. No credential values, live auth-changing requests, Railway writes or deployments were performed. Production acceptance remains BLOCKED.

## Verification evidence

Evidence root: C:/Users/PADRI ALI/AppData/Local/hermes/cache/scratch/adaptive-router-phase02. commands.json records individual argv, cwd, exits, environment key names and logs, including failed attempts. replay.py rebuilds the sanitized guarded environment; it does not restore real user credentials. The checked-in test:offline wrapper is not equivalent to this guard: it omits the Antigravity cache exclusion and does not sanitize all live opt-in flags/credentials.

- Initial hosted-security RED: 20 failed / 5 passed. Initial focused scope: 106 passed / 0 failed. Review follow-up focused scope: 69 passed / 0 failed, including supplied hosted-credential success, no implicit host reads, caller locality, poll payload and CLI-env regressions.
- Final broad guarded scope: 3,221 passed / 0 failed, 13 skipped and one todo, across 318 unique test-result files. The skipped/todo assertions are not PASS. Regression comparator exit 0.
- Owned-fixture positive controls passed before broad execution; external, unowned-loopback, public-bind and closed-fixture negative controls passed.
- Native SAML/Cline/Kimchi/Kimchi reasoning: 4/4/21/9 passed independently; each exit 0.
- Provider, alias and OAuth-URL snapshots passed; no snapshot refresh in Phase 0.2.
- Secret-free cached-Inter build retry and separate final postbuild exited 0. Seven emitted Inter hashes match the retained real font assets; standalone assets verified. Default font acquisition is not made network-free by this build-only input. No standalone server started; no dedicated typecheck PASS claimed.
- Two deterministic reasoning-to-chat checks from the mixed DeepSeek live suite passed through a scratch-only assert probe, without enabling/importing the live suite or reading its credential store.

## Legacy lint governance — PROPOSED, not owner accepted

Clean HEAD and current source use the same 1,338 tracked-file inventory. HEAD: 145 errors / 210 warnings, exit 1. Current: 144 errors / 210 warnings, exit 1. Zero introduced errors or warnings. One removed error was a stale Cursor import suppression for an unavailable TypeScript ESLint rule; no global rules were disabled. Focused changed/added JavaScript lint: zero findings, exit 0.

The immutable HEAD diagnostic inventory is tests/__baseline__/legacy-eslint-baseline.json. The checker tests/__baseline__/verify-legacy-eslint.mjs compares path/rule/severity/message multiplicities, tolerating only shifted locations. New or duplicated errors/warnings fail; a synthetic new-warning negative control failed as expected. Run it against saved installed-ESLint API JSON: node tests/__baseline__/verify-legacy-eslint.mjs <report.json> <repository-root>. Exact inventory and ESLint runner are in evidence. It is not a substitute for global lint PASS, focused lint or a complete inventory.

Recommended owner disposition: accept the exact HEAD inventory as time-bounded legacy debt only if the owner explicitly approves its scope, assigns accountable remediation owners and dates, and retains zero-new-error/zero-new-warning plus focused-lint gates. Security findings require separate triage; baseline membership never waives a critical security defect. Do not refresh this baseline automatically or treat the proposal as a satisfied mandatory Phase 0 gate. Global lint remains FAIL.

## Excluded coverage and expanded safe checks

Nineteen unique excluded files were source-reviewed; exclusions overlap. Exact per-file classification and prerequisites are retained in excluded-review.json and excluded-inventory.json.

- Fourteen translator/real files (13 *.real.test.js plus NVIDIA E2E) and mimo-free.live.test.js: NOT RUN. Credential reads/refresh, external inference and potential paid/quota effects require separate endpoint/account authorization and bounded call budgets. Free-tier labels do not establish safety. Some surveys assert true for any capability outcome; future live green results need outcome-level review.
- antigravity-cache.test.js: NOT RUN. Highest-risk collection path reads ~/.9router/db.json even inside skipped describe setup, ignoring DATA_DIR; live sections refresh OAuth, call inference and log account identifiers. Preserve its explicit filename exclusion, not only live opt-in flags.
- embeddings.cloud.test.js: BLOCKED_MISSING_SOURCE; cloud handler absent. Intended mocks are deterministic, but no fake implementation was created.
- db-benchmark.test.js: attempted in sanitized scratch, exit 1 during collection because lowdb is absent. Five reported skips are not five executed benchmark passes. Timing performance acceptance remains unverified; dependency/stress infrastructure and Windows adapter cleanup require a separate scope.
- db-concurrent.test.js: sanitized isolated synthetic execution, 5 passed / 3 failed, exit 1. Clean HEAD reproduces 5/3. Identical same-millisecond usage records can deduplicate; no accounting changes were made. This is a pre-existing unresolved accounting/stress gate, not a regression or waiver.
- Thirteen broad skips are RTK gateway E2E assertions requiring configured routes/log evidence and potentially real provider calls. One todo is deterministic Responses-input DeepSeek thinking replay coverage not yet implemented. Both remain unverified.

Reuse existing mocked transport, session, MiMo, RTK and embeddings-core tests; those are protocol evidence, not upstream entitlement or live acceptance. Keep RUN_REAL/RUN_E2E/AG_CACHE_TEST disabled, inherited provider/Turso credentials absent, data and temporary roots scratch-owned, background refresh disabled and outbound guard tested.

## AIR-01 through AIR-05 recommended approval matrix

All five records in ADAPTIVE_ROUTER_ARCHITECTURE.md remain Proposed. No owner approval is inferred.

| Decision | Recommendation/rationale | Risks | Required owner approval | Remaining prerequisites |
|---|---|---|---|---|
| AIR-01 In-process policy, existing transports | Recommend conditional approval; reuse existing translation/auth rather than a sidecar | Optional guard must reach nested dispatch sites; mode/stream regressions | Integration scope and execution method | Feature-off fixtures, mode identity, phase gates, scoped security review |
| AIR-02 External verification, client-owned tools | Recommend conditional approval; objective evidence without gateway shell access | Compromised verifier, forged/stale/replayed evidence, tool replay | Verifier authority, key custody/rotation, client operation approvals | Authenticated principal before policy; signature/nonce/subject ownership and UNVERIFIED-negative tests |
| AIR-03 Disabled then shadow, exact pinned ladders | Recommend shadow-first policy; defer exact runtime binding approval | Catalog presence mistaken for supported access; speculative paid calls; wrong Sol variant | Exact runtime Sol version, supported provider/account bindings and unavailable-tier fallback | Zero-call shadow proof, model IDs/efforts/entitlements, rollback and privacy boundaries |
| AIR-04 Atomic local budget ledger, single writer | Recommend conditional design approval; defer active paid readiness | Driver durability, usage dedup/count loss, remote mirror is not coordination, crash unknown outcome | Driver/topology, spend ceilings, price provenance and reconciliation | Resolve DB stress failures; reserve/replay/restart race tests; runtime driver and single-writer durability evidence |
| AIR-05 Manifest context, no gateway crawler | Recommend conditional approval; avoids new SSRF/filesystem authority | Essential context omitted, stale summaries, token estimates mistaken for hard paid limits | Authorized manifests, privacy/retention regions and tokenizer/count source | Closure/overflow/tool pairing/provenance tests, real measured token evidence |

## Phase 5 authorization sequencing

The implementation plan now establishes resolveActiveApiKeyPrincipal(key) -> {principal_id} in Phase 5 before any policy read or post-auth hook. It projects only an active key-row ID and preserves validateApiKey boolean callers. Phase 6 reuses that tested projection and adds verifier-role authorization. No implementation was added. Pure shadow predictions make no provider calls; active exposure remains locked until Phase 6/7 safety gates.

## Model/access policy and remaining readiness

GPT-6.1 Sol is the development model only. Runtime Sol 6 versus 6.1 remains an owner decision. Preserve all provider ladders; catalog strings do not prove entitlements, supported subscription authentication or account access. Haiku 5.5 remains unavailable in the inspected catalog; other bindings are unverified without authorized evidence. No paid verification calls were made.

Phase 0 is BLOCKED by deployed hosted-boundary/config acceptance, formal legacy-lint disposition, unresolved required coverage/accounting gates, and required model/access and Hermes compatibility evidence. Phase 1 review is complete with owner approval pending. Phases 2–12 remain LOCKED, regardless of local tests or these recommendations. Next safe action: owner reviews the exact lint disposition and ADR matrix, supplies non-secret Railway mode/base-URL/runtime-driver evidence, and separately authorizes any deployment, compatibility or accounting remediation. No automatic advancement.
