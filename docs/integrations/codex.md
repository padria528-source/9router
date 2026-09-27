# OpenAI Codex Integration with 9Router

This guide explains how to connect [OpenAI Codex CLI](https://github.com/openai/codex) to 9Router as a model gateway.

## Prerequisites

- Codex CLI installed (`codex` command available, v0.150+)
- Running 9Router instance (local or hosted)
- A 9Router API key

## Endpoint & Protocol

Codex CLI requires the OpenAI Responses API wire protocol (`wire_api = "responses"` calling `/v1/responses`). Note: `wire_api = "chat"` (`/v1/chat/completions`) is deprecated in current Codex CLI versions.

- Hosted: `https://9router-online-production.up.railway.app/v1`
- Local: `http://localhost:20128/v1`

## Authentication

Codex CLI uses bearer authentication via an environment variable key. 9Router maps this credential to validate requests.

Set environment variable:
```bash
export OPENAI_API_KEY="YOUR_9ROUTER_API_KEY"
```

## Model Selection

Specify any compatible model available on 9Router using `-m` or in `config.toml`:
```bash
codex -m "ag/gemini-3.8-flash-high"
```

Common supported models:
- `ag/gemini-3.8-flash-high`
- `cx/gpt-6-astra`
- `cc/claude-opus-5-5`

## Configuration Example

### Option A: Via `~/.codex/config.toml` (Persistent)

Add a custom provider definition in `~/.codex/config.toml`:

```toml
model_provider = "9router"
model = "ag/gemini-3.8-flash-high"

[model_providers.9router]
name = "9Router"
base_url = "https://9router-online-production.up.railway.app/v1"
wire_api = "responses"
env_key = "OPENAI_API_KEY"
```

### Option B: Via CLI Command Line Flags (Per Invocation)

```bash
OPENAI_API_KEY="YOUR_9ROUTER_API_KEY" \
codex exec \
  --sandbox workspace-write \
  -c model_provider="9router" \
  -c model="ag/gemini-3.8-flash-high" \
  -c 'model_providers.9router.name="9Router"' \
  -c 'model_providers.9router.base_url="https://9router-online-production.up.railway.app/v1"' \
  -c 'model_providers.9router.wire_api="responses"' \
  -c 'model_providers.9router.env_key="OPENAI_API_KEY"' \
  "Your coding prompt"
```

## Verification

1. Quick response test:
```bash
OPENAI_API_KEY="YOUR_9ROUTER_API_KEY" \
codex exec \
  --ephemeral \
  -c model_provider="9router" \
  -c model="ag/gemini-3.8-flash-high" \
  -c 'model_providers.9router.name="9Router"' \
  -c 'model_providers.9router.base_url="https://9router-online-production.up.railway.app/v1"' \
  -c 'model_providers.9router.wire_api="responses"' \
  -c 'model_providers.9router.env_key="OPENAI_API_KEY"' \
  "Jawab satu kata: CODEX"
```
Expected output: `CODEX`

2. Tool execution test (file creation in workspace):
```bash
codex exec \
  --sandbox workspace-write \
  -c model_provider="9router" \
  -c model="ag/gemini-3.8-flash-high" \
  -c 'model_providers.9router.name="9Router"' \
  -c 'model_providers.9router.base_url="https://9router-online-production.up.railway.app/v1"' \
  -c 'model_providers.9router.wire_api="responses"' \
  -c 'model_providers.9router.env_key="OPENAI_API_KEY"' \
  "Write a python file calc.py with function multiply(a, b) returning a * b."
```
Expected output: Creates `calc.py` inside the current workspace.

3. Session resume:
```bash
codex exec resume --last "Add divide(a, b) function."
```

## Rollback

To restore standard OpenAI ChatGPT provider in `~/.codex/config.toml`:
- Remove `model_provider = "9router"` or set back to your default provider.
- Remove `[model_providers.9router]` section.
- Unset `OPENAI_API_KEY` if using ChatGPT subscription OAuth.

## Known Limitations

- Codex requires running inside a git repository unless `--skip-git-repo-check` is specified.
- Codex uses `responses` wire API; streaming events and usage metrics are converted to the standard Responses SSE event stream by 9Router.
