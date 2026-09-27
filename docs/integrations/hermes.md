# Hermes Agent Integration with 9Router

This guide explains how to connect [Hermes Agent](https://github.com/NousResearch/hermes-agent) to 9Router as a model gateway.

## Prerequisites

- Hermes Agent installed (`hermes` command available)
- Running 9Router instance (local or hosted)
- A 9Router API key

## Endpoint

- Hosted: `https://9router-online-production.up.railway.app/v1`
- Local: `http://localhost:20128/v1`

## Authentication

Hermes connects to 9Router using standard OpenAI Bearer authentication.

Set in `config.yaml` or via CLI:
```bash
hermes config set model.provider custom
hermes config set model.base_url https://9router-online-production.up.railway.app/v1
hermes config set model.api_key YOUR_9ROUTER_API_KEY
```

Or via environment variable:
```bash
export OPENAI_BASE_URL="https://9router-online-production.up.railway.app/v1"
export OPENAI_API_KEY="YOUR_9ROUTER_API_KEY"
```

## Model Selection

Query available models dynamically from 9Router:
```bash
curl -H "Authorization: Bearer YOUR_9ROUTER_API_KEY" \
  https://9router-online-production.up.railway.app/v1/models
```

Set the default model in Hermes:
```bash
hermes config set model.default "ag/gemini-3.8-flash-high"
```

Or specify per query:
```bash
hermes chat -m "ag/gemini-3.8-flash-high" -q "Hello"
```

## Configuration Example

`~/.hermes/config.yaml` (or `$HERMES_HOME/config.yaml`):

```yaml
model:
  provider: custom
  base_url: https://9router-online-production.up.railway.app/v1
  api_key: YOUR_9ROUTER_API_KEY
  default: ag/gemini-3.8-flash-high
```

## Verification

1. Test connection with a quick query:
```bash
hermes chat -q "Jawab satu kata: HERMES" -m ag/gemini-3.8-flash-high
```
Expected output: `HERMES`

2. Test tool execution:
```bash
hermes chat -q "What is 12345 + 54321? Calculate using code execution." -m ag/gemini-3.8-flash-high
```
Expected output: Tool runs and returns `66666`.

## Rollback

To restore standard direct provider configuration in Hermes:
```bash
hermes config set model.provider openrouter
hermes config set model.base_url ""
hermes config set model.default "anthropic/claude-sonnet-4-20250514"
```

## Known Limitations

- All agent features (Superpowers, Skills, Obsidian Context Router, Computer Use) remain native to Hermes and execute locally. 9Router acts purely as the LLM gateway.
- Upstream model rate limits (e.g. 429) are surfaced cleanly to Hermes; configure fallback combos in 9Router to enable automatic provider retry.
