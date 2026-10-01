# AI Engineering System — Android/Termux

> Lightweight, quota-aware, model-aware, vision-capable, memory-efficient,
> multi-model AI engineering system built around DeepSeek Harness.
>
> Device: Samsung A24 · 4 GB RAM · ARM64 · Android/Termux · Node v26.4.0

---

## Architecture Overview

```
DeepSeek Harness (agent runtime, skills, tools, sessions)
        │
   Task Classifier (capability profile)
        │
   Model Intelligence (Artificial Analysis + PublicAI)
        │
   FreeLLMAPI (provider gateway: health, quotas, failover)
        │
   ┌────┬────┬────────┬───────────┬──────────┐
   │    │    │        │           │          │
Google Groq Cerebras Mistral  NVIDIA   Cloudflare
                     OpenRouter  Z.ai     others
```

**Key principle:** Four separate concerns:
1. Is this model _good_? → Artificial Analysis + PublicAI
2. Is this model _available now_? → FreeLLMAPI / provider catalog
3. Do I still have _quota_? → Provider headers + FreeLLMAPI observation
4. Which route for _this task_? → DSH task profile + FreeLLMAPI routing

---

## Components

| Component | Location | Purpose |
|---|---|---|
| DeepSeek Harness | ~/.dsh/ + global npm | Agent runtime |
| FreeLLMAPI | ~/freellmapi/ | Provider aggregation / failover |
| Model registry | ~/AI_SYSTEM/models/registry.yaml | Model metadata cache |
| Quota state | ~/AI_SYSTEM/quotas/state.yaml | Observed quota state |
| Routing config | ~/AI_SYSTEM/routing/profiles.yaml | Task → model profiles |
| Skills | ~/AI_SYSTEM/skills/ | Reusable agent skills |
| Workflows | ~/AI_SYSTEM/workflows/ | Repeatable processes |
| Scripts | ~/AI_SYSTEM/scripts/ | CLI tools |
| OpenRouter refresh | ~/AI_SYSTEM/scripts/refresh-openrouter-models.mjs | Keeps the DSH OpenRouter model list current (see [docs](docs/openrouter-model-refresh.md)) |
| FreeLLMAPI free sync | ~/AI_SYSTEM/scripts/sync_openrouter_free_models.py | Pulls OpenRouter's zero-priced models into FreeLLMAPI (see [docs](docs/freellmapi-openrouter-sync.md)) |

---

## Quick Reference

```bash
ai-status        # System health overview
ai-models        # Model table with benchmark data
ai-quota         # Quota status per provider
ai-health        # Provider availability check
dsh-start        # Launch DSH web UI (also refreshes the OpenRouter model list)

# OpenRouter model list
node ~/.dsh/refresh-openrouter-models.mjs --force   # refresh now, skip the 12h rate limit

# FreeLLMAPI
cd ~/freellmapi && npm run dev    # Start provider gateway (port 3001)
```

---

## OpenRouter Model List (auto-refreshed)

DSH only shows the models named in its config, so the OpenRouter route can drift
out of date. `dsh-start` now keeps it current automatically.

- **`openrouter` route** — serves the catalog frozen in `@earendil-works/pi-ai`
  (~366 models) with full per-token cost, reasoning ladders, and per-model protocol.
- **`openrouter-extra` route** — the ~120 live models that catalog *cannot* serve.
  Self-heals: shrinks on its own as pi-ai catches up.
- **`openrouter-images` route** — the ~55 image-generation models.
- Refreshed at most once per 12h on boot; failures never block startup.

**Why an explicit `models:` list breaks this:** in DSH, a `models:` list *replaces*
the catalog rather than adding to it. Omit the list to serve the catalog; the UI's
"Fetch available models" is also a dead end for OpenRouter because discovery
short-circuits to the bundled snapshot
([upstream #4469](https://github.com/deepseek-ai/deepseek-harness/discussions/4469)).

Full architecture, accurate token/reasoning handling, and rollback:
**[docs/openrouter-model-refresh.md](docs/openrouter-model-refresh.md)**.

---

## How to Add a Provider

1. Add API key to ~/.dsh/.credentials.yaml and ~/.bashrc
2. Add provider in ~/.dsh/settings.yaml under llm-pi-ai.providers
3. Add provider keys to FreeLLMAPI via its dashboard (http://localhost:5173)
4. Add provider metadata to ~/AI_SYSTEM/providers/
5. Update model registry: ai-models refresh

> **Note (OpenRouter):** if you hand-write a `models:` list for OpenRouter in step 2,
> it **replaces** the catalog and you will see only those models. For OpenRouter
> leave the list off and let `dsh-start` maintain it — see
> [docs/openrouter-model-refresh.md](docs/openrouter-model-refresh.md).

---

## How Vision Works

**Preferred (direct):** If task requires visual interpretation →
multimodal model (Gemini, Groq Qwen3.8-27B, NVIDIA GLM-5.3-Flash)

**OCR fallback:** If task is text/document extraction →
Mistral OCR 4 or Gemini PDF understanding

**Text-only fallback:** If no vision model available →
OCR + structured description → text model

**Never:** silently downgrade vision → text without noting degradation.

---

## Security Rules

- API keys → ~/.dsh/.credentials.yaml + ~/.bashrc only
- Never commit keys to git
- Never put keys in AGENTS.md or ProjectInfos
- Never expose FreeLLMAPI dashboard on public network

---

*Last updated: 2026-10-01*
