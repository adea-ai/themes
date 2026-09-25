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
import { CATALOGUE_REPOSITORY, CATALOGUE_REVISION, VENDORED_SOURCES } from '../src/sources'

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

const dryRun = process.argv.includes('--dry-run')

async function fetchScheme(slug: string): Promise<string> {
  const path = `data/schemes/base24/${slug}.yaml`
  const url = `${CATALOGUE_REPOSITORY.replace('github.com', 'raw.githubusercontent.com')}/${CATALOGUE_REVISION}/${path}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return response.text()
}

function serialise(theme: (typeof VENDORED_SOURCES)[number], scheme: ReturnType<typeof parseBase24Scheme>): string {
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

  for (const theme of VENDORED_SOURCES) {
    const target = join(PALETTE_DIR, `${theme.id}.json`)
    const body = serialise(theme, parseBase24Scheme(await fetchScheme(theme.slug)))

    let existing: string | undefined
    try {
      existing = await readFile(target, 'utf8')
    } catch {
      existing = undefined
    }

    if (existing === body) {
      unchanged.push(theme.id)
      continue
    }

    changed.push(theme.id)
    if (!dryRun) await writeFile(target, body, 'utf8')
  }

  const verb = dryRun ? 'would change' : 'changed'
  console.log(`${changed.length} ${verb}, ${unchanged.length} already current`)
  if (changed.length > 0) console.log(`  ${changed.join('\n  ')}`)
}

await main()
