# Skill: security-review

## When to use
Before any deployment, after auth changes, when handling sensitive data.
Route to STRONG REASONING model.

## Checklist

### Secrets
- [ ] No API keys in code or git history
- [ ] No secrets in AGENTS.md, ProjectInfos, prompts
- [ ] .env not committed; .gitignore covers it
- [ ] Credentials via env vars only

### Authentication
- [ ] Proper session management
- [ ] Token expiry configured
- [ ] Password hashing (bcrypt/argon2)
- [ ] No auth bypass possible

### Authorization / RLS
- [ ] All DB tables have RLS policies (Supabase)
- [ ] User can only access their own data
- [ ] Admin routes protected
- [ ] API endpoints check auth

### Input Validation
- [ ] All user inputs validated/sanitized
- [ ] SQL injection impossible (parameterized queries)
- [ ] XSS protection (CSP headers, escape output)
- [ ] File upload restrictions if applicable

### Dependencies
- [ ] Run `npm audit` / `pip audit`
- [ ] No known high-severity vulnerabilities
- [ ] Dependencies are necessary (no bloat)

### API Security
- [ ] Rate limiting on auth endpoints
- [ ] CORS configured correctly
- [ ] HTTPS enforced

## Output
Structured report: PASS / FAIL / WARN for each category.
Flag all FAILs and WARNs with specific file + line.
