# OpenRouter Model List Auto-Refresh

How `~/.dsh/settings.yaml` stays current with OpenRouter's catalog, and why the
DeepSeek Harness (DSH) settings UI cannot do this on its own.

---

## The problem this solves

DSH shows only **4 models** on the OpenRouter route. Symptom: the picker lists
Space Bunny Alpha and two FLUX entries, nothing else.

**Cause — not an OpenRouter outage, and not a DSH bug.** An explicit `models:`
list in `~/.dsh/settings.yaml` **replaces** the bundled catalog instead of adding
to it. In `dsh-llm-pi-ai`, route models resolve on one line:

```js
// dsh-llm-pi-ai/lib/index.js:651
const entries = configured.length > 0 ? configured : [...defaults.values()].map(...)
```

Write a `models:` list → that list is the entire catalog. Omit it → DSH serves
the catalog frozen inside `@earendil-works/pi-ai`.

Three of those four hand-written ids (`flux-1-dev`, `flux-1-schnell`,
`bytedance/seedream-3`) no longer exist on OpenRouter's `/models` listing at all.

## Why the UI's "Fetch available models" cannot fix it

Model discovery short-circuits to the bundled catalog *before* any network call:

```js
// dsh-llm-pi-ai/lib/index.js:2274
if (request.provider !== void 0) {
  const installed = catalogModels(request.provider)
  if (installed.size > 0) return [...installed.values()]...  // network never reached
}
```

Any provider named `openrouter` returns the frozen snapshot. This is upstream
[deepseek-harness#4469](https://github.com/deepseek-ai/deepseek-harness/discussions/4469),
not something configuration can work around. Hence the script.

---

## Architecture

Four routes under `llm-pi-ai.providers`, each with a distinct job:

| Route | Source | Count | Purpose |
|---|---|---|---|
| `openrouter` | pi-ai package | ~366 | Catalog route — **no `models:`, no `api:`, no `baseURL:`**. Full metadata: per-token cost, reasoning ladders, per-model protocol. |
| `openrouter-extra` | live `/api/v1/models` | ~120 | `live − catalog`. Only what the bundled catalog cannot serve. |
| `openrouter-images` | live `/api/v1/images/models` | ~55 | Image-generation catalog. |
| `space-bunny` | pinned | 1 | Continuity — survives if the model leaves the public listing. |

Two self-healing properties, both automatic:

- OpenRouter **adds** a model → appears in `openrouter-extra` on the next refresh.
- pi-ai later **ships** that model → it silently migrates out of `openrouter-extra`
  into the catalog route. The extras list shrinks by itself.

The catalog route is frozen until `npm i -g @deepseek-ai/dsh@latest`, which also
means its ~23 dead upstream models stay selectable. Only a pi-ai upgrade clears those.

### Why the image route works at all

Discovery builds its URL by appending `/models` to whatever base URL you give it:

```js
// dsh-llm-pi-ai/lib/index.js:2163
if (api !== "anthropic-messages") return `${base}/models`
```

So `baseURL: https://openrouter.ai/api/v1/images` fetches
`…/api/v1/images/models` — OpenRouter's separate image catalog, which
`/api/v1/models` never mentions.

> **Caveat:** DSH is a chat harness with no image-*generation* code path. It
> imports none of pi-ai's image providers. Selecting a pure generation model
> (seedream, flux.2, qwen-image, gpt-image-2) makes DSH POST to `/chat/completions`,
> which will fail — those need `POST /api/v1/images/generations`. The ~11 chat
> models that *emit* images (gemini-3.1-flash-image, gpt-5-image, …) do work.

---

## Accurate tokens and reasoning

Both come from fields the earlier hand-written config got wrong.

### maxTokens

`top_provider.max_completion_tokens` is authoritative — *"Maximum completion
tokens from the top provider"*. The only real constraint is
`max_tokens < context_length`. An earlier clamp to 131072 understated **15
models**, Space Bunny Alpha by 4× (131072 instead of the true 524288).

### Reasoning ladders

Each model may expose a `reasoning` object:

```json
// stealth/space-bunny-alpha, live
{ "mandatory": true,
  "supported_efforts": ["max","xhigh","high","medium","low"],
  "default_effort": "max" }
```

- `supported_efforts` — the allowlist, descending. `null` = all gateway values
  accepted; **omitted = the model exposes no effort selection**.
- `mandatory: true` — the model **rejects** `effort: "none"`, so no `off` level
  may be offered. Offering one is a latent request failure.
- Levels map 1:1 onto pi-ai's `THINKING_LEVELS`
  (`off minimal low medium high xhigh max`), except OpenRouter's `"none"`,
  which is pi-ai's `off`.

So `off: none` is emitted **only** when `"none"` is explicitly listed and the
model is not mandatory. Verified: 0 illegal efforts sent, 0 ladder mismatches.

---

## The script

`scripts/refresh-openrouter-models.mjs` → installed at
`~/.dsh/refresh-openrouter-models.mjs`, and invoked automatically by `dsh-start`.

```bash
node ~/.dsh/refresh-openrouter-models.mjs              # skips if refreshed <12h ago
node ~/.dsh/refresh-openrouter-models.mjs --force      # always query
node ~/.dsh/refresh-openrouter-models.mjs --min-age-hours=0
```

### Startup safety

`dsh-start` runs this on **every boot**, so a bad write would break every
provider route. Four guards:

1. **Validate before write.** Parses the candidate with dsh's own `js-yaml`, then
   asserts the catalog route is byte-preserved, both route counts match, the saved
   default still resolves, and `openrouter-extra` has no duplicate ids. Any failure
   → `throw`.
2. **Never throw past startup.** An `uncaughtException` handler logs one line and
   exits 0, so a dead network or rotated key cannot block the boot.
3. **Atomic write.** Writes `settings.yaml.tmp-<pid>` then `rename(2)`s it. A
   concurrent dsh request sees either the whole old file or the whole new one —
   never a truncated one that would fail YAML parsing.
4. **Bounded backups.** Keeps the newest 10; skips a refresh entirely when the
   list is unchanged.

> Guard 1 has caught two real bugs in this script during development, both cases
> of `Array.map()` returning arrays-of-lines that `join()` collapsed onto one
> comma-separated line. Validate-before-write is not theoretical here.

### Rollback

`~/.dsh/settings.yaml.bak-*` — rotating 10-deep, plus
`settings.yaml.bak-ORIGINAL-4-models` (the original 4-model setup). The rotation
regex matches only `bak-<digits>`, so the ORIGINAL file is never touched.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Only a handful of models | a `models:` list replaced the catalog | remove the `models:` block |
| Picker's models look stale | bundled catalog is frozen | `npm i -g @deepseek-ai/dsh@latest` |
| "Fetch available models" shows old ids | short-circuits for catalog routes | use the script |
| Composer stuck on "Select model" | saved default names a deleted route | script repoints it; else set `agent-default-model` by hand |
| A model errors with an effort value | effort not in its allowlist | regenerate; the script only sends listed efforts |
| An image model 404s | DSH calls `/chat/completions`, not `/images/generations` | expected — use an image-capable chat model or an MCP tool |

---

## Related

- [DSH guide: Configure models](https://deepseek-harness.github.io/deepseek-harness/en/guide/providers)
- [dsh-llm-pi-ai configuration reference](https://deepseek-harness.github.io/deepseek-harness/en/reference/config-catalog)
- [OpenRouter: Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)
- [OpenRouter: Models API](https://openrouter.ai/docs/guides/overview/models)
- [Upstream bug #4469](https://github.com/deepseek-ai/deepseek-harness/discussions/4469)

*Last updated: 2026-10-01*