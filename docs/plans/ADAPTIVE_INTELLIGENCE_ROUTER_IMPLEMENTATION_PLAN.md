# Adaptive Intelligence Router Implementation Plan

> For agentic workers: after owner review and execution-method selection, use `superpowers:executing-plans` for native execution or `superpowers:subagent-driven-development` for separately approved task/reviewer execution. Checkboxes are future work, not completion claims.

Status: DRAFT / EXECUTION BLOCKED. This is the owner-requested phased plan, not permission to implement. Current audit has scoped green evidence and unresolved mandatory baseline gates. Stop after every requested phase; do not advance autonomously.

Goal: add safe deterministic task routing inside existing 9Router, then externally verified escalation, measured context/budget optimization and separately gated integration/swarm.

Architecture: pure policy functions under open-sse; authorization and additive SQLite persistence in src; existing translators/executors/modes unchanged unless an optional adaptive context is present. Client owns tools and verification. No new service, transport stack or dependencies.

Tech stack: JavaScript ESM, Next.js, existing Vitest and node:test, node:crypto, current SQLite adapter chain. Host Node24 differs from Docker Node22; verify the deployed runtime/driver before active money reservations.

Spec: [PRD](../prd/ADAPTIVE_INTELLIGENCE_ROUTER_PRD.md); [architecture](../architecture/ADAPTIVE_ROUTER_ARCHITECTURE.md); [audit/evidence](../architecture/ADAPTIVE_ROUTER_PHASE0_AUDIT.md).

## Global constraints

- No unrelated repositories, Hermes Core, n8n source, Nexus Forge phases, live Railway settings, provider login restoration, credential overwrite or paid inference.
- No commits/push/deploy unless separately requested. Plan review and each phase request are distinct from deployment/spend authorization.
- Feature disabled by default; explicitly enabled initial mode shadow; global and swarm deny by default.
- Exact approved GPT-6 Luna -> pinned Sol -> same Sol -> Astra; GPT-5.x/Terra excluded from adaptive ladder only. Haiku5.5 unresolved until proof, no substitution by display name.
- Classification weights 30/25/20/15/10; tier boundaries 29/30,54/55,79/80; auth/isolation minL3, architecture L4, destructive approval independent.
- Proposed defaults: <=4 task attempts, <=8 actual provider calls, <=1 transient retry/attempt, base250ms/cap4s backoff,120s deadline. All nested executes counted; no stream/tool replay.
- Missing verifier=UNVERIFIED; unknown tokens/cost/quota=null. No host command execution or arbitrary artifact URL/path retrieval from gateway.
- Existing generated registry index regenerated only when provider file set changes; no empty scaffolding or unnecessary package installation.
- Preservation: capture current branch/HEAD/status and protected-file hashes before each phase; compare pre-phase bytes, not just HEAD.

## Review focus

1. Legacy alias/combo named `auto` or adaptive-looking strings: opt-in policy cannot seize it. Phase2/5 negative collision fixtures.
2. Disconnect after upstream accepted but before usage: no immediate refund/automatic retry. Phase6/7 unknown-outcome fixture.
3. Gemini normalization increases output cap: budget/wire guard rejects overspend, not silently reserves original small cap. Phase4/7 fixture.
4. Local auth disabled: evidence/task endpoints still require explicit principal/verifier auth. Phase6 negative fixtures.
5. sql.js or mirrored DB restart/concurrent writers: shadow usable, active money ledger blocked unless atomic durable semantics are proven. Phase7/10 fixture/topology gate.

## Execution and evidence rules

Each implementation task below follows one test cycle:
- [ ] Write named failing tests with exact assertions; no real provider/tool/host side effects.
- [ ] Run only that task's test file with installed runner; record RED command/exit independently. Import failure is not the desired assertion failure.
- [ ] Implement the smallest phase scope, with exact signatures listed below; match existing style and reuse inspected modules.
- [ ] Run focused GREEN tests, sibling regression tests and applicable catalog checks; record every command/exit separately.
- [ ] Review security/diff/preservation, update phase gate with evidence, stop for owner review. Commit only if explicitly authorized.

Focused command template from repo root: `node tests/node_modules/vitest/vitest.mjs run --root tests unit/adaptive-<component>.test.js --reporter=json --outputFile=<absolute-scratch-report>`; validate --root/config resolution at Phase2 preflight, do not guess aliases. Alternative: run `node node_modules/vitest/vitest.mjs run unit/adaptive-<component>.test.js` from tests. Use native runner only for node:test suites.

Execute in an isolated child environment: temporary DATA_DIR under Hermes scratch, disabled background refresh, remove provider tokens/keys/Turso configuration before imports. This is not enough alone: inspect all imported bootstrap/test definitions and apply an audited deny-network harness before broad runs. Do not invoke npx installation fallback. No inherited user databases. Record command, cwd, environment variable NAMES (not values/secrets), timeout, exit, passed/failed/skipped/collection-error counts and report path. Keep isolated logs outside repo; never rewrite golden snapshots to produce PASS.

Phase gate definition: PASS requires all listed mandatory tests/security/dependencies and owner acceptance; FAIL means executed assertion/policy failure; BLOCKED means required prerequisite/evidence/authorization missing. A completed draft or selected green tests do not imply whole-phase PASS. Every dependent phase remains BLOCKED until previous mandatory gate cleared. Documentation drafting is the permitted independent work, not executable advancement.

## Phase status matrix (current)

| Phase | Status | Current evidence / dependency |
| --- | --- | --- |
| 0 Repository audit | BLOCKED | 198 focused Vitest +38 native pass; provider snapshot fails; full safe baseline/build/lint unexecuted |
| 1 PRD/architecture/plan | BLOCKED | review drafts produced; owner approval and Phase0 mandatory disposition absent |
| 2 Model registry | BLOCKED | Phase0/1 gates; exact supported account bindings unresolved |
| 3 Classification | BLOCKED | prior gates; no classifier implementation |
| 4 Provider adaptation | BLOCKED | per-endpoint effort/capability approval and prior gates |
| 5 Routing/shadow | BLOCKED | prior gates; no feature flag/hook implemented |
| 6 Verification/escalation | BLOCKED | trusted verifier authority/contract and prior gates |
| 7 Context/budget | BLOCKED | token/pricing source, spend policy, durable ledger proof |
| 8 Hermes compatibility | BLOCKED | installed supported extension version and explicit scope |
| 9 Evaluation | BLOCKED | frozen fixtures/quality tolerance; paid authorization absent |
| 10 Controlled rollout | BLOCKED | evaluation, hosted login/topology, explicit deployment approval |
| 11 Worker swarm | BLOCKED | standalone acceptance, bounded budget/worker permissions |
| 12 Final acceptance | BLOCKED | all required gates and objective workload evidence |

## Phase 0 — Repository audit closeout

Scope: existing code/integrations/storage/auth/tests/catalog; no production edits. Dependencies: repository access and audit-safe execution.
Deliverable: Phase0 audit with baseline SHA/source paths, discovery and preservation, test/exclusion evidence, technical debt and exact blockers.

- [x] Confirm C: repository/branch/c6b99e44, initial clean worktree, manifest/current JavaScript/Next stack.
- [x] Trace chat/model resolution/executor/thinking/auth/modes/storage and static provider IDs; inspect nonsecret integration/deployment metadata.
- [x] Execute 10 focused Vitest files (198 pass) and4 native files (38 pass); scoped no-regression, alias/OAuth checks pass.
- [x] Record provider snapshot exit1 on codex.headers; leave snapshot intact.
- [ ] Expand safe offline runner coverage after inspecting real OAuth/DB/bootstrap paths; apply fail-closed network/data isolation.
- [ ] Run allowed full offline suite with exact exclusions and separate native runner; compare exact known failures, collection errors and hangs.
- [ ] Run isolated ESLint/build when environment-loading/bootstrap safety verified; do not load current secrets or production DB.
- [ ] Resolve/disposition provider snapshot drift with owner; no silent baseline refresh.

Acceptance tests: command exit logs, baseline comparison, protocol/auth/mode regressions, source preservation hashes. Security: no live provider/remote DB/user-data access, hosted settings untouched. Status BLOCKED. Unknown full baseline cannot be replaced by historical 628/674 figures.

## Phase 1 — Specification review

Scope: documents only, proposed ADRs and phase/risk criteria. Dependencies: audited source; unresolved Phase0 gates explicitly retained.
Deliverables: requested PRD with20 sections, architecture/ADRs, this plan, audit.

- [x] Write review drafts under owner-requested paths, not a standalone project.
- [x] Validate links/sections/phase matrix/negative requirements and exact source/model tokens; scratch document validator exits 0 (20 sections,13 phases,5 ADRs,links,preservation). This does not replace owner approval or production acceptance.
- [ ] Owner reviews architecture/PRD and approved Sol pin/fallback/access/privacy policy.
- [ ] Owner reviews plan and selects native or subagent-driven execution before Phase2.

Acceptance: document validator passes and owner approves; mandatory Phase0 gates resolved before executable advancement. Security: no secrets in docs, only targeted Git ignore exceptions; no routing/config/runtime edits. Status BLOCKED pending review.

## Phase 2 — Model registry (Task R)

Scope: versioned adaptive binding/config validation; not provider credentials/network probing.
Dependencies: Phase0/1 PASS; approved exact Sol version; documented/account-scoped evidence and fallback policy for intended families. Offline unresolved records may exist, but live acceptance remains blocked until supported access evidence.
Files proposed: `open-sse/config/adaptiveRouter.js`, `open-sse/adaptive/registry.js`, `tests/unit/adaptive-registry.test.js`. Reuse `providers/registry`, `capabilities.js`, `thinkingLevels.js`, `services/model.js`, `src/sse/services/model.js`; modify existing registry entries only after separate binding review.
Interfaces: `validateAdaptiveRegistry(config, catalog, now) -> {ok, registry?, errors[]}`; `eligibleBindings(registry, constraints, availability, now) -> {candidates, rejected[]}`. No secret-bearing input, no fetch.

- [ ] RED `rejectsUnresolvedHaiku`: unavailable Haiku5.5 does not become Haiku4.5.
- [ ] RED `pinsSolVersion`: L2/L3 must share identical model/provider/endpoint version; registry never upgrades6 to6.1; GPT5/Terra binding rejects.
- [ ] RED `rejectsAliasCollisionAndCycles`: combo/built-in/provider-node collisions and recursion reject.
- [ ] RED `excludesUnsupportedAndExpiredAccess`: STATIC_CATALOG/risk-marked identity transport/missing approval/expired evidence are ineligible; explicitly authorized supported account fixture is eligible.
- [ ] Implement minimal registry overlay referencing existing models and endpoint capability evidence; no new provider files unless necessary and approved.
- [ ] GREEN registry tests + capabilities, aliases, provider/OAuth snapshots; valid unresolved records remain visibly unavailable, not false errors masked as PASS.

Deliverable: validated bindings/approved fallback mapping with evidence provenance. Security: no OAuth/session import/identity imitation/new secrets. Acceptance AC01 and stale/collision negative tests. Status BLOCKED.

## Phase 3 — Deterministic classification (Task C)

Files: create `open-sse/adaptive/classifier.js`, `tests/unit/adaptive-classifier.test.js`; reuse adaptiveRouter constants.
Interface: `classifyTask(metadata, trustedPolicy) -> {score, components, score_tier, effective_min_tier, uncertainty, approval_required, reasons}`; pure function with no model calls.

- [ ] RED `scoreBoundary` parameterized five-equal-component fixtures assert29=L1,30=L2,54=L2,55=L3,79=L3,80=L4; weighted fractional result floors.
- [ ] RED `rejectsMalformed`: strings, NaN,Infinity,negative,101,unknown flags/shape reject.
- [ ] RED `unknownConservative`: all missing -> components75,score75,L3,uncertaintyHIGH; trusted safety signals cannot be downgraded by client fields.
- [ ] RED `safetyOverrides`: auth/isolation minL3; architecture L4; destructive approval_required at all tiers; fixed mode advisory does not change selected model.
- [ ] Implement rubric per PRD9, explicit signal provenance; context-size filter and evidence failures remain separate from weights.
- [ ] GREEN exact component/threshold/override tests with no network and deterministic same-input equality.

Dependencies Phase2 PASS; deliverable deterministic classifier/rubric version. Security: no prompt-based authorization, no unsafe tier-only approvals. Acceptance AC03. Status BLOCKED.

## Phase 4 — Provider effort/capability adaptation (Task E)

Files: `open-sse/adaptive/effort.js`, `tests/unit/adaptive-effort.test.js`; optional guard edits in `thinkingUnified.js`, `chatCore.js`, provider executor paths ONLY as required by inspected wire route. Existing translator tests remain mandatory.
Interfaces: `resolveAdaptiveEffort(binding, requestedEffort, requirements) -> {native_fields, endpoint, applied_effort}` or structured error; `validateAdaptiveWire(binding, body, limits) -> {ok, errors[]}`. Both pure. Native body building/execute stays existing code.

- [ ] RED `rejectsUnsupportedEffort`: Gemini3.8 minimal/max reject absent approved mapping; unsupported Anthropic/OpenAI efforts fail before network, no generic fallback to high/xhigh.
- [ ] RED `toolsEndpoint`: Sol6.1 tools and Luna-low tools require upstream Responses; preserve all tool IDs/arguments/results through compatible-client translation or block unsupported route.
- [ ] RED `outputFloorOverspend`: final Gemini output cap increased by legacy normalizer cannot exceed adaptive reservation/owner output cap; reject.
- [ ] RED `legacyNormalizerUnchanged`: optional guard absent produces current golden wire bodies; no change to fixed clients.
- [ ] Implement exact evidence-backed field mappings, strict preflight and final-wire checks; read every execute/retry caller before introducing guard.
- [ ] GREEN thinking-unified/nonstream/client-format/stream/schema fixtures, actual upstream-body spy assertions and rate-limit/cancel propagation.

Dependencies: registry/classifier PASS, exact endpoint docs/account evidence. Deliverable common normalized adapter handoff and strict reasoning validator. Security: no credentials/hidden state in decision/handoff logs. Acceptance AC04. Status BLOCKED.

## Phase 5 — Routing and shadow (Task D)

Files: `open-sse/adaptive/router.js`, `src/lib/adaptive/service.js`, `tests/unit/adaptive-routing.test.js`, `tests/unit/adaptive-shadow.test.js`; optional post-auth hook in `src/sse/handlers/chat.js`; additive config via current settings pattern. Add the minimal principal projection in the existing API-key repo before any policy read or hook integration. No evidence APIs until Phase6.
Interface: `decideRoute(request, policy, registry, availability) -> RouteDecision` (architecture3); `observeShadow(requestSnapshot, decision, telemetrySink) -> void` best-effort, no request mutation/account access. Export task service interfaces only when needed.

- [ ] RED `principalBeforePolicy`: missing/invalid/inactive gateway key denies opt-in routing even with local bypass or dashboard authentication; cross-principal policy reads deny; feature-off remains unchanged.
- [ ] Implement `resolveActiveApiKeyPrincipal(key) -> {principal_id}` additively in the current key repo, projecting the active key-row ID only. Preserve `validateApiKey` boolean callers; never return raw keys, names or machine metadata. Complete before installing the post-auth hook or reading adaptive policy.
- [ ] RED `familyConstraint`: provider-bound never crosses family; global requires explicit approved provider/privacy fallback order; no eligible candidate returns blocker.
- [ ] RED `featureOffIdentity`: request/stream/native tool fixtures unchanged, existing alias/combo named auto unchanged.
- [ ] RED `shadowNoEffects`: frozen body unchanged; executor/refresh/account rotation/reservation call deltas all zero; prediction failure does not block legacy response; predicted and actual route distinct.
- [ ] RED `modeOrthogonality`: Single/Council/Debate tests unchanged; active adaptive+Council/Debate composition rejects until separately supported rather than silently changing panel calls.
- [ ] Implement master flag false, enabled default shadow, active/global flags false and explicit authenticated-principal policy. Persist privacy-safe decisions with existing DB only when additive storage is approved.
- [ ] GREEN routing/shadow + combo-routing/capabilities/fusion/chat-modes/nonstream/peer-trust fixtures; rollback to disabled.

Dependencies Phase4 and previous mandatory gates, including the Phase5 principal-lookup/negative-authorization gate before hook integration. Deliverable deterministic route prediction and minimal integration without default mutation. Active exposure remains locked until Phase6/7 safety gates; pure routing fixtures may test active decisions without dispatch. Security: zero added provider calls; no raw prompt telemetry. Acceptance AC02/04/09. Status BLOCKED.

## Phase 6 — External verification, bounded escalation/circuits (Tasks V and X)

Files: `src/lib/adaptive/evidence.js`, `open-sse/adaptive/escalation.js`, `src/lib/db/repos/adaptiveRepo.js`, next actual migration under `src/lib/db/migrations/`, task/evidence/continue/status routes under `src/app/api/adaptive/v1`; `tests/unit/adaptive-evidence.test.js`, `adaptive-escalation.test.js`, `adaptive-contract.test.js`. Reuse the minimal `resolveActiveApiKeyPrincipal(key) -> {principal_id}` projection established and tested in Phase5. `validateApiKey` remains boolean; verifier-role authorization is an additional Phase6 requirement, not a replacement for principal binding.
Interfaces: `validateEvidence(rawBody, requestBinding, verifierPolicy, clock) -> validatedEvidence`; `transitionTask(task, evidence, limits, clock) -> {state,next_tier?,reason}`; `claimProviderCall(taskId, attemptId, deadline) -> {allowed,call_number}` atomically; repo owns transaction and CAS. `updateCircuit(state, outcome, now) -> newState` pure default3 failures/60s,open30s,single half-open claim.

Task V:
- [ ] RED `localAuthStillRequired`: no gateway key or missing verifier role denies even loopback; task reads cross-principal deny.
- [ ] RED `evidenceForgeryReplay`: wrong MAC,expired timestamp/TTL,reused nonce/conflicting payload,wrong task/attempt/digest,missing required check,extra unknown field all reject; identical evidence delivery idempotent.
- [ ] RED `noVerifierNoSuccess`: absent evidence UNVERIFIED; envelope-valid inference not coding success; passing wrong artifact digest rejects.
- [ ] Implement strict bounded evidence schema/HMAC/principal binding and additive records; submit/continue never execute host commands or artifact URL fetches.
- [ ] GREEN contract/evidence/schema/ownership tests and negative header-injection/auth fixtures.

Task X:
- [ ] RED `boundedLadder`: fresh verifier failure progresses exact Luna/Sol-medium/Sol-high/Astra; startingL3 permits only L3/L4; L4failure terminal; confidence-only unchanged.
- [ ] RED `nestedCallCap`: original execute/auth-retry/account-fallback/executor retries share <=8 guard,task attempts<=4; attempts/deadline/budget stop independently.
- [ ] RED `cancelAndPartialStream`: fake-time backoff obeys Retry-After/deadline/abort; delivered bytes/tool output cannot reissue; timeout unknown outcome no replay.
- [ ] RED `circuitIsolation`: rate/infrastructure opens, verifier quality failure does not; single half-open claim; no background paid probe.
- [ ] Implement optional guard through existing loops/execute sites without changing legacy behavior; client continuation requires ledger/operation approval for side-effectful tools.
- [ ] GREEN failure/cancel/identity/idempotency/race fixtures and full permitted regression checks.

Dependencies previous gates, approved verifier authority/schema/limits and DB transaction support. Deliverable authenticated evidence state machine and safe bounded escalation; external verifier unavailable remains BLOCKED for live verification acceptance. Security: no shell/SSRF/tool replay, scoped secret safe storage and rotation. Acceptance AC05/06. Status BLOCKED.

## Phase 7 — Context and accounting (Tasks S and B)

Task S files: `open-sse/adaptive/context.js`, `tests/unit/adaptive-context.test.js`; optional existing saver instrumentation after review. Interface `sliceContext(manifest, requirements, limits, tokenCounter) -> {blocks,provenance,exclusions,truncation,measurement}`; no fetch/fs/process calls.
- [ ] RED essential/dependency closure includes interfaces/tools/instructions with stable order and cycle handling; all tool calls paired, errors preserved.
- [ ] RED256blocks/1MiB metadata caps, malformed digests and essential overflow reject; optional truncation disclosed; stale summary/cache tenant mismatch rejects.
- [ ] Implement supplied-manifest slice, provider-cache directive selection and measurement provenance; no automatic summary inference or gateway repo crawl.
- [ ] GREEN measured-token fixture compares identicaltask/provider tokenizer inputs; character estimates labeled, not reported as actual reduction; RTK/headroom wire effect accounted or opt-in saver disabled.

Task B files: `src/lib/adaptive/budget.js`, repo/migration extension as necessary, `tests/unit/adaptive-budget.test.js`; reuse current pricing/usage as source, not unknown-cost defaults.
Interfaces `estimateReservation(binding, finalWireUsageBounds, pricing) -> {amount,units,provenance}`; `reserveBudget(principal, taskId, attemptId, bound) -> reservation`; `settleBudget(reservationId, usage, outcome) -> ledgerState`. Atomic transactions through current adapter.
- [ ] RED unknown price/usage/quota null, no tokens-to-subscription conversion, cache/reasoning output not double-counted, actual billing vs estimate distinct.
- [ ] RED concurrent reserve/duplicate continuation cap total; restart RUNNING remains unknown/no reexecute/no refund; Gemini floor validated against final wire spend.
- [ ] RED unsupported sql.js durability/multiwriter topology blocks paid active path, not shadow/fixed; test all supported adapter transaction behaviors.
- [ ] Implement bounded reservation/settlement/reconciliation and accounting modes; unknown money upper bound blocks metered execution; workers/summaries/retries counted globally.
- [ ] GREEN budget/session/day race/expiry/pricing-version/driver persistence tests; no real paid calls.

Dependencies Phase6, approved pricing/token-count sources, privacy/retention/spend policy and single-writer topology. Deliverables manifests/caching integration + truthful usage/budget ledger. Security: no uncontrolled paths/URLs, no cache cross-tenant leakage or unlimited unknown-cost dispatch. Acceptance AC07/08/09. Status BLOCKED.

## Phase 8 — Hermes compatibility (Task H)

Scope: stable gateway metadata and smallest supported plugin contract; no Hermes Core modifications. Initial repository deliverables: extend existing `docs/integrations/hermes.md` only after review, add `tests/unit/adaptive-hermes-contract.test.js` and separately scoped plugin fixture/example under current integration conventions. Exact runtime installation/profile changes require owner approval and installed API inspection.
Interfaces: existing custom-provider URL remains /v1; task/attempt headers only opt-in; status endpoint returns current family/model/score/tier/reason/verifier/usage/budget. Proposed namespaced integration tool operations set_policy/read_status rather than unverified slash registration.
- [ ] Verify installed Hermes version and official middleware/observer/tool registration documentation; read-only source inspection, not another repository edit.
- [ ] RED fake middleware wraps inference exactly once; observer forwards only trusted allowlisted actual tool evidence; unsupported observer leaves UNVERIFIED, never confidence-based pass.
- [ ] RED existing /model commands/provider selection and past prompt caching unchanged; streams/errors/cancel metadata handled without custom SSE events.
- [ ] Implement smallest version-gated example/plugin only in explicitly approved location; `/provider`/`/routing` UX added only if actual extension registration supports it.
- [ ] GREEN installed-version fake integration plus existing gateway-client protocol; actual tool-evidence acceptance only after authorized verifier exercises it.

Dependencies Phase7 PASS and separate plugin scope/authority. Security: secrets resolved through approved store, no arbitrary CLI/shell execution or tool retries, no Hermes Core/n8n changes. Acceptance AC10. Status BLOCKED.

## Phase 9 — Evaluation (Task Q)

Files: `tests/fixtures/adaptive/tasks.json`, `tests/unit/adaptive-benchmark.test.js`, `tests/scripts/evaluate-adaptive.mjs`; offline first. Interfaces: frozen fixture schema with case_id/category/context/metadata/required_checks/expected_constraints and `evaluateCases(cases, runner, verifier, budget) -> report`.
- [ ] Create >=50 cases, five per ten requested categories; include multilingual/missing metadata/security flags/tool failures and audited synthetic artifacts.
- [ ] RED schema uniqueness/50count/ten categories/verifier denominators; absent live evidence cannot produce savings or success-rate comparisons.
- [ ] Implement offline deterministic baseline/diff metrics; provider calls disabled without explicit approved runner/spend cap.
- [ ] GREEN fixture and policy tests; freeze exact model/provider/effort/context versions and scoring/quality rubric before any authorized live run.
- [ ] Obtain owner total/per-task budget, account access and quality-regression tolerance; then separately authorize fixed premium/provider/global paired benchmark.
- [ ] Report verified successes,UNVERIFIED/blocked tasks,quality regressions,input/output/reasoning/cache tokens,premium usage,cost per verified task,measured quota,median/p95 latency,escalation/retry amplification. Swarm column remains NOT RUN until Phase11.

Dependencies standalone phases accepted, objective verifier and metrics definitions. Deliverable reproducible fixtures/report, no fabricated savings. Security: paid calls disabled by default, all calls bounded, prompt artifacts isolated. Acceptance AC11; offline mock success does not satisfy live comparison. Status BLOCKED.

## Phase 10 — Controlled rollout (Task O)

Scope: initially named shadow scopes, then explicitly approved active users/configurations; no deployment in current session.
- [ ] Verify hosted auth/login matrix, public deployment-mode discrepancy and intentional login removal using authorized inspection; preserve current settings until approval.
- [ ] Verify production Node/driver/volume single-writer topology and monetary ledger durability; independent build/lint/full-regression gates pass or exact catalogued baseline disposition recorded.
- [ ] Rehearse kill-switch/rollback/cancel queues in isolated workload and read back persisted state; never reissue delivered streams on rollback.
- [ ] Obtain explicit Railway deployment/config approval and separate active/spend allowlist; record version/policy owner.
- [ ] Perform only approved rollout scope, read back exact target configuration, observe guard/telemetry/quality alerts; rollback on security/unknown spend/quality limit breach.

Dependencies Phase9 gates, deployment and spend authorization. Deliverables rollout/rollback evidence, least-privilege flags and owner acceptance. Security: no login feature restoration; disabled/shadow initial, global opt-in. Acceptance AC09/11/12. Status BLOCKED.

## Phase 11 — Bounded worker swarm (Task W)

Files proposed: `open-sse/adaptive/swarm.js`, `tests/unit/adaptive-swarm.test.js`, extend benchmark fixture runner/telemetry; no process spawning.
Interface `planSwarm(task, policy, eligibleBindings, manifest) -> {lead,workers,aggregateLimits}`; `runSwarm(plan, infer, signal, ledger) -> {results,status,usage}` with injected gateway inference only. Lead Opus/Astra only through supported approved bindings; workers Haiku/Luna/GeminiFlash eligible exact variants.
- [ ] RED independent read-only subtask plan,initial2 concurrent/hard3 workers,no worker delegates,no shared file writes; unresolved Haiku remains unavailable.
- [ ] RED aggregate lead/workers/synthesis/retries/context/cost budget, timeout/cancel/failure propagation; duplicate worker IDs cannot call twice.
- [ ] Implement fixed bounded queue and explicit manifest slicing; no recursive graph/runtime/custom scheduler.
- [ ] GREEN synthetic orchestration and adversarial tool/action outputs; lead schema-valid result still UNVERIFIED without task evidence.
- [ ] Only after separate worker spend permission run paired swarm evaluation including synthesis costs; measured benefit required before scaling.

Dependencies standalone routing acceptance and owner-enabled flag; planned initial rollout Phase10 must not label swarm production ready. Security: gateway inference workers have no host tools/credentials in prompts; no recursion or side-effect replay. Acceptance AC12 and matched benchmark. Status BLOCKED.

## Phase 12 — Final acceptance (Task A)

Scope: verify every required feature/safety/compatibility/metric/rollback claim against implementation and real evidence. No extra feature implementation without separate request.
- [ ] Trace FR01-16 to AC01-12 and executed tests; independently review changed security boundaries and versioned policy.
- [ ] Re-run full permitted baseline,build,lint,catalogs and all adaptive suites with exact exits/exclusions; unknown/hang/collection error not silently waived.
- [ ] Verify active-client native streams/tool IDs/modes/auth/provider-login preservation, supported-model availability and objective evidence pipeline.
- [ ] Verify context actual-token metrics,accounting/reservation/reconcile,authorized benchmark quality/cost/latency and swarm only if enabled/accepted.
- [ ] Rehearse feature rollback, restart/cancel/unknown outcomes and confirm no duplicated actions; retain privacy-safe reports.
- [ ] Owner final acceptance determines recommendation change to adaptive_provider; do not change default automatically.

Dependencies all mandatory phases; deliverable final requested report with verifiable artifact/config IDs and results. Security: no production readiness from mocks or documentation alone; absent infrastructure/paid authorization/physical workload evidence is BLOCKED. Status BLOCKED.

## Requirement-to-task coverage

FR01/02 -> R; FR03 -> D/W/O; FR04 -> C; FR05/13 -> R/E/D; FR06/07 -> D; FR08 -> D/B; FR09 -> X/W; FR10 -> V/H; FR11 -> S; FR12 -> B; FR14 -> D/V/B; FR15 -> V/H; FR16 -> O/A. PRD security/privacy applies to every task. Benchmarks -> Q/W; deployment preservation -> O/A. TypeScript/Rust check evidence is supported as a verifier kind, not a migration or unrelated code change.

## Risk/decision handoff

Blocking decisions: approve exact Sol pin (6 versus explicit6.1), supported provider/account bindings and unavailable-tier fallback, verifier authority and client side-effect ledger, spend/token ceilings and price source, retention/privacy/region constraints, benchmark quality tolerance, safe full-baseline isolation/drift disposition, hosted login/topology evidence. Do not use cc/cx presence as automatic supported access approval.

Recommended execution after review: native phase-by-phase for pure tightly coupled policy tasks, with independently scoped security review at verification/budget boundaries; subagent-driven is an owner-selectable alternative. No subagent workers were launched to implement this draft. Stop now for owner review; Phase2 is not authorized by writing these files.
