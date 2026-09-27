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

import type { AdeaTheme, AdeaThemeColors, ShadcnThemeProjection } from '../schema.js'
import { primaryHover, primarySubtleCss } from '../accents.js'
import { STATUS_ROLES, statusForeground, tint } from '../derive.js'
import {
  contrastRatio,
  formatOklch,
  gamutMap,
  hexToOklch,
  oklchToHex,
  parseColor,
} from '../oklch.js'

/** A canonical theme with optional owner-authored shadcn presentation values. */
export type ShadcnTheme = AdeaTheme & { shadcn?: ShadcnThemeProjection }

/** The solid destructive pair consumed by filled shadcn actions. */
export interface ShadcnDestructiveProjection {
  /** Presentation fill derived from, but distinct from, the canonical error role. */
  readonly fill: string
  /** Text color that clears the solid and 90%-hover presentation floors. */
  readonly foreground: string
}

const DESTRUCTIVE_PRESENTATION_FLOOR = 5
const DESTRUCTIVE_HOVER_OPACITY = 0.9
const DESTRUCTIVE_PRESENTATION_SURFACES = ['background', 'surface', 'surfaceElevated'] as const

function renderedColor(value: string) {
  const color = parseColor(value)
  return color ? hexToOklch(oklchToHex(color)) : undefined
}

function compositeSrgb(foreground: string, background: string, alpha: number) {
  const foregroundHex = oklchToHex(parseColor(foreground)!)
  const backgroundHex = oklchToHex(parseColor(background)!)
  const channels = [1, 3, 5].map((offset) => {
    const front = Number.parseInt(foregroundHex.slice(offset, offset + 2), 16)
    const back = Number.parseInt(backgroundHex.slice(offset, offset + 2), 16)
    return Math.round(front * alpha + back * (1 - alpha))
      .toString(16)
      .padStart(2, '0')
  })
  return hexToOklch(`#${channels.join('')}`)
}

/**
 * The shared destructive solid fill and foreground as rendered by the UI.
 *
 * A filled destructive button uses `--destructive/90` on hover. A foreground that
 * clears the original fill can fall below AA when that color is alpha-composited
 * over a light or dark surface. This projection keeps the canonical error color
 * untouched, adjusts only the presentation lightness along its hue, and tests the
 * rounded sRGB output against the canvas and both card surfaces. The 5:1 internal
 * margin protects the 4.5:1 AA floor from browser quantization.
 */
export function shadcnDestructiveProjection(theme: ShadcnTheme): ShadcnDestructiveProjection {
  const sourceFill = parseColor(theme.colors.error)
  const sourceForeground = parseColor(theme.colors.foreground)
  const sourceBackground = parseColor(theme.colors.background)
  if (!sourceFill || !sourceForeground || !sourceBackground) {
    throw new Error(`theme ${theme.id} has an invalid destructive color pair`)
  }

  const preferredForeground = statusForeground(theme, 'error')
  const alternateForeground =
    contrastRatio(sourceForeground, sourceFill) >= contrastRatio(sourceBackground, sourceFill)
      ? theme.colors.background
      : theme.colors.foreground
  const foregrounds = [preferredForeground, alternateForeground]
    .map((value) => ({ value, rendered: renderedColor(value) }))
    .filter((entry): entry is { value: string; rendered: NonNullable<typeof entry.rendered> } =>
      Boolean(entry.rendered)
    )
  const surfaceValues = [
    ...DESTRUCTIVE_PRESENTATION_SURFACES.map((role) => theme.colors[role]),
    theme.shadcn?.card ?? theme.colors.surface,
    theme.shadcn?.popover ?? theme.colors.surfaceElevated,
  ]
  const surfaces = surfaceValues
    .map((value) => ({ value, rendered: renderedColor(value) }))
    .filter((entry): entry is { value: string; rendered: NonNullable<typeof entry.rendered> } =>
      Boolean(entry.rendered)
    )
  if (surfaces.length !== surfaceValues.length) {
    throw new Error(`theme ${theme.id} has an invalid destructive presentation surface`)
  }

  for (let step = 0; step <= 250; step += 1) {
    const directions = step === 0 ? [0] : [-1, 1]
    for (const direction of directions) {
      const candidate = gamutMap({
        ...sourceFill,
        l: sourceFill.l + direction * step * 0.001,
      })
      if (candidate.l < 0.02 || candidate.l > 0.98) continue
      const fill = formatOklch(candidate)
      const renderedFill = renderedColor(fill)
      if (!renderedFill) continue

      for (const foreground of foregrounds) {
        const solidRatio = contrastRatio(foreground.rendered, renderedFill)
        if (solidRatio < DESTRUCTIVE_PRESENTATION_FLOOR) continue

        const clearsHoverFloor = surfaces.every(({ rendered }) => {
          const composite = compositeSrgb(fill, formatOklch(rendered), DESTRUCTIVE_HOVER_OPACITY)
          return (
            composite !== undefined &&
            contrastRatio(foreground.rendered, composite) >= DESTRUCTIVE_PRESENTATION_FLOOR
          )
        })
        if (clearsHoverFloor) return { fill, foreground: foreground.value }
      }
    }
  }

  throw new Error(`theme ${theme.id} cannot meet the shared destructive presentation floor`)
}

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
export function shadcnRoles(theme: ShadcnTheme): Record<string, string> {
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
export function shadcnVariables(theme: ShadcnTheme): Record<string, string> {
  const variables: Record<string, string> = {}
  const destructive = shadcnDestructiveProjection(theme)

  for (const [role, name] of Object.entries(SHADCN_MAPPING) as [keyof AdeaThemeColors, string][]) {
    variables[`--${name}`] = role === 'error' ? destructive.fill : theme.colors[role]
  }

  // Keep primary states on the shared appearance-aware accent derivation. Hover is
  // resolved because its uniform lightness step cannot be expressed as a mix; the
  // subtle tint stays tied to --primary so it follows runtime primary overrides.
  variables['--primary-hover'] = primaryHover(theme.colors.accent, theme.appearance)
  variables['--primary-subtle'] = primarySubtleCss(theme.appearance)

  variables['--accent'] = theme.colors.surfaceHover
  variables['--accent-foreground'] = theme.colors.text
  variables['--ring'] = theme.shadcn?.ring ?? theme.colors.accent
  variables['--input'] = theme.shadcn?.input ?? theme.colors.border

  // The rest of shadcn's default vocabulary. These are not in `SHADCN_MAPPING`
  // because they are not new *roles* — shadcn's `secondary` and `muted` are both the
  // first surface rung used as a fill, and its `card-foreground` is the body text —
  // so they are filled from the roles that already exist rather than getting
  // second-class entries of their own.
  variables['--card'] = theme.shadcn?.card ?? theme.colors.surface
  variables['--popover'] = theme.shadcn?.popover ?? theme.colors.surfaceElevated
  variables['--card-foreground'] = theme.colors.text
  variables['--popover-foreground'] = theme.colors.text
  variables['--secondary'] = theme.shadcn?.secondary ?? theme.colors.surface
  variables['--secondary-foreground'] = theme.colors.text
  variables['--muted'] = theme.shadcn?.muted ?? theme.colors.surface
  variables['--muted-foreground'] = theme.shadcn?.mutedForeground ?? theme.colors.textMuted
  variables['--sidebar'] = theme.colors.surface
  variables['--sidebar-foreground'] = theme.colors.text
  variables['--sidebar-accent'] = theme.colors.surfaceHover
  variables['--sidebar-border'] = theme.colors.border
  variables['--sidebar-primary'] = theme.colors.accent
  variables['--sidebar-primary-foreground'] = theme.colors.accentForeground
  variables['--sidebar-ring'] = theme.colors.accent
  variables['--sidebar-muted-foreground'] = theme.colors.textMuted

  variables['--destructive-foreground'] = destructive.foreground

  for (const role of STATUS_ROLES) {
    // Status labels on a subtle fill use the theme's body foreground; this
    // foreground is reserved for text on the role's solid colour. Keep the
    // generated shadcn names aligned with SHADCN_MAPPING, especially error →
    // destructive, and resolve the tint against a real canvas so it is opaque.
    const shadcnRole = SHADCN_MAPPING[role]
    variables[`--${shadcnRole}-foreground`] =
      role === 'error' ? destructive.foreground : statusForeground(theme, role)
    variables[`--${shadcnRole}-subtle`] = tint(theme.colors[role], theme.colors.background)
  }

  variables['--surface-sunken'] = theme.colors.background
  variables['--surface-raised'] = theme.colors.surfaceElevated
  variables['--surface-overlay'] = theme.colors.surfaceElevated

  // Owner-authored legacy roles can differ from the canonical default. These
  // values stay in the record's typed source projection so a consumer does not
  // recreate palette decisions in its own adapter.
  if (theme.shadcn?.border) variables['--border'] = theme.shadcn.border

  variables['--cursor'] = theme.cursor
  variables['--selection'] = theme.selection

  return variables
}

/** The shadcn variables as a CSS rule. */
export function shadcnCss(theme: ShadcnTheme, selector = ':root'): string {
  const body = Object.entries(shadcnVariables(theme))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n')
  return `${selector} {\n${body}\n}`
}
