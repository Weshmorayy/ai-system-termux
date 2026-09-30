# AGENTS.md — [Project Name]

## Build & Run
```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm test
```

## Architecture
- Stack: [e.g. Next.js 15 / TypeScript / Tailwind / Supabase]
- DB: [e.g. Supabase Postgres — schema in ProjectInfos/domain/database.md]
- Auth: [e.g. Supabase Auth]
- Deploy: [e.g. Vercel]

## Critical Rules
1. [e.g. All DB queries must use Supabase RLS — never bypass]
2. [e.g. Never commit .env — use .env.example]
3. [Add 2-3 project-specific rules only]

## Where to find project knowledge
- Architecture: ProjectInfos/architecture/
- Database: ProjectInfos/domain/database.md
- Decisions: ProjectInfos/decisions/
- Active tasks: ProjectInfos/tasks/active/
- Code guide: ProjectInfos/guides/code.md

## Prohibited actions
- Never drop production DB tables without explicit confirmation
- Never expose API keys in code or docs
