import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
let consumer: string

beforeAll(() => {
  consumer = mkdtempSync(join(tmpdir(), 'adea-themes-consumer-'))
  execFileSync('bun', ['run', 'build'], { cwd: root, stdio: 'pipe' })
  const [archive] = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--pack-destination', consumer], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  )
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
})

afterAll(() => {
  if (consumer) rmSync(consumer, { recursive: true, force: true })
})

function run(source: string): string {
  return execFileSync('node', ['--input-type=module', '--eval', source], {
    cwd: consumer,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
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
    ).toBe('adea-dark:27')
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
    ).toBe('27')
  })

  test('the documented shadcn adapter has a public subpath', () => {
    expect(
      run(`
      import { shadcnVariables } from '@adea-ai/themes/adapters/shadcn';
      import { getTheme } from '@adea-ai/themes';
      console.log(shadcnVariables(getTheme('adea-dark'))['--primary']);
    `)
    ).toStartWith('oklch(')
  })
})
