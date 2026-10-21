import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const typescriptCli = join(root, 'node_modules/typescript/lib/tsc.js')

/**
 * One concrete member of each wildcard export, so a wildcard that no longer matches a
 * published file is caught rather than skipped.
 */
const WILDCARD_MEMBERS: Record<string, string> = {
  './palettes/*': 'palettes/aardvark-blue.json',
  './themes/*': 'themes/adea-dark',
}

let consumer: string
let firstPack: string
let secondPack: string

// Building and packing the package can take longer than Bun's unit-test default.
beforeAll(
  () => {
    consumer = mkdtempSync(join(tmpdir(), 'adea-themes-consumer-'))
    firstPack = mkdtempSync(join(tmpdir(), 'adea-themes-pack-'))
    secondPack = mkdtempSync(join(tmpdir(), 'adea-themes-repack-'))
    execFileSync('bun', ['run', 'build'], { cwd: root, stdio: 'pipe' })
    const archive = pack(consumer)
    const destination = join(consumer, 'node_modules', '@adea-ai', 'themes')
    mkdirSync(destination, { recursive: true })
    execFileSync('tar', [
      '-xzf',
      join(consumer, archive.filename),
      '--strip-components=1',
      '-C',
      destination,
    ])
    writeFileSync(join(consumer, 'package.json'), JSON.stringify({ type: 'module' }))
  },
  { timeout: 60_000 }
)

afterAll(() => {
  if (consumer) rmSync(consumer, { recursive: true, force: true })
  if (firstPack) rmSync(firstPack, { recursive: true, force: true })
  if (secondPack) rmSync(secondPack, { recursive: true, force: true })
})

/** The fields `npm pack --json` reports for one file in the archive. */
type PackedFile = { mode: number; path: string; size: number }

type PackedArchive = { filename: string; files: PackedFile[] }

/** Packs the package into `destination` and returns the archive name and its file list. */
function pack(destination: string): PackedArchive {
  const [packed] = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--pack-destination', destination], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  ) as PackedArchive[]
  if (!packed) throw new Error('npm pack produced no archive')
  return packed
}

/** The manifest a consumer receives, read out of the packed archive. */
function packedManifest(): {
  exports: Record<string, unknown>
  files: string[]
  name: string
  version: string
} {
  return JSON.parse(
    readFileSync(join(consumer, 'node_modules', '@adea-ai', 'themes', 'package.json'), 'utf8')
  )
}

function run(source: string): string {
  return execFileSync('node', ['--input-type=module', '--eval', source], {
    cwd: consumer,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

/** Runs a source file under Bun, so the Bun consumer is proved on its own runtime. */
function runBun(source: string): string {
  const entry = join(
    consumer,
    `bun-consumer-${createHash('sha256').update(source).digest('hex').slice(0, 16)}.mjs`
  )
  writeFileSync(entry, source)
  try {
    return execFileSync(process.execPath, [entry], {
      cwd: consumer,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } finally {
    rmSync(entry, { force: true })
  }
}

/**
 * Every public subpath the **published** manifest declares, as a consumer specifier.
 * The manifest is read out of the packed archive, so the test follows the contract a
 * consumer actually receives rather than the working tree's copy.
 */
function publicSpecifiers(): string[] {
  const manifest = packedManifest()
  return Object.keys(manifest.exports).map((key) => {
    if (key === '.') return manifest.name
    const wildcard = WILDCARD_MEMBERS[key]
    if (wildcard) return `${manifest.name}/${wildcard}`
    return `${manifest.name}${key.slice(1)}`
  })
}

/** Writes a consumer module that imports one specifier and nothing else. */
function isolatedImport(specifier: string): string {
  const entry = join(
    consumer,
    `isolated-${createHash('sha256').update(specifier).digest('hex').slice(0, 16)}.mjs`
  )
  // A JSON member of the palette export needs the JSON import attribute under Node ESM.
  const attribute = specifier.endsWith('.json') ? " with { type: 'json' }" : ''
  writeFileSync(
    entry,
    `import * as module from ${JSON.stringify(specifier)}${attribute}\nconsole.log(Object.keys(module).length);\n`
  )
  try {
    return execFileSync('node', [entry], {
      cwd: consumer,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } finally {
    rmSync(entry, { force: true })
  }
}

describe('packed package in a native ESM consumer', () => {
  test('a bundled single-theme adapter excludes other palettes and catalogue tooling', async () => {
    const entry = join(consumer, 'single-theme.ts')
    writeFileSync(
      entry,
      `
      import theme from '@adea-ai/themes/themes/adea-dark';
      import { toXtermTheme } from '@adea-ai/themes/adapters/xterm';
      console.log(toXtermTheme(theme));
    `
    )
    const result = await Bun.build({
      entrypoints: [entry],
      target: 'browser',
      minify: true,
      sourcemap: 'external',
    })
    expect(result.success).toBe(true)
    const map = result.outputs.find((output) => output.path.endsWith('.map'))
    expect(map).toBeDefined()
    const { sources } = JSON.parse(await map!.text()) as { sources: string[] }
    expect(sources.filter((source) => source.includes('/generated/themes/'))).toHaveLength(1)
    expect(
      sources.some((source) =>
        /(?:catalogue|normalize|sources|generated\/schemes)\.js$/.test(source)
      )
    ).toBe(false)
    expect(sources.some((source) => /\/generated\/themes\.(?:js|ts)$/.test(source))).toBe(false)
    const bundle = result.outputs.find((output) => !output.path.endsWith('.map'))!
    expect(bundle.size).toBeLessThan(16 * 1024)
  })
  test('a single theme and lightweight picker metadata have independent exports', () => {
    expect(
      run(`
      import theme from '@adea-ai/themes/themes/adea-dark';
      import { themeMetadata } from '@adea-ai/themes/metadata';
      import { toXtermTheme } from '@adea-ai/themes/adapters/xterm';
      if (!toXtermTheme(theme).background) throw new Error('empty theme');
      if (themeMetadata.some(entry => 'colors' in entry || 'ansi' in entry)) {
        throw new Error('metadata includes palette data');
      }
      console.log(theme.id + ':' + themeMetadata.length);
    `)
    ).toBe('adea-dark:34')
  })
  test('root and renderer adapters resolve without a bundler or source alias', () => {
    expect(
      run(`
      import { getTheme, themeCount } from '@adea-ai/themes';
      import { toXtermTheme } from '@adea-ai/themes/adapters/xterm';
      import { toShikiTheme } from '@adea-ai/themes/adapters/shiki';
      import { themeCssVariables } from '@adea-ai/themes/adapters/css';
      const theme = getTheme('adea-dark');
      if (!toXtermTheme(theme).background || !toShikiTheme(theme).colors
          || !themeCssVariables(theme)['--adea-background']) throw new Error('empty adapter');
      console.log(themeCount());
    `)
    ).toBe('34')
  })

  test('the documented shadcn adapter has a public subpath', () => {
    expect(
      run(`
      import { shadcnDestructiveProjection, shadcnVariables } from '@adea-ai/themes/adapters/shadcn';
      import { getTheme, primaryHover, primarySubtleCss } from '@adea-ai/themes';
      const theme = getTheme('adea-dark');
      const projection = shadcnDestructiveProjection(theme);
      const variables = shadcnVariables(theme);
      if (variables['--destructive'] !== projection.fill
          || variables['--destructive-foreground'] !== projection.foreground) {
        throw new Error('destructive projection differs from the shadcn adapter');
      }
      if (variables['--primary-hover'] !== primaryHover(theme.colors.accent, theme.appearance)
          || variables['--primary-subtle'] !== primarySubtleCss(theme)) {
        throw new Error('primary state derivation differs from the shadcn adapter');
      }
      console.log(variables['--primary']);
    `)
    ).toStartWith('oklch(')
  })
})

describe('public package qualification', () => {
  test('every declared public export resolves in the packed package, under Node and Bun', () => {
    const specifiers = publicSpecifiers()
    const source = `
      const specifiers = ${JSON.stringify(specifiers)};
      const resolved = specifiers.map((specifier) => import.meta.resolve(specifier));
      console.log(JSON.stringify(resolved));
    `
    for (const runtime of [run, runBun]) {
      const resolved = JSON.parse(runtime(source)) as string[]
      expect(resolved).toHaveLength(specifiers.length)
      for (const url of resolved) {
        expect(url.startsWith('file://')).toBe(true)
        expect(url).toContain('/node_modules/@adea-ai/themes/')
      }
    }
  })

  test('every declared theme id resolves to its own theme record', () => {
    const result = JSON.parse(
      run(`
      const { themeIds } = await import('@adea-ai/themes/catalogue');
      const { themeMetadata } = await import('@adea-ai/themes/metadata');
      const seen = [];
      for (const id of themeIds()) {
        const module = await import('@adea-ai/themes/themes/' + id);
        if (!module.default || module.default.id !== id) {
          throw new Error('theme id mismatch: ' + id);
        }
        seen.push(id);
      }
      console.log(JSON.stringify({
        count: seen.length,
        unique: new Set(seen).size,
        metadata: themeMetadata.length,
        first: seen[0],
        last: seen[seen.length - 1],
      }));
    `)
    ) as { count: number; unique: number; metadata: number; first: string; last: string }
    expect(result.count).toBe(result.metadata)
    expect(result.unique).toBe(result.count)
    expect(result.count).toBeGreaterThan(0)
    expect(result.first).toBe('adea-dark')
  })

  test('each public entry imports on its own', () => {
    for (const specifier of publicSpecifiers()) {
      if (specifier.endsWith('/package.json')) continue
      expect(isolatedImport(specifier).length).toBeGreaterThan(0)
    }
  })

  test('consumer types resolve from the packed declarations', () => {
    const good = join(consumer, 'types-good')
    mkdirSync(good, { recursive: true })
    writeFileSync(
      join(good, 'consumer.ts'),
      `
      import { getTheme, type AdeaTheme, type ThemeMetadata } from '@adea-ai/themes';
      import { toXtermTheme } from '@adea-ai/themes/adapters/xterm';
      import { themeMetadata } from '@adea-ai/themes/metadata';
      const theme: AdeaTheme | undefined = getTheme('adea-dark');
      const metadata: readonly ThemeMetadata[] = themeMetadata;
      export const probe = { theme, metadata, xterm: theme ? toXtermTheme(theme) : undefined };
      `
    )
    writeFileSync(
      join(good, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'nodenext',
          moduleResolution: 'nodenext',
          target: 'es2022',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: [],
        },
        include: ['consumer.ts'],
      })
    )
    const listed = execFileSync(
      'node',
      [typescriptCli, '--noEmit', '--listFiles', '--project', join(good, 'tsconfig.json')],
      { cwd: good, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    )
    // The types must come from the packed declarations, not from the source tree.
    expect(listed).toContain('/node_modules/@adea-ai/themes/dist/index.d.ts')
    expect(listed).toContain('/node_modules/@adea-ai/themes/dist/adapters/xterm.d.ts')
    expect(listed).toContain('/node_modules/@adea-ai/themes/dist/generated/metadata.d.ts')

    // A negative control: the same consumer with a wrong type must fail, so the pass
    // above proves the checker saw the packed types rather than skipping them.
    const bad = join(consumer, 'types-bad')
    mkdirSync(bad, { recursive: true })
    writeFileSync(
      join(bad, 'consumer.ts'),
      `
      import { getTheme } from '@adea-ai/themes';
      const wrong: number = getTheme('adea-dark');
      export const probe = wrong;
      `
    )
    writeFileSync(
      join(bad, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'nodenext',
          moduleResolution: 'nodenext',
          target: 'es2022',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          types: [],
        },
        include: ['consumer.ts'],
      })
    )
    let failed = false
    try {
      execFileSync('node', [typescriptCli, '--noEmit', '--project', join(bad, 'tsconfig.json')], {
        cwd: bad,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch {
      failed = true
    }
    expect(failed).toBe(true)
  })

  test('every adapter produces its declared output shape', () => {
    const summary = JSON.parse(
      run(`
      import { getTheme } from '@adea-ai/themes';
      import { BASE24_SLOTS, toBase24, formatBase24Scheme } from '@adea-ai/themes/adapters/base24';
      import { toXtermTheme } from '@adea-ai/themes/adapters/xterm';
      import { themeCss, themeCssVariables } from '@adea-ai/themes/adapters/css';
      import { toTailwindTheme } from '@adea-ai/themes/adapters/tailwind';
      import { toShikiTheme } from '@adea-ai/themes/adapters/shiki';
      import { shadcnDestructiveProjection, shadcnRoles, shadcnVariables } from '@adea-ai/themes/adapters/shadcn';
      const theme = getTheme('adea-dark');
      const base24 = toBase24(theme);
      const xterm = toXtermTheme(theme);
      const css = themeCssVariables(theme);
      const shadcn = shadcnVariables(theme);
      const shiki = toShikiTheme(theme);
      if (Object.keys(base24.palette).length !== BASE24_SLOTS.length) {
        throw new Error('base24 palette is not complete');
      }
      if (!formatBase24Scheme(base24).includes(base24.palette.base00)) {
        throw new Error('base24 scheme text does not carry the palette');
      }
      if (!xterm.background || !xterm.foreground || !xterm.cursor) {
        throw new Error('xterm theme is incomplete');
      }
      if (!css['--adea-background'] || !themeCss(theme).includes('--adea-background')) {
        throw new Error('css variables are incomplete');
      }
      if (!toTailwindTheme().includes('@theme')) {
        throw new Error('tailwind theme is not a theme block');
      }
      if (!shiki.colors || shiki.settings.length === 0) {
        throw new Error('shiki registration is incomplete');
      }
      if (!shadcn['--primary'] || Object.keys(shadcnRoles(theme)).length === 0) {
        throw new Error('shadcn variables are incomplete');
      }
      if (!shadcnDestructiveProjection(theme).fill) {
        throw new Error('shadcn destructive projection is incomplete');
      }
      console.log(JSON.stringify({
        base24Slots: BASE24_SLOTS.length,
        xtermKeys: Object.keys(xterm).length,
        cssVariables: Object.keys(css).length,
        shikiSettings: shiki.settings.length,
        shadcnVariables: Object.keys(shadcn).length,
      }));
    `)
    ) as Record<string, number>
    expect(summary.base24Slots).toBe(24)
    expect(summary.xtermKeys).toBe(22)
    expect(summary.cssVariables).toBeGreaterThan(0)
    expect(summary.shikiSettings).toBeGreaterThan(0)
    expect(summary.shadcnVariables).toBeGreaterThan(0)
  })

  test('the packed contents are reproducible', () => {
    // Two independent destinations, so the second pack cannot overwrite the first, and
    // the first archive's bytes are read before the second pack runs.
    const first = pack(firstPack)
    const firstBytes = readFileSync(join(firstPack, first.filename))
    const firstDigest = createHash('sha256').update(firstBytes).digest('hex')
    const second = pack(secondPack)
    const secondBytes = readFileSync(join(secondPack, second.filename))

    expect(second.files).toEqual(first.files)
    expect(createHash('sha256').update(secondBytes).digest('hex')).toBe(firstDigest)
    expect(secondBytes.equals(firstBytes)).toBe(true)

    // A negative control: the same length with one byte changed must not compare equal,
    // so the equality above is about the archive bytes and not about their size.
    const altered = Buffer.from(firstBytes)
    altered[0] = altered[0] === 0x1f ? 0x1e : 0x1f
    expect(altered.length).toBe(firstBytes.length)
    expect(createHash('sha256').update(altered).digest('hex')).not.toBe(firstDigest)
  })

  test('the pack carries no tooling, and the export map exposes no source subpath', () => {
    const packed = pack(firstPack)
    const roots = new Set(packed.files.map((file) => file.path.split('/')[0]))
    // The published manifest's own `files` list, plus the files npm always includes.
    const manifest = packedManifest()
    const expected = new Set([...manifest.files, 'LICENSE', 'NOTICE', 'README.md', 'package.json'])
    expect([...roots].toSorted()).toEqual([...expected].toSorted())
    for (const file of packed.files) {
      expect(file.path).not.toMatch(
        /(^|\/)(?:tests|scripts|\.github|docs)\/|(?:^|\/)(?:tsconfig[^/]*\.json|oxlintrc\.json|oxfmtrc\.json|bun\.lock|renovate\.json|AGENTS\.md|CONTRIBUTING\.md)$/
      )
    }

    // The package ships its sources, so the export map is what keeps them unreachable.
    const leaked = runBun(`
      const specifiers = [
        '@adea-ai/themes/src/index.ts',
        '@adea-ai/themes/scripts/build-catalogue.ts',
        '@adea-ai/themes/tests/package.test.ts',
      ];
      const resolved = [];
      for (const specifier of specifiers) {
        try {
          import.meta.resolve(specifier);
          resolved.push(specifier);
        } catch {}
      }
      console.log(JSON.stringify(resolved));
    `)
    expect(JSON.parse(leaked)).toEqual([])
  })

  test('each public entry stays inside a bounded bundle', async () => {
    const bounds: { entry: string; bytes: number; themeSources: number }[] = [
      { entry: 'themes/adea-dark', bytes: 16 * 1024, themeSources: 1 },
      { entry: 'metadata', bytes: 32 * 1024, themeSources: 0 },
      { entry: 'adapters/xterm', bytes: 16 * 1024, themeSources: 0 },
      { entry: 'catalogue', bytes: 128 * 1024, themeSources: 34 },
      { entry: '', bytes: 256 * 1024, themeSources: 34 },
    ]
    const manifest = packedManifest()
    for (const bound of bounds) {
      const specifier = bound.entry ? `${manifest.name}/${bound.entry}` : manifest.name
      const entry = join(consumer, `bundle-${bound.entry.replaceAll('/', '-') || 'root'}.ts`)
      writeFileSync(
        entry,
        `import * as module from ${JSON.stringify(specifier)}\nexport default module\n`
      )
      const result = await Bun.build({
        entrypoints: [entry],
        target: 'browser',
        minify: true,
        sourcemap: 'external',
      })
      expect(result.success).toBe(true)
      const map = result.outputs.find((output) => output.path.endsWith('.map'))
      const { sources } = JSON.parse(await map!.text()) as { sources: string[] }
      const themeSources = sources.filter((source) => source.includes('/generated/themes/'))
      expect(themeSources).toHaveLength(bound.themeSources)
      const bundle = result.outputs.find((output) => !output.path.endsWith('.map'))!
      expect(bundle.size).toBeLessThan(bound.bytes)
      if (bound.entry === 'themes/adea-dark' || bound.entry === 'adapters/xterm') {
        expect(
          sources.some((source) =>
            /(?:catalogue|normalize|sources|generated\/schemes|generated\/themes)\.js$/.test(source)
          )
        ).toBe(false)
      }
    }
  })
})
