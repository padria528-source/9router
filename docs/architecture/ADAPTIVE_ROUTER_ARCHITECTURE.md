# Adaptive Intelligence Router — Architecture and Proposed Decisions

Status: DRAFT / PROPOSED. No implementation approval or production-readiness attestation. Read the [PRD](../prd/ADAPTIVE_INTELLIGENCE_ROUTER_PRD.md), [Phase 0 audit](ADAPTIVE_ROUTER_PHASE0_AUDIT.md), and [implementation plan](../plans/ADAPTIVE_INTELLIGENCE_ROUTER_IMPLEMENTATION_PLAN.md) together. Current Phase 0 gate remains BLOCKED.

## 1. Existing architecture, not a replacement

Compatibility request -> Next rewrite/API route -> `src/sse/handlers/chat.js` -> model/alias/combo resolution -> account credentials/refresh -> `open-sse/handlers/chatCore.js` -> translator -> executor -> existing streaming/nonstream conversion -> client.

Dashboard Single/Council/Debate use `src/modes/orchestrator.js` and their existing endpoint. Adaptive route mode is independent of the existing dashboard mode; do not replace that dispatch. Active routing initially applies only to individually opted-in single inference requests; Council/Debate may be observed in shadow with per-inference correlation, but must not acquire new hidden escalation/swarm behavior. Explicit combination with active routing requires a separately tested budget/call-count composition before enabling.

`getModelInfo` already handles built-in provider prefixes, custom provider nodes, aliases and combos. `getExecutor` already handles specialized and OpenAI-compatible transports. Model catalog comes from provider registry. Use these facilities; no duplicate provider transport, OAuth broker, model parser or streaming engine.

The post-auth request seam is around `chat.js:84-94`, before combo/capacity dispatch. Legacy settings may not require a key; opt-in adaptive requests MUST explicitly authenticate a principal before reading policy, regardless of local bypass. Feature-off calls enter exactly the original flow. Shadow runs on an immutable snapshot and never calls account-selection/refresh/rotation functions. Pure decision computation does not own provider credentials.

## 2. Proposed file boundaries

These paths are future deliverables, not existing symbols:

- `open-sse/adaptive/registry.js`: validated adaptive bindings referencing the existing registry; versions and evidence gates. Constants/default rubric live in `open-sse/config/adaptiveRouter.js` per engine conventions.
- `open-sse/adaptive/classifier.js`: pure numeric scoring/overrides/uncertainty.
- `open-sse/adaptive/effort.js`: exact model/endpoint reasoning validation and final-wire checks, reusing existing capability/thinking modules without global behavioral changes.
- `open-sse/adaptive/router.js`: candidate filtering and ordered selection, consuming sanitized snapshots.
- `open-sse/adaptive/escalation.js`: pure attempt/evidence/deadline transitions and circuit state; no network/tools/process spawning.
- `open-sse/adaptive/context.js`: bounded manifest selection/closure; no filesystem/network access.
- `src/lib/adaptive/service.js`: authorization, policy snapshot, task lifecycle, execution counter, cancellation and integration with existing chat flow. Grow only when the accepted phase needs a boundary; no empty scaffolds now.
- `src/lib/adaptive/evidence.js`: strict request/signature/ownership validation using node:crypto and existing key validation.
- `src/lib/adaptive/budget.js`: pricing provenance, reserve/settle/reconcile using current DB adapter transactions.
- `src/lib/db/repos/adaptiveRepo.js` and one next-number migration: additive task/attempt/evidence/reservation/decision storage. Determine actual migration number at implementation time; do not invent or overwrite a current migration.
- `src/app/api/adaptive/v1/.../route.js`: authenticated contract endpoints introduced only with Phase 6.
- `tests/unit/adaptive-*.test.js`: focused Vitest fixtures; Phase 9 adds frozen benchmark fixtures.

Do not create all files on day one. No new packages are proposed. Existing settings/repository patterns should carry configuration, not a parallel persistence layer. Follow `open-sse/AGENTS.md`; do not hand-edit generated registry imports.

## 3. Principal, policy and request contracts

Proposed `AdaptiveRequest` is a gateway-internal validated record:

- schema_version=`9router.adaptive.request.v1`
- principal_id (server-resolved), task_id (server-issued), session_id (optional opaque)
- routing_mode, family, explicitly pinned binding_id or model constraint
- metadata {complexity,risk,ambiguity,scope,tool_depth,flags}, metadata_trust/source
- required_capabilities {tools,structured_outputs,streaming,input_modalities,endpoint}
- context_manifest, context_digest, verification_plan_digest
- requested_effort, output_cap, deadline, idempotency_key
- approved_provider_ids/privacy/budget policy references, never client-granted permissions

Policy comes from authenticated owner configuration. Request text and client-supplied headers cannot grant provider access, spend, destructive approval or verifier roles. Validate schema and bounds before alias resolution/network. Principal authorization is needed on every read/update; random task IDs alone provide no access control.

Proposed `RouteDecision` contains decision_id, policy_version, registry_version, mode, family, score/components, uncertainty, initial_tier, selected_tier, requested_effort, applied_effort, provider_id, gateway_model_id, upstream_model_id, upstream_endpoint, binding_id, reason_codes, blocked_constraints, availability_evidence, accounting_mode, budget_status and context_measurement. Unknown values remain null. Shadow has predicted_route and actual_route separately; prediction must never masquerade as executed inference.

Proposed executor handoff uses existing modelInfo/body/AbortSignal options plus an optional adaptive guard context; there is no new network adapter class. Common normalized result includes response/stream, usage provenance, provider_error_category, rate_limit {retry_after,reset_at,source}, latency and delivery commitment. Credentials remain private executor inputs and never enter decision metadata.

## 4. Registry and model capability evidence

Bind a logical tier to exact provider transport + upstream endpoint + model version + effort. Capability evidence includes source URL/config revision, observed_at, expires_at and evidence kind. STATIC_CATALOG/DOCUMENTED describe discovery, not access. ACCOUNT_CONFIRMED or policy-accepted RECENT_SUCCESS attestation plus active configured connection and supported access is needed for active routing. Evidence must be account/endpoint scoped. Model listing is an explicitly approved operation if it may refresh credentials; never run it in shadow.

Requested ladders remain Claude Haiku 5.5 -> Sonnet 5.5 medium -> same Sonnet high -> Opus 5.5 high/max; GPT-6 Luna low -> exact pinned Sol medium -> same Sol high -> Astra high/max; Gemini Flash-Lite -> Flash low -> 3.8 Flash medium/high -> explicitly ranked suitable Pro high. Haiku 5.5 is unresolved. Catalog Sol 6 and 6.1 are distinct; owner must approve an exact binding. Risk-marked cc/cx routes are catalog evidence only, not implicitly authorized supported subscription access.

GPT-6.1 Sol tool requests must reach upstream Responses. Luna low with tools must also use Responses. A Chat-compatible client can still be translated through existing infrastructure if exact endpoint translation preserves tools; otherwise block rather than strip tools or lower effort. Gemini 3.8 Flash minimal rejects; low/medium/high only. Never reuse regex-derived context maxima/efforts as final proof.

Global routing uses explicit owner ordering among eligible models, or price comparison only when all compared relevant costs are known. Do not claim cheapest routing for subscription/unknown-price candidates. Provider-bound mode cannot cross family; unavailable tier requires explicit approved skip/escalation mapping. No downgrade below safety minimum.

## 5. Classification and deterministic route selection

Weighted score=floor((30c+25r+20a+15s+10t)/100); five integers 0..100. Rubric and tiers are specified in PRD Section 9. Boundaries are inclusive: 0-29,30-54,55-79,80-100. Missing component gets 75, uncertainty HIGH and minimum L3. Flags auth/security/sandbox/isolation raise minimum L3; complex architecture L4; destructive operation remains NEEDS_APPROVAL independent of tier. Context size filters candidate limits after reserving output/tool/schema overhead. Verified prior failures belong to escalation, not untrusted confidence.

Decision computation order: validate -> score -> trusted overrides -> mode/provider/model constraints -> endpoint/capability/native-state/privacy filters -> fresh availability -> authorized budget feasibility -> approved candidate order. Shadow stops before reserving spend or executing. Active finalizes only after atomic reservation and request/wire validation; candidate change requires a fresh decision and reservation.

Fixed mode adds no tier escalation and preserves legacy behavior, including existing capacity fallback when globally configured. That historical behavior differs from strict model pinning; opt-in strict_fixed will reject insufficient capabilities, not silently alter a legacy client. Do not globally disable legacy combos under the new feature.

## 6. Provider adaptation and wire validation

Internal effort low/medium/high/max maps only through an explicitly model/endpoint-supported record. Anthropic output_config.effort and thinking settings; OpenAI Responses reasoning.effort; OpenAI Chat reasoning_effort only when documented; Gemini generationConfig.thinkingConfig with model-specific thinkingLevel or documented numeric budgets. Unsupported values reject with UNSUPPORTED_EFFORT, not generic clamping or fabricated token budgets.

Existing `thinkingUnified.js` normalizes/clamps values and can raise Gemini maxOutputTokens to an effort-dependent floor. Validate requested adaptive intent before that path and validate final emitted body immediately before every upstream execute; ensure actual output caps and effort match authorization/reservation. If final body exceeds authorized caps, reject or use an explicitly approved alternative, not silently increase spend. Test both original and refresh-retry execute sites in chatCore, plus executor-internal retries. Preserve unchanged legacy behavior when guard context absent.

Native provider signatures, encrypted reasoning and response IDs are not portable context. Stick to same model/provider for opaque state unless client supplies an explicit public-state continuation. Never log hidden reasoning or transfer credentials/transport headers.

## 7. Verification and task states

The gateway cannot run tests or observe Hermes tools directly. Authenticated evidence attests objective client-side checks against the exact subject; no verifier means UNVERIFIED. HTTP success or syntactically valid response is not VERIFIED_SUCCESS for a coding task.

Task states follow the PRD. Each attempt stores immutable route/request/subject digests and versioned verifier plan. A required-check set is pinned before inference so a client cannot omit a failed test and claim success. Evidence submits check IDs/status/exit codes/artifact digests, not raw stdout or commands to execute. Local gateway key alone is insufficient to forge evidence; verifier role/key is separately provisioned and scoped.

Proposed API (future, not currently implemented):

| Method/path under `/api/adaptive/v1` | Auth | Effect |
| --- | --- | --- |
| POST `/tasks` | inference principal with adaptive permission | server task/first decision, idempotent create; no inference by itself |
| GET `/tasks/{taskId}` | same principal or authorized admin | status, decisions, verifier/usage/budget metadata |
| POST `/tasks/{taskId}/evidence` | principal + bound verifier signature/role | atomic evidence validation and state transition; no execution |
| POST `/tasks/{taskId}/continue` | same principal + explicit continuation permission | issue next attempt/recommendation after eligible failure; no tool replay |

Explicit inference then references issued task/attempt headers through the original compatibility endpoint. Duplicate identical inference idempotency keys do not execute again: completed small nonstream payload may be replayed only if securely stored under approved retention; default is task status/conflict, not storing raw response. Streaming duplicates never replay a stream; return attempt-in-progress/completed status. Request-digest mismatch returns conflict.

Evidence MAC=HMAC-SHA256(method + newline + exact path + newline + timestamp + newline + nonce + newline + SHA256(raw body)); require strict encoding/version and timing-safe comparison. TTL/skew/payload bounds per PRD. Provision verifier secret without persisting it in ordinary settings/logs; resolve from approved secret storage. Key rotation permits a short explicit overlap window with verifier key ID, never provider credential reuse. Deny cross-origin browser evidence by default; remote HTTPS mandatory. Nonce uniqueness and transitions share one SQLite transaction. Multiple deliveries are idempotent only for identical evidence.

Authentication protects provenance, not truthfulness of a compromised verifier. UI/status states verification_scope and verifier identity/trust class. Trusted local fixture checks are mock evidence, not live workload success.

## 8. Bounded execution, escalation and circuit breakers

Unified guard counts selected-tier attempts (default <=4) AND actual provider executes (<=8), including account fallback/auth refresh/executor retry. Deadline 120 s proposed; transient retry <=1 per attempt, backoff base250 ms/cap4 s. Retry-After never exceeds remaining deadline; fake clock tests prove bounds. A single guard per task flows through nested loops; forbid parallel race around counters via atomic claim.

Only fresh validated failure evidence can recommend higher tier; low confidence does nothing. Missing capability selects before execution. Timeout/network/rate limit categories are infrastructure events and use same-tier retry/cooldown/approved alternative policy, not automatic premium escalation. Prevent duplicate continuation using compare-and-swap attempt state. L4/limit exhaustion yields FAILED_MAX_ATTEMPTS with safe failure report.

Circuit breaker is a policy overlay atop existing account cooldowns, not a duplicate quota polling service. Proposed defaults: after 3 transient availability failures within 60 s for a principal/provider/model binding, OPEN for 30 s; honor longer rate-limit reset; then HALF_OPEN permits exactly one authorized natural request. Success closes, failure reopens. No background inference probes. Authentication/access failures open until configuration/evidence is updated. Verifier test failures do not open provider circuits. Circuit state blocks fresh active executions, but shadow reports it without mutation. Different principals do not leak account health; telemetry uses sanitized aggregate categories.

Delivery commitment occurs when any client bytes or tool output are emitted. After commitment never silently retry or swap model; preserve partial stream and mark outcome/status. Disconnect cancels generation/backoff/queued workers; provider bill uncertainty survives cancellation. Gateway does not commit files, run shell or reissue tools. Client ledger keyed by tool_call_id/action_digest and operation-bound approval is mandatory for tool-bearing continuation; destructive/unknown outcomes remain blocked until reconciled.

## 9. Context and cache boundary

Gateway selects from supplied authorized manifests, not a repo index. Client retrieval does source/test/interface/log dependency gathering. Manifest <=256 blocks/1 MiB metadata, bounded text input by authorized context limit. Essential system/developer/user requirements, required schemas/interfaces and complete tool pairs are never silently removed. Include dependency closure with cycle detection, stable ranking and explicit exclusion/truncation manifest. Essential overflow blocks.

Token budget must use native count endpoint or proven tokenizer where authorized; estimates are labeled and include conservative margin. Unknown exact counts cannot certify a hard paid limit unless a verified worst-case bound is configured. Reuse unchanged prompt prefixes and approved provider caches; keys include principal/provider/model/source digests. No automatic summary inference. Summaries have provenance and explicit information-loss disclosure; stale source digest invalidates reuse.

Existing RTK/headroom can mutate payloads after translation; adaptive path must observe their final wire effects or disable them for that opt-in task when strict context provenance cannot be retained. Do not globally rewrite token savers. Active Hermes conversations preserve past prompt/toolset cache invariants; slicing applies to new task context or explicit client compression, not hidden retroactive conversation edits.

## 10. Usage, budget and persistence

Existing usageRepo is a raw usage source, not the authoritative adaptive verification/budget ledger. Preserve its behavior for legacy clients; adaptive records null for unknown cost/usage and carry pricing provenance. Input/output/reasoning/cached/cache_write units follow provider definitions and do not double-count reasoning/cache categories. Distinguish estimated API price from reported usage/invoice and supported subscription quota units.

Proposed additive entities: adaptive_tasks (principal, pinned policy/plan, state/deadline/limits); adaptive_attempts (unique task/sequence, decision, request/subject digests, call count/delivery/state); adaptive_evidence (unique verifier/evidence ID and nonce scope, payload digest, checks/status/expiry); adaptive_reservations (unique attempt, amount/units/accounting mode, state/reconciliation); adaptive_decisions (allowlisted telemetry and aggregate fields). Use current migration/adapter contract. No prompts/credentials/native reasoning persisted in these tables.

Reserve atomic maxima before dispatch; validate actual wire output/tools caps and price validity. Settle provider-reported usage, retain unmeasured/unknown-outcome reservations pending reconciliation. Money limit cannot be enforced with unknown pricing; block active metered routing. Worker/lead/summary/retry calls all share aggregate reservation and limit. Restart resumes ledger/status only, never automatically repeats a RUNNING attempt of unknown outcome.

Async Turso mirroring cannot coordinate concurrent local writers. Initial active deployment requires one writer and a durable volume, including cross-process serialization. sql.js durability/multiprocess limits must be tested; if not established for monetary reservations, active paid routing fails closed on that driver while shadow/fixed stays available. Do not replace DB adapter or add Redis for speculation. Multiwriter support is a separately approved architecture change.

## 11. Hermes, n8n, Railway and rollout

Existing custom-provider gateway compatibility is maintained. Desired `/provider` and `/routing` commands are UX requirements, not existing runtime APIs. Separate Phase 8 plugin uses only installed-version-supported middleware/observer/custom tool registration, not Hermes Core modifications. Plugin evidence includes actual exit/status/subject digest and allowlisted checks; prompt text/model claims never substitute for tool outcomes. It invokes wrapped inference exactly once, handles stream completion/disconnect and fails visibly to UNVERIFIED if evidence unavailable. Credentials remain in approved secret store, settings in config via supported CLI.

n8n future clients use the same task/evidence contracts with explicitly assigned verifier credentials; no workflow/source edits in initial work. Nexus Forge/Lynz Control and locked phases are untouched.

Railway read-only health/version is not a deploy approval. Public host deploymentMode=local is an unresolved hosted security gate; browser UI checks alone do not prove server protection. Preserve intentionally removed provider logins and current deployment settings. Confirm auth/login matrices and single-writer volume topology before controlled active rollout; no live modifications under audit authority.

Master adaptiveEnabled=false; when explicitly enabled, default routingMode=shadow. Separate active/global/swarm flags default false and per-principal allowlists deny. Rollback to disabled preserves original handlers and data. No new model alias named `auto` should be registered over an existing combo/model alias; use explicit policy/task APIs or collision-checked namespaced alias after approval.

## 12. Proposed architectural decisions

### ADR AIR-01 — In-process policy, existing transports
Status: Proposed. Context: existing translation/auth/account infrastructure solves dispatch. Options: extend combos only (small but lacks task contracts), in-process pure policy + app glue (recommended), sidecar (duplicates security/operations). Decision proposal: in-process policy, no new service/dependency. Consequences: minimal deployment change, but nested execute sites require careful optional guard propagation. Reversible via master flag. Acceptance: feature-off protocol fixtures and all existing mode tests.

### ADR AIR-02 — External verification, client-owned tools
Status: Proposed. Context: gateway has no trustworthy tool access. Options: trust model claims (rejected), spawn local commands (rejected), authenticated scoped external evidence (recommended). Consequences: objective provenance and no new shell surface; configured trusted verifier required and compromised verifier remains a trust risk. Acceptance: signature/replay/stale-subject/ownership tests and UNVERIFIED without verifier.

### ADR AIR-03 — Disabled then shadow, exact pinned ladders
Status: Proposed. Context: static IDs/efforts and subscription access are uncertain. Options: immediate adaptive default (rejected), shadow-first exact approved bindings (recommended). Consequences: zero speculative paid predictions, visible unavailable tiers, delayed default recommendation until measured acceptance. Acceptance: zero additional execute/refresh/rotation calls in shadow, Sol version stability, rollback.

### ADR AIR-04 — Atomic local budget ledger, single writer
Status: Proposed. Context: SQLite adapter plus async Turso mirror already exists. Options: ignore races (rejected), add distributed coordinator now (unnecessary), transaction ledger and single-writer gate (recommended). Consequences: smaller system with explicit scale ceiling; additional writers remain blocked until proven shared coordination. Acceptance: concurrent reserve/replay/restart tests on permitted production driver and topology.

### ADR AIR-05 — Manifest context, no gateway crawler
Status: Proposed. Context: gateway cannot safely resolve arbitrary client filesystem/URLs. Options: automatic gateway repository crawling (rejected), client-authorized bounded manifests (recommended). Consequences: less SSRF/path leakage and explicit provenance, requires client retrieval and measured tokenizer support. Acceptance: essential closure, overflow, truncation, tool pairing, privacy and paired-token evidence.

## 13. Architecture acceptance and remaining decisions

Architecture approval is separate from tests passing. Approve exact Sol version, supported provider access, explicit fallback lists, verifier authority, budget/spend bounds, data retention/privacy regions, benchmark quality tolerance and execution method. Baseline provider drift/full audit and hosted/login discrepancy need disposition. None is silently waived. Swarm remains deferred: max2 initial workers, hard3, no recursive spawning, independent read-only subtasks, lead synthesis and full aggregate resource accounting. No code or runtime promise exists until the corresponding gated phase is implemented and exercised.
