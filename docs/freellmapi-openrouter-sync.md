# FreeLLMAPI — Automatic OpenRouter Free-Model Sync

Keeps FreeLLMAPI's catalog current with OpenRouter's zero-priced models, the
same way [`openrouter-model-refresh.md`](openrouter-model-refresh.md) does for
the DeepSeek Harness model picker.

Script: `scripts/sync_openrouter_free_models.py`, run automatically by
`scripts/freellmapi-start`.

---

## The problem

The dashboard showed only **12** OpenRouter models, and `stealth/space-bunny-alpha`
was never among them.

**Cause — nothing syncs OpenRouter live.** FreeLLMAPI builds its catalog from
two sources, neither of which is OpenRouter:

1. A **seeded baseline** in
   `server/src/db/migrations/20260101_000000_legacy_baseline.ts`, which
   hardcodes a list of `:free` models.
2. A **signed monthly catalog** from `api.freellmapi.co`
   (`server/src/services/catalog-sync.ts`), covering 338 models across 24
   platforms — and `openrouter` is **not** one of them
   (`settings.catalog_applied_json.platforms`).

So any zero-priced model added upstream after the seed was written is
invisible until FreeLLMAPI ships a new migration.

### Why the existing discovery pass does not help

`server/src/services/builtin-model-discovery.ts` *would* fill the list from
OpenRouter's own `/models`, but three gates block it:

| # | Gate | Location | State |
|---|---|---|---|
| 1 | Not allowlisted | `builtin-model-discovery.ts:49` | `['github','longcat','siliconflow']` |
| 2 | Never schedules | `:64` — mode defaults to `'manual'` | needs `BUILTIN_MODEL_DISCOVERY=auto` |
| 3 | **Catalog-owned** | `:84` `hasCatalogOwnedRows()` | every seeded row is `source='catalog'` |

Gate 3 is decisive: all 317 rows carry `source='catalog'`, so discovery reports
`catalog_managed` and returns early — even if 1 and 2 are fixed.

### What we deliberately did *not* change

We do **not** patch `hasCatalogOwnedRows()`. That function is shared, and the
gated-provider test at
`__tests__/services/builtin-model-discovery.test.ts:117` shows the allowlist is a
deliberate safety gate for audited/premium providers.

Instead this sync writes rows with `source='discovered'`. That provenance is
outside `hasCatalogOwnedRows`, and `catalog-sync.ts:654` only prunes discovered
rows on platforms the catalog **manages** — `openrouter` is not managed, so
these rows survive every monthly sync.

---

## What counts as "free"

A model is free when **the sum of all its pricing fields is exactly 0** — the
same rule the Open WebUI OpenRouter pipe uses (`is_free_model`, bundled pipe
line 19900).

Checking the *price* rather than the `:free` suffix is what catches stealth
models. As of 2026-10-01, 21 models are free, but only 17 carry a `:free`
suffix. The 4 that do not are exactly the stealth-style ones:

```
stealth/space-bunny-alpha
google/lyria-3-pro-preview
google/lyria-3-clip-preview
openrouter/free
```

The check is safe in both directions: every `:free` model is also zero-priced,
so the price rule never misses one and never imports a paid model.

---

## How it writes

Writes both tables FreeLLMAPI needs. `models` alone is not enough —
`routes/free-tier.ts:129` and `routes/models.ts:449` join through
`profile_models`, so an unlinked model is never exposed.

| Column | Value | Why |
|---|---|---|
| `source` | `discovered` | keeps catalog-sync's prune away from it |
| `intelligence_rank` | `100` | neutral; cannot outrank curated models |
| `speed_rank` | `10` | `NOT NULL`; 1-based, lower is faster |
| `profile_models.priority` | `MAX(priority)+1`, incrementing | appended to the **end** of the chain, so a newly discovered model never displaces a curated one |
| `rpm_limit` / `rpd_limit` | `20` / `50` | FreeLLMAPI's free-tier convention |
| `monthly_token_budget` | `free · 50 req/day account-wide …` | matches seeded free rows |
| `context_window` | live `context_length` | e.g. space-bunny → 1000000 |

Refresh updates **only** the fields the script owns (`context_window`,
`display_name`, `supports_vision`, `supports_tools`, `enabled`). Curated tuning
on existing `source='catalog'` rows is never overwritten.

---

## Safety

`freellmapi-start` runs this on **every boot**, so a bad write would break the
gateway's catalog.

- **Read-only by default when validating** — `--dry-run` reports and writes
  nothing.
- **One `BEGIN IMMEDIATE` transaction** for the whole apply; any error rolls
  back. The server holds the DB open in WAL, so `busy_timeout=30000` waits
  rather than failing.
- **Never throws past startup** — every failure logs one line and exits 0, so a
  dead network or rotated key cannot block the gateway.
- **Never deletes.** Models that vanish upstream are `enabled=0`, not removed.
- **Never touches rows it did not create** — orphan handling is limited to
  `source='discovered'`.
- **Idempotent** — a rerun reports `+0 new`.

### Backups

`freellmapi/server/data/freeapi.db.pre-or-sync` is a pre-change snapshot,
taken with SQLite's online backup API (not `cp`, which would miss the WAL).

---

## Usage

```bash
python3 scripts/sync_openrouter_free_models.py            # skips if <12h old
python3 scripts/sync_openrouter_free_models.py --force    # always query
python3 scripts/sync_openrouter_free_models.py --dry-run  # report only
```

Override the target DB for testing:

```bash
FREELLMAPI_DB=/tmp/test.db python3 scripts/sync_openrouter_free_models.py --force
```

### Startup order matters

The sync lives in `scripts/freellmapi-start`, which `dsh-start` already invokes
as its first step:

```
dsh-start
  └─ freellmapi-start
       ├─ sync_openrouter_free_models.py   ← must stay ABOVE this line
       └─ exit 0 if the gateway is already up
```

`freellmapi-start` exits early when FreeLLMAPI is already listening. Since the
usual entry point is `dsh-start` and the gateway is normally **already running**,
the sync would be skipped on every boot if it sat below that check. Keep it above
the `already running` early exit.

Adding models to the database while the server runs is safe — the gateway reads
its catalog from SQLite per request, so no restart is needed.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Model missing after sync | upstream priced it | check `pricing` on `/api/v1/models`; the rule is sum == 0 |
| Model present but not selectable | missing `profile_models` row | the script creates it; confirm `settings.active_profile_id` |
| Gateway still lists the old set | server holds state | restart FreeLLMAPI |
| `database is locked` | another writer | `busy_timeout` retries; check for a second FreeLLMAPI process |
| Nothing logged on boot | within the 12h window | expected; use `--force` |

---

*Last updated: 2026-10-01*