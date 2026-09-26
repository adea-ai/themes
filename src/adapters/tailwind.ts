/**
 * The Tailwind adapter.
 *
 * Tailwind v4 reads its design tokens from the stylesheet, not from a JavaScript
 * config, so a theme becomes utilities by writing `@theme inline` declarations that
 * point at the custom properties `adapters/css.ts` produces. `inline` is the
 * important word: it makes Tailwind emit `var(--adea-background)` in the generated
 * utility rather than baking the value in, which is what allows one stylesheet to
 * serve every theme and a theme switch to cost nothing but an attribute change.
 *
 * Emitting this from the theme rather than hand-maintaining a `@theme` block per
 * application is the point of the adapter: a new role in the schema becomes a
 * utility in every consumer, and a consumer cannot silently fall behind.
 */

import { ANSI_KEYS, THEME_COLOR_KEYS } from '../schema.js'
import { STATUS_ROLES } from '../derive.js'

export interface TailwindOptions {
  /** The custom-property namespace the CSS adapter used. Defaults to `adea`. */
  prefix?: string
  /**
   * Extra utility namespaces for roles this schema does not hold but the consumer
   * does, mapped to a custom property. Used to keep an application's existing
   * vocabulary alive without duplicating the values.
   */
  extra?: Readonly<Record<string, string>>
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

/**
 * The `--color-*` namespace, which is what makes `bg-surface` a valid utility.
 *
 * Takes no theme, and that is the point rather than an oversight. Every declaration
 * this emits is a `var()` reference, so the block is identical for all twenty-seven
 * themes and one stylesheet serves every one of them. Accepting a theme would imply
 * the output depended on which theme was passed, and the first person to notice would
 * reasonably conclude they needed one block per theme.
 */
export function toTailwindTheme(options: TailwindOptions = {}): string {
  const prefix = options.prefix ?? 'adea'
  const property = (name: string): string => (prefix ? `--${prefix}-${name}` : `--${name}`)
  const lines: string[] = []

  // `inline` so the utility resolves the variable at use time rather than at build
  // time. Without it, every theme would need its own stylesheet.
  lines.push('@theme inline {')

  for (const role of THEME_COLOR_KEYS) {
    lines.push(`  --color-${kebab(role)}: var(${property(kebab(role))});`)
  }

  lines.push(`  --color-surface-sunken: var(${property('surface-sunken')});`)
  lines.push(`  --color-cursor: var(${property('cursor')});`)
  lines.push(`  --color-selection: var(${property('selection')});`)

  for (const role of STATUS_ROLES) {
    lines.push(`  --color-${role}-subtle: var(${property(`${role}-subtle`)});`)
    lines.push(`  --color-${role}-foreground: var(${property(`${role}-foreground`)});`)
  }

  for (let index = 1; index <= 6; index += 1) {
    lines.push(`  --color-chart-${index}: var(${property(`chart-${index}`)});`)
  }

  for (const key of ANSI_KEYS) {
    lines.push(`  --color-ansi-${kebab(key)}: var(${property(`ansi-${kebab(key)}`)});`)
  }

  for (const [name, value] of Object.entries(options.extra ?? {})) {
    lines.push(`  --color-${name}: ${value};`)
  }

  lines.push('}')
  return lines.join('\n')
}
