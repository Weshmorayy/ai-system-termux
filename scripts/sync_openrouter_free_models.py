#!/usr/bin/env python3
"""Keep FreeLLMAPI's catalog in sync with OpenRouter's free (zero-priced) models.

Why this exists
---------------
FreeLLMAPI ships a *seeded* catalog: `server/src/db/migrations/
20260101_000000_legacy_baseline.ts` hardcodes a list of OpenRouter `:free`
models, and `services/catalog-sync.ts` then pulls a signed monthly catalog
from api.freellmapi.co. Neither ever queries OpenRouter live, and `openrouter`
is not among the 24 platforms that catalog manages -- so any zero-priced model
added upstream after the seed was written is simply invisible.

That is why stealth/space-bunny-alpha never showed up in the dashboard.

The gate it cannot get past: `services/builtin-model-discovery.ts` refuses to
discover into a platform that has catalog-owned rows (`hasCatalogOwnedRows`),
and every seeded row carries `source='catalog'`. We deliberately do NOT patch
that shared function. This script writes `source='discovered'` rows instead,
which `catalog-sync.ts` only prunes on platforms the catalog manages
(catalog-sync.ts:654) -- openrouter is not managed, so these rows survive.

Which models count as free
--------------------------
A model is free when the sum of ALL its pricing fields is exactly 0 -- the same
rule the Open WebUI OpenRouter pipe uses (`is_free_model`, bundled pipe line
19900). Checking price rather than the `:free` suffix matters: as of this sync,
4 free models carry NO `:free` suffix, and they are exactly the stealth-style
ones:

    stealth/space-bunny-alpha
    google/lyria-3-pro-preview
    google/lyria-3-clip-preview
    openrouter/free

Conversely every `:free` model is also zero-priced, so the price check never
misses one and never imports a paid model.

Usage
-----
    python3 sync_openrouter_free_models.py              # skips if refreshed <12h ago
    python3 sync_openrouter_free_models.py --force      # always query
    python3 sync_openrouter_free_models.py --dry-run    # report, write nothing

Safe by design, because freellmapi-start runs this on every boot:
  * any failure logs one line, exits 0, and leaves the database untouched
  * one transaction for the whole apply
  * never touches rows this script did not create
  * never deletes; models that vanish upstream are disabled, not removed
  * read-only unless the candidate set is validated first
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from decimal import Decimal, InvalidOperation

# --- locations (override with env for testing) -------------------------------
HOME = os.environ.get("DSH_HOME", os.path.expanduser("~/.dsh"))
DB_PATH = os.environ.get(
    "FREELLMAPI_DB", os.path.expanduser("~/freellmapi/server/data/freeapi.db")
)
CREDS = os.path.join(HOME, ".credentials.yaml")
STAMP = os.path.join(HOME, ".freellmapi-or-sync")
MODELS_URL = "https://openrouter.ai/api/v1/models"

PLATFORM = "openrouter"
SOURCE = "discovered"  # matches DISCOVERED_MODEL_SOURCE in catalog-sync.ts

# FreeLLMAPI convention, taken from the seeded openrouter rows.
# speed_rank is 1-based, lower = faster; intelligence_rank orders the fallback
# chain. Both are NOT NULL, so a discovered model needs a real value. We pick
# neutral middling numbers (speed ~10, intelligence 100) so an auto-discovered
# model can never outrank a curated one on the hot path.
DEFAULT_RPM = 20
DEFAULT_RPD = 50
DEFAULT_SIZE_LABEL = "Medium"
DEFAULT_INTELLIGENCE_RANK = 100
DEFAULT_SPEED_RANK = 10
FREE_BUDGET_LABEL = (
    "free · 50 req/day account-wide (1,000 after a $10 purchase)"
)


def log(msg: str) -> None:
    print(f"[openrouter-free] {msg}", file=sys.stderr)


def fail(msg: str) -> None:
    log(f"sync skipped: {msg}")


def read_key() -> str:
    """Resolve the OpenRouter key the same way dsh does: a credential ref."""
    with open(CREDS, encoding="utf-8") as fh:
        m = re.search(r"^\s*OPENROUTER_API_KEY:\s*(\S+)", fh.read(), re.M)
    if not m:
        raise RuntimeError("OPENROUTER_API_KEY not found in .credentials.yaml")
    return m.group(1)


def to_decimal(v):
    if isinstance(v, bool) or v is None:
        return None
    try:
        return Decimal(str(v))
    except (InvalidOperation, ValueError):
        return None


def pricing_fields(m: dict) -> list[Decimal]:
    out = []
    for v in (m.get("pricing") or {}).values():
        d = to_decimal(v)
        if d is not None:
            out.append(d)
    return out


def is_free(m: dict) -> bool:
    vals = pricing_fields(m)
    if not vals:  # no numeric pricing at all -> cannot claim it is free
        return False
    return sum(vals, Decimal(0)) == 0


def supports_tools(m: dict) -> bool:
    params = m.get("supported_parameters") or []
    return bool({"tools", "tool_choice"} & set(params))


def supports_vision(m: dict) -> bool:
    arch = m.get("architecture") or {}
    return "image" in (arch.get("input_modalities") or [])


def fetch_free_models() -> list[dict]:
    req = urllib.request.Request(
        MODELS_URL,
        headers={
            "Authorization": f"Bearer {read_key()}",
            "accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        payload = json.loads(resp.read().decode())
    data = payload.get("data")
    if not isinstance(data, list) or not data:
        raise RuntimeError("OpenRouter returned no data[] array")
    free = [m for m in data if isinstance(m.get("id"), str) and is_free(m)]
    return sorted(free, key=lambda m: m["id"])


def active_profile(db: sqlite3.Connection) -> int | None:
    row = db.execute(
        "SELECT value FROM settings WHERE key = 'active_profile_id'"
    ).fetchone()
    if not row or row[0] in (None, ""):
        return None
    try:
        return int(row[0])
    except (TypeError, ValueError):
        return None


def next_priority(db: sqlite3.Connection, profile_id: int | None) -> int:
    """Auto-discovered models go to the END of the chain.

    ORDER BY ... priority ASC means a higher number is a later fallback, so a
    newly discovered model can never displace a curated one on the hot path.
    """
    if profile_id is None:
        return 1000
    row = db.execute(
        "SELECT COALESCE(MAX(priority), 0) FROM profile_models WHERE profile_id = ?",
        (profile_id,),
    ).fetchone()
    return int(row[0]) + 1


def apply(free: list[dict], dry_run: bool) -> None:
    if not os.path.exists(DB_PATH):
        raise RuntimeError(f"database not found: {DB_PATH}")

    db = sqlite3.connect(DB_PATH, timeout=30)
    try:
        # The server holds this DB open in WAL; wait rather than fail.
        db.execute("PRAGMA busy_timeout = 30000")
        db.row_factory = sqlite3.Row

        profile_id = active_profile(db)
        existing = {
            r["model_id"]: r
            for r in db.execute(
                "SELECT * FROM models WHERE platform = ?", (PLATFORM,)
            )
        }
        live_ids = {m["id"] for m in free}

        # Validate the candidate plan before touching anything.
        to_insert, to_refresh, to_link = [], [], []
        for m in free:
            mid = m["id"]
            row = existing.get(mid)
            if row is None:
                to_insert.append(m)
            else:
                to_refresh.append((m, row))
            if profile_id is not None and (
                row is None
                or not db.execute(
                    "SELECT 1 FROM profile_models WHERE profile_id = ? AND model_db_id = ?",
                    (profile_id, row["id"]),
                ).fetchone()
            ):
                to_link.append(mid)

        # Models this script added that upstream no longer lists: disable, never
        # delete. Only rows with our own source are touched.
        orphans = [
            r for mid, r in existing.items()
            if mid not in live_ids and r["source"] == SOURCE
        ]

        if dry_run:
            log(f"dry-run: {len(free)} free upstream | "
                f"{len(to_insert)} new | {len(to_refresh)} refresh | "
                f"{len(to_link)} profile link(s) | {len(orphans)} orphan(s)")
            for m in to_insert[:8]:
                log(f"  + {m['id']}")
            for m in free:
                if m["id"] in {r["model_id"] for r in orphans}:
                    log(f"  - {m['id']} (would disable)")
            return

        prio = next_priority(db, profile_id)

        def work() -> None:
            nonlocal prio
            for m in to_insert:
                ctx = int(m.get("context_length") or 0)
                db.execute(
                    """
                    INSERT INTO models (
                        platform, model_id, display_name, intelligence_rank,
                        speed_rank, size_label, rpm_limit, rpd_limit, tpm_limit,
                        tpd_limit, monthly_token_budget, context_window,
                        enabled, supports_vision, key_id, supports_tools,
                        paid_input_per_m, paid_output_per_m, source, endpoint_scope
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,NULL,NULL,?,'')
                    """,
                    (
                        PLATFORM,
                        m["id"],
                        m.get("name") or m["id"],
                        DEFAULT_INTELLIGENCE_RANK,
                        DEFAULT_SPEED_RANK,
                        DEFAULT_SIZE_LABEL,
                        DEFAULT_RPM,
                        DEFAULT_RPD,
                        None,
                        None,
                        FREE_BUDGET_LABEL,
                        ctx if ctx > 0 else None,
                        1,
                        1 if supports_vision(m) else 0,
                        1 if supports_tools(m) else 0,
                        SOURCE,
                    ),
                )

            # Refresh only the fields we own; curated tuning is left alone.
            for m, row in to_refresh:
                ctx = int(m.get("context_length") or 0)
                db.execute(
                    """
                    UPDATE models
                       SET context_window = COALESCE(?, context_window),
                           display_name = ?,
                           supports_vision = ?,
                           supports_tools = ?,
                           enabled = 1
                     WHERE id = ?
                    """,
                    (
                        ctx if ctx > 0 else None,
                        m.get("name") or m["id"],
                        1 if supports_vision(m) else 0,
                        1 if supports_tools(m) else 0,
                        row["id"],
                    ),
                )

            if profile_id is not None:
                for mid in to_link:
                    model_id = db.execute(
                        "SELECT id FROM models WHERE platform = ? AND model_id = ?",
                        (PLATFORM, mid),
                    ).fetchone()
                    if not model_id:
                        continue
                    db.execute(
                        """
                        INSERT INTO profile_models
                            (profile_id, model_db_id, priority, enabled)
                        VALUES (?,?,?,1)
                        """,
                        (profile_id, model_id[0], prio),
                    )
                    prio += 1

            for r in orphans:
                db.execute("UPDATE models SET enabled = 0 WHERE id = ?", (r["id"],))

        db.execute("BEGIN IMMEDIATE")
        work()
        db.commit()

        log(
            f"synced {len(free)} free models "
            f"(+{len(to_insert)} new, {len(to_refresh)} refreshed, "
            f"{len(to_link)} linked, {len(orphans)} disabled)"
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    force = "--force" in sys.argv
    dry_run = "--dry-run" in sys.argv
    min_age_h = 12.0
    for a in sys.argv:
        if a.startswith("--min-age-hours="):
            min_age_h = float(a.split("=", 1)[1])

    if not force and not dry_run and os.path.exists(STAMP):
        try:
            age_h = (time.time() - float(open(STAMP).read().strip())) / 3600
            if age_h < min_age_h:
                log(f"list is {age_h:.1f}h old (< {min_age_h}h), skipping")
                return 0
        except (ValueError, OSError):
            pass

    try:
        free = fetch_free_models()
        apply(free, dry_run)
    except (urllib.error.URLError, OSError, RuntimeError, sqlite3.Error) as e:
        fail(str(e))
        return 0
    except Exception as e:  # never let an unexpected error block a boot
        fail(f"unexpected: {e}")
        return 0

    if not dry_run:
        try:
            with open(STAMP, "w", encoding="utf-8") as fh:
                fh.write(str(time.time()))
        except OSError:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())