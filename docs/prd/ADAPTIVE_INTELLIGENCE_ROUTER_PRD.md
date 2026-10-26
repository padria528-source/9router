# Adaptive Intelligence Router v1.0 — Product Requirements Document

Status: DRAFT / NOT APPROVED. Phase 0 mandatory baseline gate is BLOCKED. This document specifies future behavior; no adaptive production code exists at this checkpoint. Architecture decisions are proposed, not accepted.

Authority: owner's request; current repository source; [Phase 0 audit](../architecture/ADAPTIVE_ROUTER_PHASE0_AUDIT.md). Companion [architecture](../architecture/ADAPTIVE_ROUTER_ARCHITECTURE.md) and [phased implementation plan](../plans/ADAPTIVE_INTELLIGENCE_ROUTER_IMPLEMENTATION_PLAN.md). No percentage savings or production-readiness claim is made.

## 1. Executive Summary

Add a policy layer inside existing 9Router that selects an eligible model/effort for a task, starting with deterministic scoring and opt-in shadow predictions. Optimize resource consumption per objectively verified task without weakening safety, reliability, privacy or compatibility. Reuse provider registry, resolvers, executors, translation, account cooldowns, SQLite/Turso persistence and pricing. Do not rebuild the gateway or add a second agent runtime.

The gateway selects inference routes. The client owns tools, host execution, artifact changes and approval enforcement. Verification arrives through an authenticated, task-bound evidence interface; absence of external evidence remains UNVERIFIED. Evidence-based task escalation is distinct from network/account fallback.

## 2. Problem Statement

Clients often choose a premium model for every turn despite different task demands. Existing combos, capacity adapters and account fallback address availability, but do not establish task-level quality or success. Sending the entire context repeatedly wastes resources; existing compression is not task-specific retrieval. Token counts, quota and API price are not interchangeable. Static model names and generic capability defaults are not proof of account access or correct endpoint support.

Current baseline concerns include outdated storage documentation, a stale provider snapshot, unexecuted full baseline, permissive reasoning clamps, and a public deployment reporting local mode. These are named dependencies, not issues to hide behind a successful targeted test run.

## 3. Product Goals and Non-Goals

Goals:
- Choose the lowest eligible tier meeting score, safety, capability, context, account, privacy and authorized budget constraints.
- Preserve fixed clients and Single/Council/Debate semantics; produce machine-readable decisions and truthful verification status.
- Bound attempts, latency, spend and worker concurrency; preserve cancellation, tool IDs and side-effect identity.
- Reduce input duplication only with provenance and explicit truncation; measure provider-reported tokens where available.
- Evaluate fixed premium versus adaptive provider/global on the same frozen representative tasks.

Non-goals:
- New gateway, framework migration, unrestricted shell execution, repository crawling from the gateway, secret onboarding, subscription bypass, guessed quota conversions, autonomous deployment, self-verifying LLM claims, hidden-reasoning extraction, or modifications to Hermes Core/n8n/Nexus Forge/Lynz Control.
- LLM-based classification, vector databases, recursive worker graphs and a new dashboard are deferred until measured need and separate approval.
- Preserve older models for legacy fixed routes, but do not include GPT-5.x or Terra in the adaptive GPT ladder.

## 4. User Stories

- As a fixed client, I keep my model/effort and existing response protocol when adaptive features are off.
- As a provider-bound user, I select Claude/GPT/Gemini and authorize a pinned ladder without cross-provider fallback.
- As a privacy-sensitive user, I deny cross-provider or regional transfer regardless of score or price.
- As an operator, I enable shadow for a named scope and inspect predictions without extra inference or changed output.
- As a tool client, I submit authenticated test/schema/artifact evidence for the exact attempt, receive a bounded escalation recommendation, and decide whether to issue the next inference request.
- As a budget owner, I set explicit limits and know when price/quota/usage is unavailable.
- As a future swarm user, I permit only independently scoped, read-only workers with lead-controlled synthesis and no shared file writes.

## 5. Functional Requirements

Requirement IDs map to acceptance gates in Section 19.

FR-01 Registry: bind logical family/tier to exact provider ID, gateway model ID, upstream ID, endpoint, effort set, required capabilities, context/output limits, accounting mode, access approval and provenance. No guessing IDs, recursive alias cycles or unapproved fallback mappings. Alias collisions with existing names reject configuration.

FR-02 Availability: distinguish STATIC_CATALOG, DOCUMENTED, ACCOUNT_CONFIRMED, RECENT_SUCCESS, UNKNOWN, UNAVAILABLE and EXPIRED evidence. Eligibility requires supported access, configured active connection, fresh capability/availability proof according to policy, no disabled/cooldown status, and explicit spend approval for metered calls. No startup inference probes or refresh during shadow; unknown availability yields an ineligible prediction or blocker rather than a paid probe.

FR-03 Modes: `fixed`, `adaptive_provider`, `adaptive_global`, `shadow`, `swarm`. Off by default; the first enabled rollout uses shadow. Global is always opt-in. Swarm disabled until Phase 11 gates. Route mode is not dashboard `mode=tunggal/dewan/debat`.

FR-04 Classification: deterministic weighted score and recorded uncertainty; missing metadata never means low risk. Owner/system policy outranks task text. Client metadata may raise safety demand but cannot grant spend, provider access or destructive approval.

FR-05 Capability filter: tools, structured output dialect, streaming, media, reasoning, context reserve, provider-specific continuity and data region are validated per exact endpoint. Do not treat a permissive regex capability heuristic as an attestation. Insufficient capability selects an approved eligible higher tier or returns a structured blocker.

FR-06 Fixed: no new automatic tier escalation or effort rewriting. Existing combo/account/capacity-adapter behavior remains legacy behavior, with known exceptions documented; adaptive features off never change it. An explicitly strict pinned-model fixed request must fail unsupported capability instead of entering capacity fallback; implement only as opt-in, tested behavior.

FR-07 Shadow: observe original request at the post-auth seam without mutating it, refreshing credentials, consuming rotation slots, invoking providers, creating summaries, reserving spend or changing standard SSE events. Keep actual and predicted routes separate. Prediction/telemetry failure must not block the original response.

FR-08 Active selection: intersect approved family tiers with hard constraints, choose first eligible tier at/above effective minimum, use explicitly ordered fallback list only; never fall below safety minimum or silently cross family. If cost comparison is required and unmeasured, report selection_basis=approved_order and cost_optimality=UNKNOWN. Reproducible decisions include registry/policy versions and sanitized reason codes.

FR-09 Escalation: objective evidence only, bounded attempts, no automatic tool replay, no retry after delivered stream/tool output. Every actual upstream execution including auth retry/account fallback consumes a shared call budget. Preserve original deadlines and cancellation during backoff. Failure at highest eligible tier is terminal.

FR-10 Verification: authenticated, non-replayable evidence for a server-issued task/attempt bound to an objective verification plan and artifact/context digest. No external verifier means UNVERIFIED. Passing a response envelope is not passing a coding task.

FR-11 Context: choose only client-supplied authorized context blocks; preserve immutable instructions, essential interfaces and all relevant tool call/result pairs. Track source revision, digest, slices, dependency closure and exclusions. No arbitrary paths/URLs are read by gateway.

FR-12 Budget: support metered_api, subscription_supported, api_credit, free_tier, unknown. Enforce owner-approved limits with reservations and settlement, unknown fields remain null. No exchange of subscription usage for fictional dollar costs.

FR-13 Adapters: common decision/execution contract reuses current provider executor/translator paths. Strict adaptive effort validator must reject unsupported values before dispatch and check final emitted wire body against endpoint-specific capabilities. Existing permissive behavior remains unchanged for legacy fixed clients.

FR-14 Telemetry: include all fields in Section 16; no raw messages, tool arguments/results, reasoning, credentials, headers, user paths or identifying account names. Tenant/session authorization on reads, retention and bounded payload size.

FR-15 Integrations: stable APIs for Hermes/n8n/future clients; do not assume requested commands exist. Separate signed evidence callbacks from untrusted model-provided messages. No outbound arbitrary callback delivery.

FR-16 Rollback: master kill switch, per-principal mode setting, configuration version and append-only audit. Stop new active routing/swarm on disable; explicitly approved in-flight execution finishes without replay or is cancelled. Preserve original clients/data schema and additive records.

## 6. Non-Functional Requirements

Security: deny-by-default adaptive permissions, no implicit paid fallback, exact principal/task binding, bounded input sizes, secret-safe logs and no host process execution. All state transitions are atomic and replay-safe in local SQLite. Do not rely on async Turso mirror for cross-instance spend locking; initial deployment is single active writer or active routing is blocked.

Reliability: deadlines and AbortSignal propagate to the existing executor; disconnect cannot cause a replacement response to be emitted. A delivered stream is committed and cannot be transparently replaced. Telemetry can fail open only for legacy/shadow response preservation; budget/approval/ownership checks fail closed in active mode.

Determinism: classifier and decision fixtures use pinned policy/registry and injected clock/randomness; backoff tests use fake timers. Same sanitized inputs yield the same decision except explicitly recorded availability changes.

Performance proposals, not findings: local policy scoring p95 <=10 ms for <=100 candidates and <=256 context manifests in offline tests; shadow must not wait on persistence in the response critical path. Live latency budgets remain owner-configured and must be measured in Phase 9. Bound manifest size to 256 blocks and 1 MiB metadata; reject excess instead of unbounded traversal.

Compatibility: preserve OpenAI Chat/Responses, Anthropic Messages and Gemini endpoints, headers, stop reasons, usage extraction, tools and cancellation. Feature-off tests compare normalized protocol fixtures, accounting for volatile IDs/timestamps only. No new npm dependency until existing/stdlib solutions are insufficient.

## 7. Architecture

Recommended in-process policy core in `open-sse` plus app-side authorization, persistence and API glue under `src`. Integration seam follows existing authentication and precedes capability/combo dispatch. The policy core receives sanitized metadata/config snapshots, not credentials. Native executor construction and authentication remain owned by existing code.

Logical pipeline: authenticated request -> policy snapshot -> deterministic score/overrides -> capability/privacy/budget/availability filter -> fixed pass-through or shadow record or active route -> existing translate/executor/stream path -> attempt telemetry -> external evidence -> terminal/recommend escalation -> explicit client continuation.

Other approaches considered: reuse combos alone (small but no authenticated quality evidence/context budgets); external sidecar router (isolation but duplicate auth, latency and operational drift). Policy core wins because current translation and fallback engine already exists. Do not add a broker, queue or agent runtime in early phases.

## 8. Provider Model Ladder

Logical names below are requested intent, not automatic account bindings.

| Family | L1 | L2 | L3 | L4 |
| --- | --- | --- | --- | --- |
| Claude | Haiku 5.5 / low | Sonnet 5.5 / medium | same pinned Sonnet 5.5 / high | Opus 5.5 / high, max only if supported |
| GPT | GPT-6 Luna / low | pinned GPT-6 Sol / medium | same pinned Sol version / high | GPT-6 Astra / high, max only if supported |
| Gemini | Flash-Lite | Flash / low | Gemini 3.8 Flash / medium or high | explicitly ranked eligible Pro / high |

Catalog candidates: `cc/claude-sonnet-5-5`, `cc/claude-opus-5-5`, `cx/gpt-6-luna`, `cx/gpt-6-sol`, `cx/gpt-6.1-sol`, `cx/gpt-6-astra`, `gemini/gemini-3.5-flash-lite`, `gemini/gemini-3.7-flash`, `gemini/gemini-3.8-flash`, `gemini/gemini-3.1-pro-preview`. These are STATIC_CATALOG only; cc/cx risk-marked transports are not automatically eligible under this project's supported-access rule.

Haiku 5.5 has no resolved binding. Leave Claude L1 UNAVAILABLE. No silent Haiku 4.5 replacement; owner may approve explicit fallback to a verified alternative or higher eligible tier, with changed model/effort/cost disclosed. Direct Anthropic/OpenAI registry entries are older; officially documented model IDs must be confirmed for the account and configured endpoint before additive bindings.

Default proposed Sol binding is `gpt-6-sol` because the requested ladder says GPT-6 Sol; keep UNRESOLVED until approved supported endpoint evidence. `gpt-6.1-sol` is a separately proposed, explicitly approved binding, not an automatic upgrade. L2 and L3 always share the exact same pinned Sol version. Existing session choice does not authorize rewriting that ladder. GPT-5.x/Terra forbidden in this ladder, not removed from legacy catalogs.

Pro selection uses owner-approved rank plus task suitability, not lexicographic version ordering. If no eligible Pro is available, Gemini L4 is BLOCKED; cross-family rescue requires adaptive_global and approved policy. Preferred Gemini candidates are not promises of access.

Internal effort enum is low/medium/high/max; no unconditional max-to-high or max-to-xhigh conversion. A documented explicit mapping must be configured and disclosed; unsupported user effort returns UNSUPPORTED_EFFORT. Provider-native fields: Anthropic `output_config.effort` plus model-gated thinking config, OpenAI Responses `reasoning.effort` (Chat `reasoning_effort` only on suitable endpoint), Gemini generationConfig.thinkingConfig thinkingLevel or documented thinkingBudget. No generic budget guess is an accepted model mapping.

## 9. Routing Algorithms

Each component c/r/a/s/t is an integer 0..100. Validate range/type strictly, reject NaN/strings/out-of-range. Proposed deterministic ordinal rubric: 0,25,50,75,100.

- Complexity: trivial lookup; one-step interpretation; bounded code change; multi-file debugging; interdependent systems/novel reasoning.
- Risk: read-only public; reversible nonsensitive edit; stateful production-adjacent; auth/security or sensitive data; catastrophic/privacy/destructive potential.
- Ambiguity: exact contract; minor assumptions; multiple plausible interpretations; missing acceptance criteria; conflicting/unknown essential requirements.
- Scope: single fact; one function/file; module; multi-module; system architecture/migration.
- Tool depth: none; one read; several independent reads; sequential dependent tools; multi-stage tool/evidence workflow.

Score = floor((30*c + 25*r + 20*a + 15*s + 10*t)/100). Tier bands: 0..29 L1; 30..54 L2; 55..79 L3; 80..100 L4. Weights and thresholds are initial hypotheses. Record component values and rubric version, not prompt text.

Metadata unavailable: assign 75 to each missing component, mark uncertainty=HIGH, effective minimum L3; known risk signals still override. Trusted metadata and conservative task flags are preferred; lexical observations only raise demands and are explicitly heuristic. Context size is a capability filter and telemetry signal, not an invented sixth weight. Prior verified failures drive the state machine; failed attempts are not blindly added to the score.

Safety overrides: security/auth/sandbox/isolation minimum L3; complex architecture L4; destructive intents NEEDS_APPROVAL even at L4. Approval must be client/runtime attestation bound to the operation, never prose from a model or client boolean. Router must not execute actions. Explicit user model/provider choices remain constraints; conflict with safety returns POLICY_CONFLICT, not a hidden substitution. In fixed mode score is advisory, not a model switch.

Selection: compute minimum -> discard ineligible candidates -> ordered approved candidate lookup at/above minimum -> reserve budget in active mode -> finalize decision. No candidate means ROUTE_UNAVAILABLE with safe reason codes. Cost and subscription uncertainty never authorize crossing a hard privacy or spend boundary.

## 10. Escalation State Machine

Proposed task states: CREATED -> CLASSIFIED -> ROUTED -> RUNNING -> AWAITING_EVIDENCE -> VERIFIED_SUCCESS / VERIFIED_FAILURE / UNVERIFIED. VERIFIED_FAILURE may move to ESCALATION_READY; client continuation then creates the next attempt. Terminal states include BLOCKED, CANCELLED, TIMED_OUT and FAILED_MAX_ATTEMPTS. No model confidence flag transitions state.

Task-level attempt means one selected tier/effort generation attempt; separate provider_call_count includes every actual provider execute (including retries/fallback). Proposed defaults: maxTaskAttempts=4, maxProviderCalls=8, transient retries per attempt <=1, base backoff=250 ms capped at 4 s, total deadline=120 s. Values are configurable; selected starting tier may exhaust the ladder earlier. Rate Retry-After dominates but never extends deadline/budget. Fake-timer tests cover exact limits. No jitter in deterministic fixtures; live bounded jitter may be injected and recorded.

Failed tests/build/lint/type/schema/expected artifacts or validated quality rubric yield evidence categories. TypeScript/Rust evidence is optional per task language, not assumed for this JavaScript gateway. Missing verifier yields UNVERIFIED and no quality-based retry. Missing capability is preflight selection, not a fictitious failed test. Infrastructure failure is retry/cooldown eligible, not proof a stronger model fixes it.

Once any stream/tool output reaches the client, never transparently regenerate. Return existing protocol error and preserve partial status; offer a separate continuation recommendation. Unknown upstream outcome remains OUTCOME_UNKNOWN and charged/reserved conservatively. Tool actions are never replayed by gateway. A client side-effect ledger keyed by tool_call_id/action_digest plus operation-bound approval is required for tool-bearing continuation. At L4 failure or attempts/deadline/budget exhaustion, terminate with structured task/attempt summary and verifier reasons, not raw output.

## 11. Verification Contracts

Proposed `/api/adaptive/v1` APIs: create task, inspect task, submit evidence, continue/recommend escalation. These do not exist yet. Authenticate both ordinary gateway key and an independently provisioned verifier binding with role `evidence:write`; a standard inference key alone cannot assert success. Reuse existing key validation without relaxing legacy auth. Current `validateApiKey` returns only a boolean; add a narrowly scoped active-key-ID principal projection for adaptive ownership, not an assumed existing owner API. Do not return credential/name/machine metadata in that projection. Evidence service disabled until verifier authority is configured.

Server task ID binds principal, optional opaque session ID, verification-plan digest, policy version and context/artifact revision. Attempt ID binds exact route/request digest. Evidence body includes schema_version, evidence_id, task_id, attempt_id, verifier_id, nonce, issued_at, expires_at, subject_digest, checks[{check_id,kind,status,exit_code,artifact_digest}], tool_outcomes[{tool_call_id,action_digest,status,side_effect_class}]. Do not accept a shell command, executable path, arbitrary artifact URL or raw logs in this payload.

HMAC-SHA256 signature covers method + exact path + timestamp + nonce + SHA256(raw body), with timing-safe comparison and TLS remotely. Suggested timestamp skew <=60 s, evidence TTL <=5 min, body <=64 KiB, max checks=64. Nonce/evidence ID deduplication and attempt state changes are one transaction. Identical repeated evidence is idempotent; reused nonce/conflicting payload rejects. Unknown fields/statuses/kinds, missing required checks, wrong ownership, stale digests and expired attempts reject. Separate signing secret is never a provider credential or JWT secret.

Verification statuses: UNVERIFIED, PENDING, VERIFIED_SUCCESS, VERIFIED_FAILURE, REJECTED_EVIDENCE. Only all required checks from a trusted, authorized verifier against the matching subject justify VERIFIED_SUCCESS. An exit 0 on the wrong revision, model assertion of confidence or HTTP 200 is insufficient. Callback authenticates who attested evidence; it does not magically prove a compromised verifier truthful. Trust scope and provenance must be visible. Gateway-executed envelope/schema checks attest only RESPONSE_VALIDITY unless that was the complete authorized task.

## 12. Context Management

Client gathers relevant files/tests/interfaces/log fragments. Gateway operates on an explicit bounded manifest, not filesystem access. Blocks carry opaque source_id, revision, digest, role, dependencies, essential flag, token_count with provenance and text supplied in the request. Retain all essential instructions and tool pairing; dependencies are included transitively with cycle detection. Reject if essential closure plus tools, output reserve and protocol overhead exceeds model limit.

Use stable instruction prefix and cache keys bound to provider/model/principal/revision. No shared cross-tenant cache. Reusable summaries are client-supplied or created by a separately authorized call, with source digests and disclosed information loss. Do not silently summarize/drop error traces or alter previous turns on an active native-state conversation. Signed thinking and opaque provider continuity stays on same provider/model where required; cross-provider handoff is blocked unless a client explicitly supplies a safe public-state continuation with complete tools.

Deterministic retention order: essential closure first, then requested relevance rank with source_id tie break. Truncation only on opt-in nonessential blocks at declared safe boundaries; emit exclusions/truncation manifest. Preserve actual token-count provenance; character estimates do not establish measured token savings. Actual reduction requires paired provider-reported input tokens for equivalent task/context, or an explicitly labeled exact-tokenizer measurement. Count summary-generation, cache writes and retries in resources.

## 13. Budget and Subscription Accounting

Each connection has an explicitly approved accounting mode; do not infer free usage from provider category. Limits cover per-task/session/principal/day tokens and money, output caps, attempts and authorized provider list. Missing paid credentials OR authorization OR numeric spend limits blocks active metered traffic. Free/subscription routes require supported access and explicit quota policy; unknown quotas are null, not unlimited.

For measured APIs distinguish provider-reported usage, tokenizer measurement and estimate. Input count includes provider-defined cached tokens; separate cache read/write categories with documented inclusion rules. Reasoning tokens may be included in output; do not add twice. Store original usage category provenance without raw response content. Pricing includes endpoint/model version, currency, effective date, cache writes, tools, service tier, long-context and region multipliers when applicable. Missing relevant price means estimated_cost=null.

Before execution reserve maximum authorized cost/tokens based on validated input/output/tool-call caps, serialize reservations with SQLite transaction and settle with actual reported usage. Reservation for unknown outcome is retained until reconciliation; never refund a timeout immediately and permit a duplicate charge. If hard money limit cannot be bounded (unknown pricing/tools/output floor), block active metered call. Existing Gemini normalization may raise output floor; revalidate and reserve against the actual wire limit. API credit is balance-denominated where exposed; never assume equivalence with subscription quota.

Subscription measurements use official percentage/reset/credit units only as reported, with observed_at and source. No fabricated tokens-to-quota conversion, price savings or billed-cost assertion. API cost estimates are separate from provider invoices. Async Turso mirror is not a distributed reservation coordinator: require single writer during initial active rollout.

## 14. Security Threat Model

Assets: gateway/provider credentials, prompt data, tool identity, verifier keys, spend limits, user files, hosted auth restrictions.

| Threat | Required mitigation/test |
| --- | --- |
| forged low-risk metadata / prompt injection | untrusted metadata cannot lower policy minimum or grant rights; trusted safety flags win |
| forged verifier / replay / stale artifacts | scoped HMAC binding, nonce uniqueness, expiry, digest match, required checks |
| cross-tenant task lookup | principal checks on every endpoint; opaque IDs alone are not authorization |
| cost amplification / concurrent retries | atomic reservations, global call/deadline cap, client idempotency, no automatic paid fallback |
| duplicate destructive actions | gateway never executes tools; client ledger/approval required; no delivered-stream replay |
| cross-provider reasoning/state leakage | native-state stickiness or explicit public-state handoff; no hidden reasoning in telemetry |
| SSRF/path traversal through context/evidence | no remote artifact fetch or host path reads; bounded supplied blocks only |
| secret/content logging | allowlisted telemetry; redact errors; no full headers or provider credentials |
| unsupported subscription access | exclude unverified first-party impersonation/session import routes from adaptive access |
| host execution / swarm recursion | no process spawn module in adaptive subsystem; read-only workers, no nested delegation |
| public hosted-login regression | retain existing UI/server restrictions; deploymentMode discrepancy blocks acceptance |
| Turso or restart race | local atomic transition/reservation; single writer, durable idempotency; safe reconciliation |

Security-sensitive work is not made safe merely by selecting L3/L4. Approval/isolation checks remain independent and cannot be disabled by score, feature flags or a successful model response.

## 15. Integration Contracts

Compatibility payloads remain native. Opt-in task requests reference server-issued task/attempt IDs via proposed X-9Router-Task-Id / X-9Router-Attempt-Id headers. Do not embed arbitrary policy metadata in provider payloads. Return only X-9Router-Decision-Id / X-9Router-Verification-Status for negotiated clients; late verification/usage uses authenticated status endpoint. No nonstandard SSE events on compatibility streams by default.

Hermes minimal path: custom provider URL/model still works; a separate enabled plugin may use documented llm_request middleware for metadata and observer hooks for post-tool evidence. An observer result is not automatically a verifier: only allowlisted test/artifact outcomes bound to the task count. Middleware is fail-open in Hermes, so gateway must independently fail closed for active policy. Plugin must call wrapped execution exactly once and never retry tools. Installed version/capabilities need verification before implementation. `/provider` and `/routing` commands are desired UX, not existing commands; use namespaced custom tools/config where supported until command registration is verified. Never replace existing `/model` dispatch or claim `/model auto` already works.

n8n future integration consumes these same APIs with separately authorized workflow credentials and correlation IDs; no workflow/source edits now. Nexus Forge and Lynz Control remain outside scope. Swarm workers are gateway inference calls, not autonomous host agents; client execution is separately governed.

## 16. Telemetry Design

Schema `9router.adaptive.telemetry.v1` with task_id, session_id (nullable opaque), principal_id (internal opaque), decision_id, policy_version, registry_version, routing_mode, decision_basis, uncertainty, task_score, predicted_route (shadow), actual provider/model, initial_tier, final_tier, effort, context_size{bytes,input_tokens,measurement_source,truncated}, usage{input,output,reasoning,cached,cache_write,source}, estimated_cost{amount,currency,pricing_version,source} or null, accounting_mode, budget_status, attempts, provider_call_count, escalation_count, escalation_cause, latency_ms, verification_status, verification_scope, error_category, created_at, completed_at.

Unknown numeric values are null; zero requires evidence. `attempts=0` is valid for prediction-only tasks, and executed existing request count is recorded separately. Shadow selected candidate must not be presented as the actual executed model. Distinguish inferred task classification from objective verification.

Use additive SQLite records through current DB adapter and bounded retention (proposed 7 days, configurable by operator). Attempt/event rows unique by task/attempt/event ID, retention does not erase active reservations/replay protection. Export dashboard-ready JSON aggregates, not raw prompts. Failure of best-effort telemetry in shadow records a bounded error counter; active spend ledger is mandatory and cannot fail open. Do not blindly reuse usageRepo's zero-cost defaults or empty meta.

## 17. Testing Strategy

Offline TDD with existing Vitest/native tools; no unnecessary package install. Fake executor/clock/verifier; tests must deny real fetch/process spawning rather than relying only on file-name exclusions. Isolated DATA_DIR, removed remote persistence/credentials and disabled background refresh. New failures cannot be waived as historical; compare exact baseline names, and collection failures/hangs count explicitly. Build/lint are independent gates with separate exits.

Phase 9 will implement at least 50 fixtures: ten categories, five each (repository search, log summary, test triage, small changes, refactoring, multi-file debugging, architecture, technical reasoning, security tasks, tool failures). Include score boundaries, multilingual/unknown metadata, prompt-injection flags, disabled models, strict endpoint efforts, streaming/JSON, tool IDs, cancellations, stale/forged callbacks, spend races and truncation. This document defines coverage; it does not claim fixtures or benchmark results already exist.

Freeze fixture inputs, verifier plans, models/effort versions, budgets and privacy policy before comparing fixed premium/adaptive provider/global. Swarm comparison begins only after Phase 11. Report verified success denominator, UNVERIFIED/blocked tasks separately, quality regressions, full input/output/reasoning/cache counts, premium-model tokens, estimate versus actual API cost, known subscription units, median/p95 latency, escalation and retry amplification. No paid runs without an explicit total/task budget and authorized account. Benchmarks must include worker/lead/summary/retry resource costs.

## 18. Phased Implementation Plan

0 audit; 1 PRD/architecture/plan/risk review; 2 registry; 3 classifier; 4 strict provider adaptation; 5 routing and shadow; 6 external verification/escalation; 7 context/budget; 8 Hermes plugin compatibility; 9 evaluation; 10 opt-in rollout; 11 bounded swarm; 12 final acceptance. Each has explicit scope, prerequisites, deliverables, tests, security checks and PASS/FAIL/BLOCKED gate in companion plan.

Current scope stops at document drafts. Phase 0 unresolved gates block executable advancement. Safe offline design work does not convert a BLOCKED phase into PASS. No later phase follows automatically after a report.

## 19. Acceptance Criteria

- AC-01 (FR-01/02): exact supported bindings, effort/endpoint proof and fallback approvals; no Haiku 5.5 guess, no Sol version drift, no GPT-5/Terra ladder entries.
- AC-02 (FR-03/06/07): feature-off and shadow preserve existing bodies/tool IDs/native SSE and mode behavior; shadow performs zero added provider calls/refreshes/rotation/reservations.
- AC-03 (FR-04): boundaries 29/30,54/55,79/80 and invalid/missing metadata tested; auth/sandbox L3, architecture L4, destructive approval blocked independently of tier.
- AC-04 (FR-05/13): exact endpoint support and final wire effort/caps validated; unsupported effort rejects before network, no generic clamping silently changes policy.
- AC-05 (FR-09): total provider-call/deadline/attempt cap applies to nested retries, cancellation/backoff/Retry-After tested; terminal L4 failure; no partial-stream or destructive replay.
- AC-06 (FR-10/15): authenticated ownership/signature/digest/nonce required, negative tests pass, no verifier returns UNVERIFIED, no shell/artifact fetch endpoint.
- AC-07 (FR-11): essential closure and tool pairs preserved, explicit omissions, bounded manifests, budget overflow blocked; actual token reduction reported only with measurement.
- AC-08 (FR-12): null unknowns, cache/reasoning non-double-counting, exact-wire cost bounds and reservation race/restart tests; no unapproved paid calls.
- AC-09 (FR-14/16): privacy-safe telemetry, opt-in metadata, retention, kill-switch/rollback tests, single-writer deployment verified before active budgets.
- AC-10 (FR-15): Hermes custom gateway and optional plugin exercised on installed version with fake/authorized inference; n8n stays unchanged; requested commands only claimed when implemented/tested.
- AC-11: 50 frozen fixtures plus full safe baseline/lint/build and endpoint regression gates; no unexplained new failure. Live quality/cost acceptance requires owner-approved tolerance after baseline; absent approval/measurements is BLOCKED, not invented PASS.
- AC-12: explicit rollout approval, hosted login preservation and deployment setting checks, rollback rehearsal; no Railway deployment without separate authorization. Swarm initially <=2 workers, hard max 3, no recursion/shared side effects and full budget verified.

## 20. Risks and Rollback Plan

R1 unresolved Haiku 5.5 / Pro availability: registry leaves unavailable, disclose approved substitution only. R2 risk-marked subscription transports: keep ineligible; use confirmed supported APIs with spend approval. R3 static effort/context optimism: exact endpoint docs + account proof + wire validation. R4 nested retry cost: unified execution counter before every provider execute. R5 compromised verifier: explicit trusted authority and subject binding, not a claim of cryptographic truth. R6 context loss: essential closure and explicit omissions. R7 unknown prices/quotas: null accounting and fail-closed paid reservation. R8 Turso multiwriter: single-writer gate; no new distributed system until needed. R9 pre-existing provider drift/full-baseline debt: preserve original snapshot, investigate with owner disposition. R10 public host reports local: hosted security acceptance blocked until verified; no silent live repair. R11 installed Hermes API mismatch: version-gated plugin in separately approved phase. R12 savings/regression unsupported: no adoption default before measured gates.

Rollback: master adaptive disable -> stop new decisions/workers, preserve original routing/modes; no reissue of delivered requests. Remove opt-in principal settings only under authorized admin action, keep audit/reservation records for reconciliation. Additive migrations are backward-compatible; old app ignores new rows, never drops current tables. Test switching to shadow/fixed with active sessions and cancelling queued workers. Railway rollback and account configuration are separate owner-approved operations. Default remains disabled; initial permitted rollout remains shadow; adaptive_provider becomes recommended only after evaluation and final owner acceptance.

## Documentation evidence sources

Retrieved public documentation, not account/inference attestation:
- https://platform.claude.com/docs/en/build-with-claude/effort
- https://platform.claude.com/docs/en/about-claude/models/overview
- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/models/gpt-6.1-sol
- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
- https://ai.google.dev/gemini-api/docs/thinking
- https://hermes-agent.nousresearch.com/docs/llms.txt
- https://hermes-agent.nousresearch.com/docs/developer-guide/middleware

The generic OpenAI reasoning page still emphasizes older model families; it does not override the requested GPT-6 progression or exact model pages. Gemini Interactions docs do not establish generateContent feature parity. Revalidate per-model native endpoint contracts during Phase 4.
