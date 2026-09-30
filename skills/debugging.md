# Skill: debugging

## When to use
A bug exists that needs systematic diagnosis. Route to STRONG REASONING model.

## Process
```
REPRODUCE → ISOLATE → COLLECT EVIDENCE → HYPOTHESIZE → TEST → PATCH → VERIFY
```

### 1. REPRODUCE
- Get exact error message, stack trace, reproduction steps
- Confirm you can reproduce it

### 2. ISOLATE
- Which file/function/line is failing?
- What inputs trigger it?
- grep/search for relevant code — do NOT load the whole repo

### 3. COLLECT EVIDENCE (minimal)
- The failing code region only
- The exact error output
- Relevant env/config (no secrets)
- Recent git changes if relevant: `git log --oneline -10`

### 4. HYPOTHESIZE
- List 2-3 candidate causes
- Rank by likelihood

### 5. TEST HYPOTHESIS
- Add targeted logging if needed
- Test the most likely cause first

### 6. PATCH
- Minimal fix
- Do not refactor unrelated code

### 7. VERIFY
- Reproduce original bug → no longer occurs
- Run relevant tests
- Check for regressions in related paths

## Rules
- Never dump entire log files into context
- Never load entire repositories to debug one function
- For difficult bugs: escalate to stronger reasoning model
