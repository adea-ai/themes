/**
 * Builds the committed catalogue from the palettes and the source list.
 *
 * The output is checked in, and `--check` regenerates it in memory and fails if
 * the committed file differs. That is the same contract the design system's
 * registry uses, and it exists for one reason: a generated file that is only
 * generated at publish time is a file nobody reviews, and a palette change that
 * nobody reviews is exactly the change that quietly breaks a contrast floor.
 *
 * Both the themes and the original Base24 schemes are emitted. The schemes are
 * emitted so that `getBase24Scheme(id)` can return the upstream artefact
 * untouched — `toBase24()` has to re-derive Base24's orange and brown slots,
 * because Adea's schema has no role for them, so it cannot be a byte-exact
 * round trip. Shipping the originals alongside makes the export path exact when
 * the caller wants it to be and honest when it cannot be.
 *
 * Usage:
 *
 *   bun run catalogue:build    # write src/generated
 *   bun run catalogue:check    # fail if the committed output is stale
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BASE24_SLOTS, parseBase24Scheme } from '../src/adapters/base24'
import type { Base24Scheme } from '../src/adapters/base24'
import { normalizeTheme } from '../src/normalize'
import type { NormalizationFinding, ThemeSourceSpec } from '../src/normalize'
import {
  AUTHORED_SOURCES,
  COMPOSED_SOURCES,
  FAMILY_PROVENANCE,
  VENDORED_SOURCES,
} from '../src/sources'
import type { AdeaThemeRecord } from '../src/schema'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GENERATED_DIR = join(ROOT, 'src', 'generated')
const PALETTE_DIR = join(ROOT, 'palettes')

const check = process.argv.includes('--check')

/**
 * Reads a composed theme's vendored file.
 *
 * A composition carries three things a plain scheme does not: the ANSI roles pinned to
 * its structure donor, the donor's cursor and selection, and the names of both
 * donors. They travel in the file rather than being restated as hex in
 * `src/sources.ts`, so the composition's decisions live with the data they describe.
 */
async function readComposed(id: string) {
  const source = await readFile(join(PALETTE_DIR, `${id}.json`), 'utf8')
  const parsed = JSON.parse(source) as {
    palette: Record<string, string>
    ansi: Record<string, string>
    cursor: string
    selection: string
  }
  return parsed
}

/** Reads a vendored scheme, matching the id to its file. */
async function readScheme(id: string): Promise<Base24Scheme> {
  const source = await readFile(join(PALETTE_DIR, `${id}.json`), 'utf8')
  const parsed = JSON.parse(source) as {
    palette: Record<string, string>
    variant: string
    name: string
    author: string
  }
  return parseBase24Scheme(
    [
      'system: "base24"',
      `name: ${JSON.stringify(parsed.name)}`,
      `author: ${JSON.stringify(parsed.author)}`,
      `variant: ${JSON.stringify(parsed.variant)}`,
      'palette:',
      ...BASE24_SLOTS.map((slot) => `  ${slot}: ${JSON.stringify(parsed.palette[slot])}`),
    ].join('\n')
  )
}

/**
 * Assembles the inputs for every theme.
 *
 * Adea's own theme is fed through the same pipeline as the imported ones by
 * synthesising a Base24 scheme from its authored ramp. That is not ceremony: it
 * means the default theme is measured by the same contrast suite, exported by the
 * same adapter, and cannot drift into a special case that only works because
 * nothing checks it.
 */
async function buildSources(): Promise<ThemeSourceSpec[]> {
  const sources: ThemeSourceSpec[] = []

  for (const theme of VENDORED_SOURCES) {
    sources.push({
      id: theme.id,
      name: theme.name,
      family: theme.family,
      familyLabel: theme.familyLabel,
      label: theme.label,
      description: theme.description,
      appearance: theme.appearance,
      tags: theme.tags,
      scheme: await readScheme(theme.id),
      ...(theme.palette ? { palette: theme.palette } : {}),
      ...(theme.accentSlot ? { accentSlot: theme.accentSlot } : {}),
    })
  }

  for (const theme of COMPOSED_SOURCES) {
    const composed = await readComposed(theme.id)
    sources.push({
      id: theme.id,
      name: theme.name,
      family: theme.family,
      familyLabel: theme.familyLabel,
      label: theme.label,
      description: theme.description,
      appearance: theme.appearance,
      tags: theme.tags,
      scheme: await readScheme(theme.id),
      // The greyscale, cursor and selection the structure donor published, kept
      // verbatim rather than re-derived. See `ansiFromStructure`.
      ansi: composed.ansi as never,
      cursor: composed.cursor,
      selection: composed.selection,
      ...(theme.palette ? { palette: theme.palette } : {}),
      ...(theme.accentSlot ? { accentSlot: theme.accentSlot } : {}),
      ...(theme.hueTranspose ? { hueTranspose: theme.hueTranspose } : {}),
      ...(theme.textFloor === undefined ? {} : { textFloor: theme.textFloor }),
      provenance: theme.provenance,
    })
  }

  for (const theme of AUTHORED_SOURCES) {
    const { ramp, ansi } = theme
    sources.push({
      id: theme.id,
      name: theme.name,
      family: theme.family,
      familyLabel: theme.familyLabel,
      label: theme.label,
      description: theme.description,
      appearance: theme.appearance,
      tags: theme.tags,
      scheme: {
        system: 'base24',
        name: theme.name,
        author: 'Adea',
        variant: theme.appearance,
        palette: {
          base00: ramp.background,
          base01: ramp.textSubtle,
          base02: theme.selection,
          base03: ramp.textSubtle,
          base04: ramp.textMuted,
          base05: ramp.foreground,
          base06: ramp.foreground,
          base07: ramp.foreground,
          base08: ansi.red,
          base09: ansi.yellow,
          base0A: ansi.yellow,
          base0B: ansi.green,
          base0C: ansi.cyan,
          base0D: ansi.blue,
          base0E: ansi.magenta,
          base0F: ansi.brightYellow,
          base10: ramp.borderMuted,
          base11: ramp.border,
          base12: ansi.brightRed,
          base13: ansi.brightYellow,
          base14: ansi.brightGreen,
          base15: ansi.brightCyan,
          base16: ansi.brightBlue,
          base17: ansi.brightMagenta,
        },
      },
      // The authored ramp is the design system's own decision — a neutral ladder
      // whose rungs were chosen, not stepped. It is applied verbatim so the shared
      // catalogue reproduces the product's existing appearance exactly.
      colors: {
        background: ramp.background,
        foreground: ramp.foreground,
        surface: ramp.surface,
        surfaceElevated: ramp.surfaceElevated,
        surfaceHover: ramp.surfaceHover,
        surfaceActive: ramp.surfaceActive,
        border: ramp.border,
        borderMuted: ramp.borderMuted,
        text: ramp.foreground,
        textMuted: ramp.textMuted,
        textSubtle: ramp.textSubtle,
        accent: theme.accent,
        accentForeground: theme.accentForeground,
        success: theme.status.success,
        warning: theme.status.warning,
        error: theme.status.error,
        info: theme.status.info,
      },
      ansi,
      cursor: theme.cursor,
      selection: theme.selection,
    })
  }

  return sources
}

type Generated = {
  records: AdeaThemeRecord[]
  schemes: Record<string, Base24Scheme>
  findings: NormalizationFinding[]
}

async function generate(): Promise<Generated> {
  const records: AdeaThemeRecord[] = []
  const schemes: Record<string, Base24Scheme> = {}
  const findings: NormalizationFinding[] = []

  for (const source of await buildSources()) {
    const normalized = normalizeTheme(source)
    findings.push(...normalized.findings)
    records.push({
      ...normalized.record,
      provenance: source.provenance ??
        FAMILY_PROVENANCE[source.family] ?? {
          project: source.familyLabel,
          url: '',
          license: 'MIT',
        },
    })
    schemes[source.id] = source.scheme
  }

  records.sort((a, b) => a.id.localeCompare(b.id))
  return { records, schemes, findings }
}

const BANNER = `/**
 * Generated by \`bun run catalogue:build\`. Do not edit.
 *
 * The catalogue is committed so that a palette change is a reviewable diff, and
 * \`bun run catalogue:check\` fails the build when this file and its inputs
 * disagree.
 */
`

function renderThemes(records: AdeaThemeRecord[]): string {
  const body = records
    .map((record) => `  ${JSON.stringify(record, null, 2).replace(/\n/g, '\n  ')},`)
    .join('\n')
  return `${BANNER}
import type { AdeaThemeRecord } from '../schema'

/** Every theme in the catalogue, ordered by id. */
export const generatedThemes: readonly AdeaThemeRecord[] = Object.freeze([
${body}
])
`
}

function renderSchemes(schemes: Record<string, Base24Scheme>): string {
  const entries = Object.entries(schemes)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([id, scheme]) => `  ${JSON.stringify(id)}: ${JSON.stringify(scheme, null, 2).replace(/\n/g, '\n  ')},`)
    .join('\n')
  return `${BANNER}
import type { Base24Scheme } from '../adapters/base24'

/**
 * The Base24 schemes as they were vendored, keyed by theme id.
 *
 * Untouched, so a consumer that needs the original bytes — an interop export, a
 * licence audit — gets them rather than a re-derivation.
 */
export const generatedSchemes: Readonly<Record<string, Base24Scheme>> = Object.freeze({
${entries}
})
`
}

async function writeOrCheck(path: string, contents: string): Promise<boolean> {
  if (check) {
    let existing: string | undefined
    try {
      existing = await readFile(path, 'utf8')
    } catch {
      existing = undefined
    }
    if (existing !== contents) {
      console.error(`stale: ${path}`)
      return false
    }
    return true
  }
  await writeFile(path, contents, 'utf8')
  return true
}

const { records, schemes, findings } = await generate()

const repaired = findings.filter((finding) => finding.kind === 'repaired')
const substituted = findings.filter((finding) => finding.kind === 'substituted')
const exceeded = findings.filter((finding) => finding.kind === 'budget-exceeded')

console.log(`catalogue: ${records.length} themes, ${findings.length} findings`)
for (const group of [substituted, repaired]) {
  for (const finding of group) {
    console.log(`  ${finding.kind.padEnd(12)} ${finding.themeId}.${finding.role}: ${finding.message}`)
  }
}
for (const finding of exceeded) {
  console.error(`  ${finding.kind.padEnd(12)} ${finding.themeId}.${finding.role}: ${finding.message}`)
}

const themesOk = await writeOrCheck(join(GENERATED_DIR, 'themes.ts'), renderThemes(records))
const schemesOk = await writeOrCheck(join(GENERATED_DIR, 'schemes.ts'), renderSchemes(schemes))

if (check && (!themesOk || !schemesOk)) {
  console.error('The committed catalogue is stale. Run: bun run catalogue:build')
  process.exit(1)
}

if (exceeded.length > 0) {
  console.error(`${exceeded.length} themes cannot meet a contrast floor within budget.`)
  process.exit(1)
}
