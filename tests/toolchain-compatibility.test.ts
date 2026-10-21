import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const mise = readFileSync(join(root, '.mise.toml'), 'utf8')

describe('the declared toolchain', () => {
  test('the package manager matches the repository toolchain pin', () => {
    const pinned = /bun\s*=\s*"([^"]+)"/.exec(mise)?.[1]
    expect(pinned).toBeDefined()
    expect(String(pkg.packageManager).replace(/^bun@/, '')).toBe(pinned)
  })

  test('the declared node engine is one concrete version', () => {
    // The engine floor is what a consumer resolves against, so it must name
    // an exact version rather than a range.
    expect(String(pkg.engines?.node)).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
