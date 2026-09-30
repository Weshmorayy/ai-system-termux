# Memory Architecture

## Four memory types

### Working Memory (session/context)
- Current conversation
- Active task plan
- Tool results
- Open files

### Project Memory (stable facts — ProjectInfos/)
- Architecture overview
- Database schema
- Security constraints
- Design system
- Deployment config

### Decision Memory (why choices were made)
- ADR-NNN-*.md files in ProjectInfos/decisions/
- Format: context + options considered + decision + consequences

### Task Memory (current work state)
- ProjectInfos/tasks/active/ — what's in progress
- ProjectInfos/tasks/completed/ — history
- ProjectInfos/tasks/blocked/ — blocked with reason

## Retrieval order (most important first)
1. Current task
2. Current source files (targeted reads)
3. AGENTS.md
4. Relevant ProjectInfos section
5. Decision records (ADRs)
6. Session summary if compacted
7. External search only if needed

Current source code always outranks old documentation or session memory.

## Rules
- One source of truth per fact
- Never duplicate the same fact in 5 files
- Compaction summaries are navigation aids, not authoritative state
- Important details must be in files/git/tests — not only in session
