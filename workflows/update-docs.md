# Workflow: update-docs

## When to run
Only when explicitly asked, or when one of these actually changed:
- Architecture / tech stack
- Database schema or migrations
- API contracts
- Important design decisions (new ADR)
- Recurring issue discovered and solved
- Security rules changed

Do NOT run after every turn. Documentation churn wastes tokens.

## Process
1. `git diff HEAD~5..HEAD --stat` — what changed in the last few commits?
2. Identify which ProjectInfos files are affected:
   - Architecture changed → `ProjectInfos/architecture/overview.md`
   - DB changed → `ProjectInfos/domain/database.md`
   - New important decision → `ProjectInfos/decisions/ADR-NNN-*.md`
   - Issue solved → append to `ProjectInfos/issues/resolved/`
   - Task complete → move from `tasks/active/` to `tasks/completed/`
3. Read ONLY the affected files
4. Make targeted updates — do not rewrite unrelated sections
5. Append completed tasks/issues (append-only history, never delete)
6. Update AGENTS.md ONLY if critical rules changed

## Rules
- Never touch `[10]_PERSONAL_NOTES.md` or equivalent private files
- Prefer appending to historical records, not rewriting
- If unsure whether to update → don't
