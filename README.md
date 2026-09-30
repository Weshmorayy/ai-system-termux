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

---

## Quick Reference

```bash
ai-status        # System health overview
ai-models        # Model table with benchmark data
ai-quota         # Quota status per provider
ai-health        # Provider availability check
dsh-start        # Launch DeepSeek Harness web UI

# FreeLLMAPI
cd ~/freellmapi && npm run dev    # Start provider gateway (port 3001)
```

---

## How to Add a Provider

1. Add API key to ~/.dsh/.credentials.yaml and ~/.bashrc
2. Add provider in ~/.dsh/settings.yaml under llm-pi-ai.providers
3. Add provider keys to FreeLLMAPI via its dashboard (http://localhost:5173)
4. Add provider metadata to ~/AI_SYSTEM/providers/
5. Update model registry: ai-models refresh

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

*Last updated: 2026-09-22*
