/**
 * The accent axis.
 *
 * A theme has one interactive colour — its primary — and the accent axis lets a
 * user replace it without changing the theme. That is a different question from
 * "which palette do you want": a user may like Catppuccin's surfaces and still want
 * a violet primary, and a product may ship a brand colour that has to survive every
 * theme in the catalogue.
 *
 * ## Why the presets live here
 *
 * They are colour data with a light/dark pair per preset — structurally the same
 * thing as a theme's primary, and the last colour a consumer should have to author
 * itself. Keeping them in a consumer meant two things that must agree lived in two
 * places: the preset list, and the CSS blocks generated from it. They were written
 * by hand in both, and they drifted — the generated default moved its hover *toward*
 * the canvas while every hand-written accent moved *away*, so the default primary
 * button hovered backwards and picking any accent silently fixed it.
 *
 * Here the values and the derivation are one module, so a consumer emits both from
 * the same rule and cannot produce that disagreement.
 *
 * ## The hover rule
 *
 * A hovered primary moves **away from the canvas**, which is what makes it read as
 * hovered rather than as a second, slightly different colour.
 *
 * Two rules were tried here before this one, and both are worth recording because
 * each looks right until it is measured:
 *
 * - **Toward `--background`** — what the consumer used to do. Inverted in both
 *   appearances: it moves the button toward the page it sits on, so a hovered button
 *   recedes.
 * - **Toward `--foreground`** — correct in principle, since the foreground is
 *   normally away from the canvas, and wrong in practice: a dark theme's foreground
 *   is mid-lightness (`0.79` in the default), so an accent lighter than that — the
 *   dark green is `0.80` — moves *toward* the canvas by a hair.
 * - **Toward white or black** — always the right direction, but a *proportional*
 *   step: a mid-lightness light accent moves ~0.10 and a pale dark accent ~0.03, so
 *   the same rule gives one appearance a hover twice as strong as the other's.
 *
 * A uniform step needs a resolved value, which is why {@link primaryHover} returns
 * one and why the tint below can stay an expression. `shiftLightness` is what keeps
 * the step uniform *and* the hue intact — a mix toward a neutral cannot do both.
 */

import type { ThemeAppearance } from './schema'
import type { Oklch } from './oklch'
import { contrastRatio, formatOklch, parseColor, shiftLightness } from './oklch'

/** One accent preset: a named primary, per appearance. */
export type AccentPreset = {
  /** The `data-accent` value. */
  id: string
  label: string
  /** What the preset is for, in a gallery or a picker. */
  description: string
  /** The accent as it appears on a light theme. */
  light: string
  /** The accent as it appears on a dark theme. */
  dark: string
}

/**
 * The presets.
 *
 * Each is a pair rather than one colour, because the same accent cannot be one
 * value across both appearances: a violet that reads as vivid on a dark canvas is
 * muddy on a light one, and the deep form that works on light is dull on dark. The
 * pairs below are chosen so each appearance gets the vibrancy the other's value
 * would lose.
 */
export const ACCENTS: readonly AccentPreset[] = Object.freeze([
  {
    id: 'violet',
    label: 'Violet',
    description: 'The default brand accent.',
    light: '#6d28d9',
    dark: '#a78bfa',
  },
  {
    id: 'blue',
    label: 'Blue',
    description: 'Cool and conventional. Reads as informational.',
    light: '#2563eb',
    dark: '#60a5fa',
  },
  {
    id: 'green',
    label: 'Green',
    description: 'Reads as confirmatory, which competes with the success status.',
    light: '#15803d',
    dark: '#4ade80',
  },
  {
    id: 'amber',
    label: 'Amber',
    description: 'Warm and attention-drawing. Competes with the warning status.',
    light: '#b45309',
    dark: '#fbbf24',
  },
  {
    id: 'cyan',
    label: 'Cyan',
    description: 'Quiet and technical. The least saturated of the set.',
    light: '#0e7490',
    dark: '#22d3ee',
  },
  {
    id: 'pink',
    label: 'Pink',
    description: 'The loudest of the set. Use where the accent is decorative.',
    light: '#be185d',
    dark: '#f472b6',
  },
])

/** The accent ids, for validating a stored preference without loading the data. */
export const ACCENT_IDS: readonly string[] = Object.freeze(ACCENTS.map((accent) => accent.id))

/** Look a preset up by id. */
export function getAccent(id: string): AccentPreset | undefined {
  return ACCENTS.find((accent) => accent.id === id)
}

/** The accent's value for one appearance. */
export function accentValue(preset: AccentPreset, appearance: ThemeAppearance): string {
  return appearance === 'light' ? preset.light : preset.dark
}

/**
 * The label to draw on an accent fill: black or white, whichever wins on contrast.
 *
 * Measured rather than conventional. The usual convention is "white on a coloured
 * fill", which is wrong for the bright half of this set — white on `#a78bfa` is
 * about 2.1:1, and black on it is about 9.9:1. That is why the same accent carries a
 * black label in dark mode and a white one in light: the pair is designed so the
 * polarity flips, and the label has to flip with it.
 */
export function accentForeground(accent: string): string {
  const fill = parseColor(accent)
  if (!fill) return 'oklch(1 0 0)'

  const black: Oklch = { l: 0, c: 0, h: 0 }
  const white: Oklch = { l: 1, c: 0, h: 0 }
  const best = contrastRatio(black, fill) >= contrastRatio(white, fill) ? black : white
  return formatOklch(best)
}

/** The contrast the chosen label achieves, for validation and reporting. */
export function accentForegroundContrast(accent: string): number {
  const fill = parseColor(accent)
  if (!fill) return 0
  return contrastRatio(parseColor(accentForeground(accent))!, fill)
}

/**
 * How far a hovered primary moves along lightness.
 *
 * A **uniform step**, not a proportional one, and the difference matters. Mixing a
 * fixed share toward white or black moves an accent by a share of its headroom, so
 * the same rule gives a mid-lightness light accent a step of ~0.10 and a pale dark
 * accent one of ~0.03 — a hover that feels twice as strong in one appearance as the
 * other, and nearly invisible on the palest accent.
 *
 * 0.05 is the step this system's accents were already hand-written with, so the
 * accents keep the appearance they had while the rule becomes one value.
 */
export const ACCENT_HOVER_STEP = 0.05

/**
 * The hovered primary, as a resolved colour.
 *
 * Resolved rather than expressed as a `color-mix()`, because a uniform step cannot
 * be written as a mix — see {@link ACCENT_HOVER_STEP}. That means it does **not**
 * follow `--primary` on its own, so a consumer that applies themes at runtime has to
 * write this token too; the alternative is a hover left over from the previous
 * theme's primary. `themeCssVariables` includes it for that reason.
 *
 * The direction is away from the canvas: darker on a light theme, lighter on a dark
 * one. `shiftLightness` keeps chroma and hue and damps chroma near the extremes, so a
 * hovered accent stays the same colour rather than washing out toward grey.
 */
export function primaryHover(primary: string, appearance: ThemeAppearance): string {
  const parsed = parseColor(primary)
  if (!parsed) return primary
  const delta = appearance === 'light' ? -ACCENT_HOVER_STEP : ACCENT_HOVER_STEP
  return formatOklch(shiftLightness(parsed, delta))
}

/**
 * How much of the primary a tint carries, per appearance.
 *
 * Not one value, because a tint's visibility depends on what it is tinted onto: the
 * same alpha over a near-black surface reads as nothing, and over a near-white one
 * reads as a wash. The dark value is the larger for exactly that reason.
 *
 * This one *is* a `color-mix()`, because a tint is a share of the primary by nature
 * and follows `--primary` correctly at runtime.
 */
export const ACCENT_SUBTLE_ALPHA: Readonly<Record<ThemeAppearance, number>> = Object.freeze({
  light: 10,
  dark: 16,
})

/**
 * The tint expression, for any primary.
 *
 * Takes the appearance because the alpha is appearance-dependent — see
 * {@link ACCENT_SUBTLE_ALPHA}.
 */
export function primarySubtleCss(appearance: ThemeAppearance, primaryVariable = '--primary'): string {
  return `color-mix(in oklch, var(${primaryVariable}) ${ACCENT_SUBTLE_ALPHA[appearance]}%, transparent)`
}

/**
 * The five declarations an accent sets, as CSS values.
 *
 * `primary`, `primaryForeground` and `ring` are resolved colours; `primaryHover` and
 * `primarySubtle` are expressions, for the reason in the module comment. A consumer
 * writes them as custom properties and the rules hold for every theme and every
 * accent at once.
 */
export type AccentRoles = {
  primary: string
  primaryForeground: string
  primaryHover: string
  primarySubtle: string
  ring: string
}

export function accentRoles(
  preset: AccentPreset,
  appearance: ThemeAppearance,
  /** The property the subtle tint is built from. A consumer may pass its own alias. */
  primaryVariable = '--primary'
): AccentRoles {
  const value = accentValue(preset, appearance)
  const parsed = parseColor(value)
  const primary = parsed ? formatOklch(parsed) : value

  return {
    primary,
    primaryForeground: accentForeground(value),
    primaryHover: primaryHover(value, appearance),
    primarySubtle: primarySubtleCss(appearance, primaryVariable),
    ring: primary,
  }
}
