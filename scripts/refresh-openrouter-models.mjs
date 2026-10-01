#!/usr/bin/env node
// Refresh the OpenRouter routes in ~/.dsh/settings.yaml from the live API.
//
// Routes this script maintains:
//   openrouter          pure catalog route (no models:) -> the models frozen in
//                       @earendil-works/pi-ai, with full cost/reasoning/protocol
//                       metadata. This script NEVER touches this route.
//   openrouter-extra    ONLY the live models the installed catalog cannot serve.
//                       Shrinks by itself as pi-ai catches up.
//   openrouter-images   OpenRouter's image-generation catalog
//
// Usage:  node ~/.dsh/refresh-openrouter-models.mjs [--force] [--min-age-hours=N]
// Safe:   validates before writing, writes atomically, never throws past startup.

import { readFileSync, writeFileSync, copyFileSync, existsSync, renameSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

// dsh-start runs this on every boot, so a bad write would break every provider
// route until someone noticed. Parse with dsh's own YAML parser and refuse to
// touch the file if the result is not valid.
const require = createRequire(import.meta.url)
const DSH_MODULES = '/data/data/com.termux/files/usr/lib/node_modules/@deepseek-ai/dsh/node_modules'
const HOME = join(homedir(), '.dsh')
const SETTINGS = join(HOME, 'settings.yaml')
const CREDS = join(HOME, '.credentials.yaml')
const STAMP = join(HOME, '.openrouter-refreshed')
const CATALOG = process.env.PI_AI_CATALOG
  ?? `${DSH_MODULES}/@earendil-works/pi-ai/dist/providers/data/openrouter.json`

let parseYaml
try {
  parseYaml = require(`${DSH_MODULES}/js-yaml`).load
} catch {
  parseYaml = null
}

// A dead network or a rotated key must never stop dsh from booting.
process.on('uncaughtException', e => {
  console.error(`[openrouter] refresh skipped: ${e.message}`)
  process.exit(0)
})

const force = process.argv.includes('--force')
const minAgeHours = Number((process.argv.find(a => a.startsWith('--min-age-hours=')) ?? '').split('=')[1] ?? 12)

if (!force && existsSync(STAMP)) {
  const ageH = (Date.now() - Number(readFileSync(STAMP, 'utf8').trim())) / 3.6e6
  if (Number.isFinite(ageH) && ageH < minAgeHours) {
    console.error(`[openrouter] lists are ${ageH.toFixed(1)}h old (< ${minAgeHours}h), skipping`)
    process.exit(0)
  }
}

const key = (() => {
  const m = readFileSync(CREDS, 'utf8').match(/^\s*OPENROUTER_API_KEY:\s*(\S+)/m)
  if (!m) throw new Error('OPENROUTER_API_KEY not found in .credentials.yaml')
  return m[1]
})()

const HEADERS = { Authorization: `Bearer ${key}`, accept: 'application/json' }

// ---- token limits ---------------------------------------------------------
// OpenRouter docs: top_provider.max_completion_tokens is "Maximum completion
// tokens from the top provider". Input and output share the context window, and
// max_tokens must be < context_length, so that is the only bound worth applying.
// An earlier 131072 clamp understated 15 models -- space-bunny by 4x.
const tokenCeiling = m => {
  const ctx = Number(m.context_length) || 262144
  const raw = Number(m.top_provider?.max_completion_tokens) || 0
  return Math.max(1024, Math.min(raw > 0 ? raw : 32768, ctx - 1))
}

// ---- reasoning ------------------------------------------------------------
// Each model may carry a `reasoning` object:
//   supported_efforts  allowed values, descending. null = all accepted,
//                      omitted = the model does not expose effort selection.
//   mandatory          true => the model REJECTS effort "none", so no off level.
//   supports_max_tokens  Anthropic-style token budget instead of effort levels.
// https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
// Levels map 1:1 onto pi-ai's THINKING_LEVELS, except OpenRouter's "none",
// which is pi-ai's `off` (the wire value it sends for "no reasoning").
const effortLevels = m => {
  const r = m.reasoning
  if (!r || typeof r !== 'object') return []
  const supported = r.supported_efforts
  if (!Array.isArray(supported) || supported.length === 0) return []
  const out = []
  for (const effort of supported) {
    if (effort === 'none') {
      // Only offer the off control when the model accepts "none" at all.
      if (!r.mandatory) out.push(['off', 'none'])
      continue
    }
    // pi-ai accepts only: off minimal low medium high xhigh max
    if (['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) out.push([effort, effort])
  }
  // pi-ai refuses a declaration offering nothing beyond `off`.
  return out.some(([level]) => level !== 'off') ? out : []
}

const inputOf = (m) => {
  const arch = m.architecture ?? {}
  const input = (arch.input_modalities ?? ['text']).filter(x => x === 'text' || x === 'image')
  if (!input.includes('text')) input.unshift('text')
  return input
}

const render = (m, base = '          ') => {
  const f2 = base + '  '
  const f4 = base + '    '
  const lines = [
    `${base}- contextWindow: ${Number(m.context_length) || 262144}`,
    `${f2}id: ${JSON.stringify(m.id)}`,
    `${f2}input:`,
    ...inputOf(m).map(i => `${f4}- ${i}`),
    `${f2}maxTokens: ${tokenCeiling(m)}`,
    `${f2}name: ${JSON.stringify(m.name || m.id)}`,
  ]
  const efforts = effortLevels(m)
  if (efforts.length > 0) {
    // OpenRouter normalizes effort across providers into a nested object, so the
    // openrouter dispatch format is what sends { reasoning: { effort } }.
    lines.push(`${f2}compat:`, `${f4}thinkingFormat: openrouter`)
    lines.push(`${f2}reasoningEfforts:`)
    for (const [level, wire] of efforts) lines.push(`${f4}${level}: ${wire}`)
  }
  return lines.join('\n')
}

async function fetchList(url) {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  const body = await res.json()
  const data = body.data ?? body.models
  if (!Array.isArray(data)) throw new Error(`${url} returned no data[] array`)
  return data
}

const live = await fetchList('https://openrouter.ai/api/v1/models')
const images = await fetchList('https://openrouter.ai/api/v1/images/models')

// Which models the installed catalog already serves with full metadata.
const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'))
const inCatalog = new Set([
  ...Object.keys(catalog['anthropic-messages'] ?? {}),
  ...Object.keys(catalog['openai-completions'] ?? {}),
])
const extra = live.filter(m => !inCatalog.has(m.id))

const stamp = new Date().toISOString().slice(0, 10)
const withEfforts = extra.filter(m => effortLevels(m).length > 0)

const extraBlock = [
  '    # ---------------------------------------------------------------',
  '    # ONLY the live models the installed pi-ai catalog cannot serve.',
  `    # Generated ${stamp}: ${extra.length} of ${live.length} live chat models.`,
  `    # ${withEfforts.length} carry an Effort menu, from each model's own`,
  '    # reasoning.supported_efforts ladder; mandatory-reasoning models get no',
  '    # off level because they reject effort "none".',
  `    # The openrouter route above serves the other ${inCatalog.size} from the`,
  '    # catalog with full reasoning/cost metadata.',
  '    # Refresh: node ~/.dsh/refresh-openrouter-models.mjs',
  '    # ---------------------------------------------------------------',
  '    openrouter-extra:',
  '      api: openai-completions',
  '      apiKeyEnv: OPENROUTER_API_KEY',
  '      baseURL: https://openrouter.ai/api/v1',
  '      displayName: OpenRouter (not in catalog)',
  '      models:',
  ...extra.flatMap(m => render(m).split('\n')),
].join('\n')

const imageBlock = [
  '    # ---------------------------------------------------------------',
  `    # GENERATED ${stamp} from https://openrouter.ai/api/v1/images/models`,
  `    # ${images.length} image-generation models.`,
  '    # Refresh: node ~/.dsh/refresh-openrouter-models.mjs',
  '    # ---------------------------------------------------------------',
  '    openrouter-images:',
  '      api: openai-completions',
  '      apiKeyEnv: OPENROUTER_API_KEY',
  '      baseURL: https://openrouter.ai/api/v1/images',
  '      displayName: OpenRouter (image gen)',
  '      models:',
  ...images.flatMap(m => render(m).split('\n')),
].join('\n')

// Splice between markers so the catalog route is never touched. blockStart()
// walks back over the generated comment banner above each provider key, so a
// re-run replaces the banner instead of stacking a new one.
const lines = readFileSync(SETTINGS, 'utf8').split('\n')
const at = name => lines.indexOf('    ' + name + ':')
const blockStart = idx => {
  let i = idx
  while (i > 0 && lines[i - 1].trimStart().startsWith('#')) i--
  return i
}
const iExtra = blockStart(at('openrouter-extra'))
const iImg = blockStart(at('openrouter-images'))
if (at('openrouter-extra') < 0 || at('openrouter-images') < 0 || !(iExtra < iImg)) {
  throw new Error('could not locate openrouter-extra / openrouter-images markers in settings.yaml')
}
// Everything after the images block up to the next top-level key.
let iEnd = at('openrouter-images') + 1
while (iEnd < lines.length && (lines[iEnd] === '' || lines[iEnd].startsWith(' '))) iEnd++

let head = lines.slice(0, iExtra)
let out = [...head, ...extraBlock.split('\n'), '', ...imageBlock.split('\n'), '', ...lines.slice(iEnd)].join('\n')

// The pinned space-bunny route is gone; if the saved default still names it,
// the composer would block on "Select model". Repoint it at the route that now
// carries that model.
const defaultProvider = /^\s{2}provider:\s*(\S+)\s*$/m.exec(out.slice(0, out.indexOf('llm-pi-ai:')))
if (defaultProvider && defaultProvider[1] === 'space-bunny') {
  out = out.replace(/^(\s{2}provider:\s*)space-bunny\s*$/m, '$1openrouter-extra')
  out = out.replace(
    /^(\s{2}model:\s*stealth\/space-bunny-alpha\s*)$/m,
    '$1',
  )
}

// ---- validate before committing --------------------------------------------
// A malformed file takes down every provider route, not just the ones written
// here. Parse it, check the routes survived, and on any failure leave the
// existing file exactly as it is.
if (process.env.DSH_REFRESH_DUMP) {
  try { writeFileSync(process.env.DSH_REFRESH_DUMP, out) } catch {}
}
if (parseYaml) {
  let doc
  try {
    doc = parseYaml(out)
  } catch (e) {
    throw new Error(`generated settings.yaml does not parse (${e.message.slice(0, 120)}) -- refusing to write`)
  }
  const routes = doc?.['llm-pi-ai']?.providers
  if (!routes || typeof routes !== 'object') throw new Error('generated YAML has no llm-pi-ai.providers -- refusing to write')
  if (JSON.stringify(routes.openrouter) !== JSON.stringify({ apiKeyEnv: 'OPENROUTER_API_KEY' })) {
    throw new Error('catalog route openrouter was not preserved verbatim -- refusing to write')
  }
  for (const [route, expected] of Object.entries({
    'openrouter-extra': extra.length,
    'openrouter-images': images.length,
  })) {
    const got = routes[route]?.models?.length
    if (got !== expected) throw new Error(`route ${route} has ${got} models, expected ${expected} -- refusing to write`)
  }
  // The saved default must still resolve to a route that exists.
  const def = doc['agent-default-model']
  if (def?.provider && def?.model && !routes[def.provider]?.models?.some(m => m.id === def.model)) {
    throw new Error(`saved default ${def.provider}/${def.model} would not resolve -- refusing to write`)
  }
  const dup = new Map()
  for (const m of routes['openrouter-extra'].models) dup.set(m.id, (dup.get(m.id) ?? 0) + 1)
  if ([...dup.values()].some(n => n > 1)) throw new Error('duplicate ids inside openrouter-extra -- refusing to write')
}

const src = readFileSync(SETTINGS, 'utf8')
if (out !== src) {
  copyFileSync(SETTINGS, `${SETTINGS}.bak-${Date.now()}`)
  // Write to a sibling temp file then rename. rename(2) is atomic on the same
  // filesystem, so a dsh request reading settings.yaml mid-refresh either sees
  // the whole old file or the whole new one -- never a truncated one, which
  // would fail YAML parsing and take the LLM adapter down with it.
  const tmp = `${SETTINGS}.tmp-${process.pid}`
  try {
    writeFileSync(tmp, out)
    renameSync(tmp, SETTINGS)
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp)
  }
  console.error(`[openrouter] refreshed: ${extra.length} extra (${withEfforts.length} with Effort) + ${images.length} image (catalog serves ${inCatalog.size})`)
} else {
  console.error(`[openrouter] unchanged: ${extra.length} extra (${withEfforts.length} with Effort) + ${images.length} image`)
}
writeFileSync(STAMP, String(Date.now()))

// Bound the backup history. At the 12h cadence two backups a day is ~5 days of
// rollback depth. settings.yaml.bak-ORIGINAL-4-models has a non-numeric suffix
// and is deliberately outside this pattern, so rotation never touches it.
const backups = readdirSync(HOME)
  .filter(f => /^settings\.yaml\.bak-\d{10,}$/.test(f))
  .map(f => ({ f, m: statSync(join(HOME, f)).mtimeMs }))
  .sort((a, b) => b.m - a.m)
for (const old of backups.slice(10)) unlinkSync(join(HOME, old.f))