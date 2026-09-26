/**
 * Vendors the Base24 schemes this catalogue normalizes from.
 *
 * The palette data in this package is deliberately *not* authored here. Every
 * theme that is not Adea's own is somebody else's palette, reproduced from a named
 * revision of a named artefact so that any value in the catalogue can be traced
 * back to the commit it came from and re-derived. That is what makes this file a
 * maintenance script rather than a source of truth: running it re-fetches, and the
 * resulting diff is the reviewable record of what changed upstream.
 *
 * This is a **maintenance** command, not part of the build. The published package
 * never fetches anything, at build time or at run time — `bun run vendor` is run
 * by a maintainer when a palette should be refreshed, and its output is committed.
 *
 * Usage:
 *
 *   bun run vendor              # refresh every scheme from the pinned revision
 *   bun run vendor --dry-run    # report what would change, write nothing
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseBase24Scheme } from '../src/adapters/base24'
import { BASE24_SLOTS } from '../src/adapters/base24'
import { formatOklch, hexToOklch, shiftLightness } from '../src/oklch'
import {
  CATALOGUE_REPOSITORY,
  CATALOGUE_REVISION,
  COMPOSED_SOURCES,
  VENDORED_SOURCES,
} from '../src/sources'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PALETTE_DIR = join(ROOT, 'palettes')

type VendoredFile = {
  system: 'base24'
  name: string
  author: string
  variant: 'dark' | 'light'
  palette: Record<string, string>
  source: {
    slug: string
    repository: string
    revision: string
    path: string
  }
}

/** A palette as a donor publishes it, before it is collapsed into Base24 slots. */
type PublishedPalette = {
  name: string
  slug: string
  isDark: boolean
  colors: Record<string, { hex: string }>
}

type ComposedFile = {
  system: 'base24'
  name: string
  author: string
  variant: 'dark' | 'light'
  palette: Record<string, string>
  /**
   * ANSI roles pinned to the structure donor, carried in the vendored file so the
   * composition's decisions travel with the data rather than being restated as hex in
   * `src/sources.ts`.
   */
  ansi: Record<string, string>
  cursor: string
  selection: string
  source: {
    composedFrom: { role: 'structure' | 'hues'; slug: string; name: string }[]
    repository: string
    revision: string
  }
}

const dryRun = process.argv.includes('--dry-run')

function rawUrl(path: string): string {
  return `${CATALOGUE_REPOSITORY.replace('github.com', 'raw.githubusercontent.com')}/${CATALOGUE_REVISION}/${path}`
}

async function fetchText(path: string): Promise<string> {
  const url = rawUrl(path)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return response.text()
}

async function fetchScheme(slug: string): Promise<string> {
  return fetchText(`data/schemes/base24/${slug}.yaml`)
}

/** Reads a file, treating "not there yet" as an empty result rather than an error. */
async function readIfPresent(target: string): Promise<string | undefined> {
  try {
    return await readFile(target, 'utf8')
  } catch {
    return undefined
  }
}

/** Reads a donor palette from the dataset's `by-name` files. */
async function fetchPalette(slug: string): Promise<PublishedPalette> {
  const parsed = JSON.parse(await fetchText(`data/by-name/${slug}.json`)) as PublishedPalette
  if (!parsed.colors) throw new Error(`${slug} is not a published palette`)
  return parsed
}

/**
 * Composes one theme's Base24 palette from two donors.
 *
 * Every value is read out of a donor by the slot map in `src/sources.ts`, so the
 * output is upstream's bytes rather than a transcription. The two slots Base24
 * defines and neither donor's ANSI set contains are synthesised by a hue rotation,
 * matching what `toBase24` does on export, and the two rungs below the canvas are
 * darkened slices of the structure donor's background.
 */
function compose(
  source: (typeof COMPOSED_SOURCES)[number],
  donors: Record<string, PublishedPalette>
) {
  const palette: Record<string, string> = {}

  for (const [slot, [donor, key]] of Object.entries(source.slots)) {
    const value = donors[donor]?.colors[key]?.hex
    if (!value) throw new Error(`${source.id}: ${donor} has no ${key} for ${slot}`)
    palette[slot] = value.toLowerCase()
  }

  for (const [slot, [donor, key, derivation]] of Object.entries(source.synthesise)) {
    const value = donors[donor]?.colors[key]?.hex
    if (!value) throw new Error(`${source.id}: ${donor} has no ${key} for ${slot}`)
    const color = hexToOklch(value)
    if (!color) throw new Error(`${source.id}: ${value} did not parse`)
    palette[slot] = formatOklch(
      derivation.rotate !== undefined
        ? { ...color, h: (color.h + derivation.rotate + 360) % 360 }
        : shiftLightness(color, derivation.lighten ?? 0)
    )
  }

  // Between them the two maps must cover every slot Base24 defines. Asserted here
  // rather than left to the type system because a partial record cannot express
  // "these two together are total", and a silently absent slot would reach the
  // normalizer as an unparseable scheme three steps later.
  const missing = BASE24_SLOTS.filter((slot) => !(slot in palette))
  if (missing.length > 0) {
    throw new Error(`${source.id}: the composition leaves ${missing.join(', ')} unassigned`)
  }

  const ansi: Record<string, string> = {}
  for (const role of source.ansiFromStructure) {
    const value = donors['structure']?.colors[role]?.hex
    if (!value) throw new Error(`${source.id}: structure donor has no ${role}`)
    ansi[role] = value.toLowerCase()
  }

  return { palette, ansi }
}

function serialiseComposed(
  source: (typeof COMPOSED_SOURCES)[number],
  donors: Record<string, PublishedPalette>,
  composed: ReturnType<typeof compose>
): string {
  const payload: ComposedFile = {
    system: 'base24',
    name: source.name,
    author: `Adea, composed from ${donors['structure']?.name} and ${donors['hues']?.name}`,
    variant: source.appearance,
    palette: composed.palette,
    ansi: composed.ansi,
    cursor: (donors['structure']?.colors['cursor']?.hex ?? '').toLowerCase(),
    selection: (donors['structure']?.colors['selection']?.hex ?? '').toLowerCase(),
    source: {
      composedFrom: (['structure', 'hues'] as const).map((role) => ({
        role,
        slug: source.donors[role],
        name: donors[role]?.name ?? '',
      })),
      repository: CATALOGUE_REPOSITORY,
      revision: CATALOGUE_REVISION,
    },
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

function serialise(
  theme: (typeof VENDORED_SOURCES)[number],
  scheme: ReturnType<typeof parseBase24Scheme>
): string {
  const payload: VendoredFile = {
    system: 'base24',
    name: scheme.name,
    author: scheme.author,
    variant: scheme.variant,
    palette: scheme.palette,
    source: {
      slug: theme.slug,
      repository: CATALOGUE_REPOSITORY,
      revision: CATALOGUE_REVISION,
      path: `data/schemes/base24/${theme.slug}.yaml`,
    },
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

async function main(): Promise<void> {
  await mkdir(PALETTE_DIR, { recursive: true })

  const changed: string[] = []
  const unchanged: string[] = []
  const record = async (id: string, target: string, body: string): Promise<void> => {
    if ((await readIfPresent(target)) === body) {
      unchanged.push(id)
      return
    }
    changed.push(id)
    if (!dryRun) await writeFile(target, body, 'utf8')
  }

  for (const theme of VENDORED_SOURCES) {
    await record(
      theme.id,
      join(PALETTE_DIR, `${theme.id}.json`),
      serialise(theme, parseBase24Scheme(await fetchScheme(theme.slug)))
    )
  }

  // Composed themes fetch two donor palettes rather than one scheme. The donors are
  // cached per run so a composition and any plain theme sharing a donor cost one
  // request between them.
  const donorCache = new Map<string, PublishedPalette>()
  for (const theme of COMPOSED_SOURCES) {
    const donors: Record<string, PublishedPalette> = {}
    for (const role of ['structure', 'hues'] as const) {
      const slug = theme.donors[role]
      let palette = donorCache.get(slug)
      if (!palette) {
        palette = await fetchPalette(slug)
        donorCache.set(slug, palette)
      }
      donors[role] = palette
    }
    await record(
      theme.id,
      join(PALETTE_DIR, `${theme.id}.json`),
      serialiseComposed(theme, donors, compose(theme, donors))
    )
  }

  const verb = dryRun ? 'would change' : 'changed'
  console.log(`${changed.length} ${verb}, ${unchanged.length} already current`)
  if (changed.length > 0) console.log(`  ${changed.join('\n  ')}`)
}

await main()
