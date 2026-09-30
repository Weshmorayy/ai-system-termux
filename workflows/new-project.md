# Workflow: new-project

## Trigger
User says something like "start a new project", "build me a [X]", "create [X]".

## Step 1 — Classify
Answer: small / medium / large? (see skills/project-start.md)

## Step 2 — Clarify (MAXIMUM 3 questions, only blocking ones)
Blocking examples:
- What is the core purpose? (if not clear)
- Multi-user or single-user?
- Any specific tech constraints?

Non-blocking (use defaults):
- Language: TypeScript
- Framework: Next.js (full-stack) or Astro (content sites)
- DB: Supabase
- CSS: Tailwind
- Auth: Supabase Auth (if needed)

## Step 3 — Research (if needed)
For novel domains: check current docs via Context7 MCP.
Skip if standard stack.

## Step 4 — Architecture decision (1 paragraph, not 10 pages)
State: frontend + backend + DB + auth + deploy.
Justify any non-standard choice.

## Step 5 — Create repository
```bash
mkdir project-name && cd project-name
git init
npx create-next-app@latest . --typescript --tailwind --app --src-dir
# or appropriate scaffold
```

## Step 6 — Create AGENTS.md (SHORT)
Include: build/test/run commands + 3-5 critical rules.

## Step 7 — Create ProjectInfos/
Populate: architecture/overview.md + guides/ + first task in tasks/active/

## Step 8 — First implementation
- DB schema (if needed)
- Auth setup (if needed)
- First feature skeleton
- Verify it runs

## Step 9 — Report
List: what was created, stack, first tasks, how to start.
