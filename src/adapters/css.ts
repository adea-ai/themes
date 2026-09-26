/**
 * The application adapter: a theme as CSS custom properties.
 *
 * This is the adapter an application uses. Everything a component needs is written
 * onto a selector as a custom property, in OKLCH, so the browser does the colour
 * work and a theme switch is an attribute change rather than a re-render.
 *
 * ## Two names for the same values
 *
 * {@link themeCssVariables} emits the canonical names — `--adea-background`,
 * `--adea-surface` — and is what a new consumer should use.
 * `adapters/shadcn.ts` emits the shadcn vocabulary this organisation's components
 * are already written against. Both are generated from the same theme object, so
 * the two can never disagree about what `surface` is; that is the entire reason to
 * have one source.
 *
 * ## What is derived rather than stored
 *
 * A handful of variables have no role in the canonical schema and are computed:
 * the chart series (see `syntax.ts`), the status tints used behind status text, and
 * the ANSI variables. They are derived on every call rather than cached, because
 * they are pure functions of the theme and caching them would put a second copy of
 * the truth in the module.
 *
 * ## Why `oklch()` strings and not hex
 *
 * Custom properties are evaluated by the browser. Writing OKLCH means the values
 * stay on the perceptual axis all the way to paint, so a consumer can compose them
 * — `color-mix(in oklch, var(--adea-accent), transparent 20%)` — and get a
 * predictable result. Converted to hex on the way out, that composition would be
 * an sRGB blend, which is what makes hand-mixed tints go muddy.
 */

import type { AdeaTheme, AdeaThemeColors } from '../schema'
import { THEME_COLOR_KEYS, ANSI_KEYS } from '../schema'
import { STATUS_ROLES, chartSeries, statusForeground, tint } from '../derive'

/** How the variables are named. */
export interface CssOptions {
  /** The custom-property namespace. Defaults to `adea`. */
  prefix?: string
  /** The selector the variables are written on. Defaults to `:root`. */
  selector?: string
  /** Also emit the derived status tints, chart series and ansi ramp. Defaults to true. */
  includeDerived?: boolean
  /** Indent each declaration. Used by {@link catalogueCss}. */
  indent?: string
}

const DEFAULT_PREFIX = 'adea'

function variableName(name: string, prefix: string): string {
  return prefix ? `--${prefix}-${name}` : `--${name}`
}

/** camelCase to kebab-case, the way the property names read in CSS. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

/**
 * The literal roles, plus the derived ones.
 *
 * `borderMuted` is emitted for completeness even though shadcn's vocabulary has no
 * equivalent; a consumer that wants a quieter rule can use it directly.
 */
export function themeCssVariables(
  theme: AdeaTheme,
  options: Omit<CssOptions, 'selector' | 'indent'> = {}
): Record<string, string> {
  const prefix = options.prefix ?? DEFAULT_PREFIX
  const includeDerived = options.includeDerived ?? true
  const variables: Record<string, string> = {}

  for (const key of THEME_COLOR_KEYS) {
    variables[variableName(kebab(key), prefix)] = theme.colors[key]
  }

  variables[variableName('cursor', prefix)] = theme.cursor
  variables[variableName('selection', prefix)] = theme.selection

  if (!includeDerived) return variables

  for (const key of ANSI_KEYS) {
    variables[variableName(`ansi-${kebab(key)}`, prefix)] = theme.ansi[key]
  }

  chartSeries(theme).forEach((value, index) => {
    variables[variableName(`chart-${index + 1}`, prefix)] = value
  })

  // Status fills and the text that goes on them. The fill is the role at low
  // strength against the canvas; the foreground is the theme's legible extreme for
  // that fill, not the theme's body text — see `derive.statusForeground`.
  for (const role of STATUS_ROLES) {
    variables[variableName(`${role}-subtle`, prefix)] = tint(
      theme.colors[role],
      theme.colors.background
    )
    variables[variableName(`${role}-foreground`, prefix)] = statusForeground(theme, role)
  }

  // A dimmer rule for tables and inner separators, and the surface one step below
  // the canvas that a well or a code block sits in.
  variables[variableName('surface-sunken', prefix)] = tint(
    theme.colors.text,
    theme.colors.background,
    0.03
  )

  return variables
}

/** A CSS rule for one theme. */
export function themeCss(theme: AdeaTheme, options: CssOptions = {}): string {
  const selector = options.selector ?? ':root'
  const indent = options.indent ?? '  '
  const entries = Object.entries(themeCssVariables(theme, options))

  const body = entries.map(([name, value]) => `${indent}${name}: ${value};`).join('\n')

  return `${selector} {\n${body}\n}`
}

/**
 * One rule per theme, selected by attribute.
 *
 * This is what a consumer ships when it wants the whole catalogue without running
 * JavaScript: every theme's variables are in the stylesheet, and switching is
 * `document.documentElement.dataset.theme = id`. The cost is that all of them
 * download; an application that prefers a smaller bundle should call
 * {@link themeCss} for one theme at a time instead.
 */
export function catalogueCss(
  themes: readonly AdeaTheme[],
  options: CssOptions & { attribute?: string } = {}
): string {
  const attribute = options.attribute ?? 'data-theme'
  return themes
    .map((theme) => themeCss(theme, { ...options, selector: `[${attribute}='${theme.id}']` }))
    .join('\n\n')
}

/** The canonical variable name for a role, so consumers need not build the string. */
export function cssVariableName(role: keyof AdeaThemeColors, prefix = DEFAULT_PREFIX): string {
  return variableName(kebab(role), prefix)
}
