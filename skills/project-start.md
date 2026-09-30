# Skill: project-start

## When to use
Starting any new project — website, SaaS, CRM, app, API, automation, game.

## Step 1 — Classify complexity
Decide scale based on these signals:

**SMALL** (landing page, utility, script):
- No auth, no DB, no payments, no multi-user
→ Skip to Step 4. Create minimal scaffold + AGENTS.md + implement.

**MEDIUM** (CRM, dashboard, e-commerce, school module):
- Has persistent DB, users, or integrations
→ Do all steps below but keep architecture concise.

**LARGE** (SaaS, ERP, complex AI app):
- Auth + roles + payments + background jobs + multiple modules
→ Full process: requirements → domain model → security → task DAG.

## Step 2 — Clarify only blocking unknowns
Ask at most 2-3 questions. Never block on non-critical decisions.
Non-blocking defaults:
- Stack: Node.js + TypeScript unless specified
- DB: Supabase (free tier) unless specified
- CSS: Tailwind unless specified
- Deployment: Vercel/Netlify unless specified

## Step 3 — Architecture decision
Choose:
- Frontend framework (React/Next.js/Astro/plain HTML)
- Backend (Next.js API routes / Express / Hono / none)
- Database (Supabase / SQLite / none)
- Auth (Supabase Auth / next-auth / none)
- File storage (Supabase Storage / none)

## Step 4 — Create structure
```
project/
├── AGENTS.md          ← short, critical facts only
├── ProjectInfos/
│   ├── architecture/overview.md
│   ├── domain/database.md       (if DB)
│   ├── guides/code.md
│   ├── guides/design.md         (if UI)
│   ├── guides/security.md       (if auth/payments)
│   ├── decisions/               (ADRs when important choice made)
│   └── tasks/active/
└── src/ (or app/)
```

## Step 5 — AGENTS.md content (KEEP SHORT)
Include only:
- How to run / build / test
- Critical architecture constraints
- Critical security rules
- Where ProjectInfos lives
- Prohibited dangerous actions

Do NOT include: full architecture, DB schema, history, all preferences.

## Step 6 — Implement foundation
- Repo init, dependencies, env setup
- Basic folder structure
- Auth scaffold (if needed)
- DB schema (if needed)
- Then first feature

## Output
- Working repository
- AGENTS.md
- ProjectInfos structure (populated)
- Initial task list in ProjectInfos/tasks/active/
