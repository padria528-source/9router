# Claude Code Integration with 9Router

This guide explains how to connect [Claude Code](https://code.claude.com/docs/en/cli-reference) to 9Router as a model gateway.

## Prerequisites

- Claude Code installed (`claude` command available, v2.x+)
- Running 9Router instance (local or hosted)
- A 9Router API key

## Endpoint

Claude Code uses the Anthropic Messages API (`/v1/messages`).

- Hosted: `https://9router-online-production.up.railway.app`
- Local: `http://localhost:20128`

Note: When setting `ANTHROPIC_BASE_URL`, the Anthropic client automatically calls `<ANTHROPIC_BASE_URL>/v1/messages`. If `/v1` is included in the base URL (`.../v1`), 9Router's rewrite rules also map `/v1/v1/messages` to the handler transparently.

## Authentication

Claude Code authenticates with `x-api-key` header using your 9Router gateway key.

Set environment variables:
```bash
export ANTHROPIC_BASE_URL="https://9router-online-production.up.railway.app"
export ANTHROPIC_API_KEY="YOUR_9ROUTER_API_KEY"
```

## Model Selection

Specify any compatible model available on 9Router using the `--model` flag:
```bash
claude --model "ag/gemini-3.8-flash-high" -p "Hello"
```

Or set the default model via `~/.claude/settings.json`:
```json
{
  "model": "ag/gemini-3.8-flash-high"
}
```

## Configuration Example

### Scoped Run (One-Shot or Script)
```bash
ANTHROPIC_BASE_URL="https://9router-online-production.up.railway.app" \
ANTHROPIC_API_KEY="YOUR_9ROUTER_API_KEY" \
claude --model "ag/gemini-3.8-flash-high" -p "Review src/index.js"
```

### Persistent Shell Profile (`~/.bashrc` or `~/.zshrc`)
```bash
export ANTHROPIC_BASE_URL="https://9router-online-production.up.railway.app"
export ANTHROPIC_API_KEY="YOUR_9ROUTER_API_KEY"
```

## Verification

1. Quick response test:
```bash
ANTHROPIC_BASE_URL="https://9router-online-production.up.railway.app" \
ANTHROPIC_API_KEY="YOUR_9ROUTER_API_KEY" \
claude --model "ag/gemini-3.8-flash-high" -p "Jawab satu kata: CLAUDE"
```
Expected output: `CLAUDE`

2. Tool execution test:
```bash
ANTHROPIC_BASE_URL="https://9router-online-production.up.railway.app" \
ANTHROPIC_API_KEY="YOUR_9ROUTER_API_KEY" \
claude --model "ag/gemini-3.8-flash-high" --allowedTools "Write,Read" \
  -p "Create hello.txt with 'Hello 9Router' and read it back."
```
Expected output: Creates file, reads content, verifies integrity.

3. Multi-turn continuation test:
```bash
claude -c -p "Append a second line to hello.txt" --allowedTools "Edit,Read"
```

## Rollback

Unset the environment variables to restore direct Anthropic API or Claude OAuth login:
```bash
unset ANTHROPIC_BASE_URL
unset ANTHROPIC_API_KEY
```

## Known Limitations

- When `ANTHROPIC_API_KEY` is set, Claude Code disables `claude.ai` web connectors because custom API key auth takes precedence.
- Claude Code emits an unknown-model advisory for non-standard model IDs (e.g. `ag/gemini-3.8-flash-high`), defaulting context tracking to 200k tokens. To override, append `[1m]` to model name or set `CLAUDE_CODE_MAX_CONTEXT_TOKENS`.
