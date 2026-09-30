# Skill: code-review

## When to use
Before marking a task complete, or when explicitly requested.
Review the DIFF not the whole codebase.

## Process
1. `git diff main HEAD` or `git diff HEAD~1` — get changed files only
2. For each changed file:
   - Does it match the task requirements?
   - Any obvious bugs or edge cases?
   - Type safety correct?
   - No unnecessary changes?
   - Tests updated?
3. Architecture check: did this change break any conventions in AGENTS.md?
4. Security: any new secrets, SQL, user input, auth bypass?

## Output
```
CHANGED FILES: [list]
ISSUES:
  - [file:line] description
WARNINGS:
  - [file:line] description
APPROVED: yes/no
NOTES: ...
```

## Rules
- Do NOT reload the entire repository
- Focus on what changed
- Small, correct changes are better than large refactors
