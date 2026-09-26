/**
 * The shadcn bridge.
 *
 * This organisation's components are written against shadcn's vocabulary —
 * `--background`, `--card`, `--muted-foreground`, `--primary`, `--ring` — and that
 * vocabulary is not the canonical schema. Rather than rename every component, the
 * two are bridged here, in one place, from one theme object.
 *
 * The mapping is not a rename and the two places it is not are worth reading:
 *
 * - **Adea's `accent` becomes shadcn's `primary`.** In shadcn, `--primary` is the
 *   main action colour and `--accent` is a *subtle hover background*. Adea's
 *   `accent` is the interactive colour — what a primary button is filled with,
 *   what a focus ring is drawn in — so it is shadcn's `primary`. Mapping it to
 *   `--accent` instead would turn every primary button into a hover wash. The
 *   shadcn `accent` slot is filled from `surfaceHover`, which is what it is
 *   actually used for.
 * - **Adea's `surface` ladder becomes `card` and `popover`.** shadcn has two
 *   surfaces rather than four, so `surface` maps to `card` and `surfaceElevated`
 *   to `popover`, and the remaining two rungs keep their own names.
 *
 * A table of the whole mapping is in `docs/shadcn-bridge.md`.
 */

import type { AdeaTheme, AdeaThemeColors } from '../schema.js'
import { STATUS_ROLES, statusForeground } from '../derive.js'

/**
 * Canonical role → shadcn custom-property name.
 *
 * Every entry is a deliberate correspondence, and the ones that are not a plain
 * rename carry the reason here rather than in the output.
 */
export const SHADCN_MAPPING: Readonly<Record<keyof AdeaThemeColors, string>> = Object.freeze({
  background: 'background',
  foreground: 'foreground',
  // The first two rungs are the two surfaces shadcn names.
  surface: 'card',
  surfaceElevated: 'popover',
  surfaceHover: 'surface-hover',
  surfaceActive: 'surface-active',
  border: 'border',
  borderMuted: 'border-muted',
  // `text` is `foreground` in shadcn; `--foreground` is what body text reads.
  text: 'foreground',
  textMuted: 'muted-foreground',
  textSubtle: 'subtle-foreground',
  // See the header: the interactive colour is shadcn's `primary`.
  accent: 'primary',
  accentForeground: 'primary-foreground',
  success: 'success',
  warning: 'warning',
  // shadcn's destructive slot is in the same position as Adea's error.
  error: 'destructive',
  info: 'info',
})

/**
 * The shadcn roles as an object, keyed by role name without the `--` prefix.
 *
 * For a consumer that keeps a theme as data — a picker showing swatches, a settings
 * screen, a component reading `theme.colors.card` — rather than writing it straight
 * to the document.
 */
export function shadcnRoles(theme: AdeaTheme): Record<string, string> {
  return Object.fromEntries(
    Object.entries(shadcnVariables(theme)).map(([name, value]) => [name.replace(/^--/, ''), value])
  )
}

/**
 * The shadcn custom properties for a theme.
 *
 * `--accent` is filled from `surfaceHover` because that is what shadcn components
 * use it for — the background of a hovered menu item — and `--ring` from the
 * accent, because that is what a focus ring must be drawn in for the focus state
 * to be visible.
 */
export function shadcnVariables(theme: AdeaTheme): Record<string, string> {
  const variables: Record<string, string> = {}

  for (const [role, name] of Object.entries(SHADCN_MAPPING) as [keyof AdeaThemeColors, string][]) {
    variables[`--${name}`] = theme.colors[role]
  }

  variables['--accent'] = theme.colors.surfaceHover
  variables['--accent-foreground'] = theme.colors.text
  variables['--ring'] = theme.colors.accent
  variables['--input'] = theme.colors.border

  // The rest of shadcn's default vocabulary. These are not in `SHADCN_MAPPING`
  // because they are not new *roles* — shadcn's `secondary` and `muted` are both the
  // first surface rung used as a fill, and its `card-foreground` is the body text —
  // so they are filled from the roles that already exist rather than getting
  // second-class entries of their own.
  variables['--card-foreground'] = theme.colors.text
  variables['--popover-foreground'] = theme.colors.text
  variables['--secondary'] = theme.colors.surface
  variables['--secondary-foreground'] = theme.colors.text
  variables['--muted'] = theme.colors.surface
  variables['--sidebar'] = theme.colors.surface
  variables['--sidebar-foreground'] = theme.colors.text
  variables['--sidebar-accent'] = theme.colors.surfaceHover
  variables['--sidebar-border'] = theme.colors.border
  variables['--sidebar-primary'] = theme.colors.accent
  variables['--sidebar-primary-foreground'] = theme.colors.accentForeground
  variables['--sidebar-ring'] = theme.colors.accent
  variables['--sidebar-muted-foreground'] = theme.colors.textMuted

  for (const role of STATUS_ROLES) {
    variables[`--${role}-foreground`] = statusForeground(theme, role)
    variables[`--${role}-subtle`] = `color-mix(in oklch, var(--${role}) 12%, transparent)`
  }

  variables['--surface-sunken'] = theme.colors.background
  variables['--surface-raised'] = theme.colors.surfaceElevated
  variables['--surface-overlay'] = theme.colors.surfaceElevated

  variables['--cursor'] = theme.cursor
  variables['--selection'] = theme.selection

  return variables
}

/** The shadcn variables as a CSS rule. */
export function shadcnCss(theme: AdeaTheme, selector = ':root'): string {
  const body = Object.entries(shadcnVariables(theme))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')
  return `${selector} {\n${body}\n}`
}
