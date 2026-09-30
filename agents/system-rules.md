# System-Wide Agent Rules

## Model Selection
- TRIVIAL tasks (grep, format, rename): use cheapest/fastest available
- SMALL tasks (implement CRUD, write test): Tier 1 (Gemini Flash / Mercury 2.5)
- MEDIUM tasks (debug, refactor, DB design): Tier 2 (Gemini Flash / Groq Qwen)  
- COMPLEX/CRITICAL: Tier 3 (Gemini Pro or best available)
- Vision tasks: always route to vision-capable model first

## Context Efficiency
- Read only relevant files — use grep/find before reading
- Do NOT load the entire repository into context
- Use repo-orientation skill for unfamiliar codebases
- Compact session when context is high and task is near completion

## Tool Usage
- Prefer targeted reads over whole-file reads
- Batch tool calls where possible
- Do not call the same tool twice for the same result

## Security (NEVER DO)
- Never print, log, or commit API keys
- Never put secrets in AGENTS.md or ProjectInfos
- Never bypass authentication in code
- Never run destructive DB commands without explicit confirmation

## Documentation
- Do not update docs after every small change
- Only update when architecture/schema/API/security actually changes
- Keep AGENTS.md SHORT (under 50 lines)

## FreeLLMAPI Integration
- Gateway: http://localhost:3001/v1
- Use 'auto' model for general routing
- Use 'auto:fast' for simple tasks
- Use 'auto:smart' for complex reasoning
- Start with: ~/AI_SYSTEM/scripts/freellmapi-start
