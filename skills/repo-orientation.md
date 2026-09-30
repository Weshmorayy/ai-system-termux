# Skill: repo-orientation

## When to use
Before making changes to an unfamiliar codebase. Use a CHEAP/FAST model.

## Process
1. `ls -la` — top-level structure
2. Read `package.json` / `pyproject.toml` / `go.mod` — stack + commands
3. Read `AGENTS.md` if exists
4. `find src app lib -maxdepth 2 -type f | head -40` — code structure
5. Check entry points: `src/index.*`, `app/page.*`, `main.*`
6. Read `ProjectInfos/architecture/overview.md` if exists
7. Check env vars: `.env.example`

## Output (compact)
```
STACK: Next.js 15 / TypeScript / Tailwind / Supabase
BUILD: npm run build
TEST: npm test
ENTRY: app/page.tsx, app/api/
DB: Supabase postgres + RLS
AUTH: Supabase Auth
DEPLOY: Vercel
KEY FILES: [list]
KNOWN ISSUES: [from ProjectInfos]
```

## Rules
- Do NOT read entire source files unless specifically relevant
- Do NOT read node_modules
- Prefer grep/find over reading whole files
