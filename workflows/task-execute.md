# Workflow: task-execute

## Standard task lifecycle
```
UNDERSTAND → INSPECT → PLAN → IMPLEMENT → TEST → VERIFY → REPORT
```

### UNDERSTAND
- What exactly needs to change?
- What are acceptance criteria?
- Classify complexity: TRIVIAL / SMALL / MEDIUM / COMPLEX / CRITICAL

### INSPECT (targeted — not whole repo)
- Run skill: repo-orientation if unfamiliar
- grep/find for relevant files only
- Read only affected code regions

### PLAN
- For SMALL: just do it
- For MEDIUM/COMPLEX: write 3-5 step plan first
- For CRITICAL: get explicit confirmation before changes

### IMPLEMENT
- Make minimal changes to accomplish the goal
- Do not refactor unrelated code
- Do not change dependencies unnecessarily

### TEST
- Run the smallest relevant test set first
- For MEDIUM+: run full test suite
- For UI changes: check visual output

### VERIFY
- Original requirement satisfied?
- No regressions introduced?
- git diff clean?

### REPORT
- What changed (file list)
- What was tested
- Any known limitations

## Model selection by complexity
- TRIVIAL: Tier 0 (Gemini Flash Lite / Cerebras)
- SMALL: Tier 1 (Mercury 2.5 / Gemini Flash)
- MEDIUM: Tier 1-2 (Gemini Flash / Groq Qwen)
- COMPLEX: Tier 2-3 (strongest available)
- CRITICAL: Tier 3 + independent review
