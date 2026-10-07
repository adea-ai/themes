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
 *
 * ## The tint rule
 *
 * The tint is the selected state across the component library — `bg-primary-subtle
 * text-foreground` on an active nav row, a pressed toggle, the highlighted command
 * row, a selected tab — so body text on it is held to the body floor, on every
 * surface body text is held to it on, for every accent the theme offers.
 *
 * It stays a translucent `color-mix()` rather than becoming an opaque value, and
 * that is a measured choice rather than a habit. An opaque tint mixed into the
 * canvas is legible everywhere by construction — the status `-subtle` fills work
 * that way — but it is a wash *of the canvas*: on a dark theme's popover, which is
 * already lighter than the canvas, a selected command row resolved that way lands
 * within ΔE 0.01 of the popover and disappears. A translucent tint is a wash of
 * whatever it sits on, so it reads as selected on every rung.
 *
 * What moves instead is the **strength**, per theme. {@link ACCENT_SUBTLE_ALPHA} is
 * the ceiling, and {@link primarySubtleAlpha} lowers it — only as far as a theme
 * needs — until the composite clears the floor everywhere. The palettes whose body
 * text sits closest to the floor get a lighter wash, and the colour, the
 * foreground and the surfaces stay exactly as their authors wrote them.
 */

import type { AdeaTheme, AnsiKey, ShadcnThemeProjection, ThemeAppearance } from './schema.js'
import type { Oklch } from './oklch.js'
import {
  contrastRatio,
  formatOklch,
  hexToOklch,
  oklchToHex,
  parseColor,
  shiftLightness,
} from './oklch.js'
import {
  ACCENT_PREFERENCE,
  CONTRAST_FLOORS,
  MINIMUM_ACCENT_CHROMA,
  REPAIR_BUDGET,
} from './policy.js'

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
 * How much of the primary a tint carries at most, per appearance.
 *
 * Not one value, because a tint's visibility depends on what it is tinted onto: the
 * same alpha over a near-black surface reads as nothing, and over a near-white one
 * reads as a wash. The dark value is the larger for exactly that reason.
 *
 * A **ceiling**, not the value every theme gets: {@link primarySubtleAlpha} lowers
 * it for a theme whose body text cannot hold the floor on a tint this strong. Most
 * themes keep it.
 *
 * This one *is* a `color-mix()`, because a tint is a share of the primary by nature
 * and follows `--primary` correctly at runtime.
 */
export const ACCENT_SUBTLE_ALPHA: Readonly<Record<ThemeAppearance, number>> = Object.freeze({
  light: 10,
  dark: 16,
})

/** A theme, with the presentation surfaces the shadcn bridge may substitute. */
type TintedTheme = Pick<AdeaTheme, 'appearance' | 'colors' | 'ansi'> & {
  shadcn?: ShadcnThemeProjection
}

/**
 * The weakest tint the catalogue will ship, as a whole percentage.
 *
 * {@link primarySubtleAlpha} lowers a theme's strength for legibility, and this is
 * how far it may go: below it the selected state stops reading as a state at all.
 * The normalizer reserves it — it fits a theme's hover rung so body text still
 * clears the floor under a tint this strong — so every theme in the catalogue can
 * carry at least this much. At 4% the tint over One Dark's popover measures ΔE 0.018
 * against the popover, about the same as its hover rung's feedback there.
 */
export const ACCENT_SUBTLE_MINIMUM_ALPHA = 4

/**
 * Every surface the tint is guaranteed on: every surface body text is guaranteed
 * on.
 *
 * The canvas, the two raised rungs and the hover rung, plus whatever a source
 * substitutes for them in the shadcn bridge — `--card`, `--popover`, `--muted` and
 * `--secondary`; `--sidebar` is the first rung and `--accent` the hover rung. The
 * hover rung is here because a selected item that is also hovered paints the tint
 * over it in some components. The active rung is not: it is the pressed state of an
 * item, not a surface an item sits on.
 */
function tintSurfaces(theme: TintedTheme): string[] {
  const shadcn = theme.shadcn ?? {}
  return [
    ...new Set([
      theme.colors.background,
      theme.colors.surface,
      theme.colors.surfaceElevated,
      theme.colors.surfaceHover,
      ...[shadcn.card, shadcn.popover, shadcn.muted, shadcn.secondary].filter(
        (value): value is string => value !== undefined
      ),
    ]),
  ]
}

/**
 * The primaries a theme offers: its own accent, the {@link ACCENTS} presets in its
 * appearance, and every palette slot {@link themeAccentPresets} could offer from it
 * whatever theme it is paired with.
 */
function offeredPrimaries(theme: TintedTheme): string[] {
  const slots = ACCENT_PREFERENCE.map((slot) => offeredSlotValue(theme, slot)).filter(
    (value): value is string => value !== undefined
  )
  return [
    ...new Set([
      theme.colors.accent,
      ...ACCENTS.map((preset) => accentValue(preset, theme.appearance)),
      ...slots,
    ]),
  ]
}

/** A colour as the screen draws it: through eight-bit sRGB. */
function rendered(value: string): Oklch | undefined {
  const parsed = parseColor(value)
  return parsed ? hexToOklch(oklchToHex(parsed)) : undefined
}

/**
 * A translucent fill painted over an opaque one, the way a browser paints
 * `color-mix(in oklch, <tint> N%, transparent)`: the mix keeps the tint's colour and
 * takes the share as alpha, and the alpha is composited in gamma-encoded sRGB.
 * Rounded to the eight-bit value that reaches the screen, which is the colour an
 * accessibility audit samples.
 */
function compositeTint(tint: string, surface: string, alpha: number): Oklch | undefined {
  const tintColor = parseColor(tint)
  const surfaceColor = parseColor(surface)
  if (!tintColor || !surfaceColor) return undefined
  const front = oklchToHex(tintColor)
  const back = oklchToHex(surfaceColor)
  const channels = [1, 3, 5].map((offset) => {
    const top = Number.parseInt(front.slice(offset, offset + 2), 16)
    const bottom = Number.parseInt(back.slice(offset, offset + 2), 16)
    return Math.round(top * alpha + bottom * (1 - alpha))
      .toString(16)
      .padStart(2, '0')
  })
  return hexToOklch(`#${channels.join('')}`)
}

/**
 * Whether body text holds the floor on a surface under the primary tint.
 *
 * True when `text` and `foreground` both clear `CONTRAST_FLOORS.text` on the tint
 * at `alpha` percent composited over `surface`, for every primary the theme offers
 * and every one in `primaries`. At `alpha` 0 it is the bare surface. The
 * normalizer calls this to fit the hover rung, and {@link primarySubtleAlpha} to
 * fit the strength, so the two are measured by one rule.
 */
export function primaryTintClears(
  theme: TintedTheme,
  surface: string,
  alpha: number,
  primaries: readonly string[] = []
): boolean {
  const foregrounds = [...new Set([theme.colors.text, theme.colors.foreground])].map(rendered)
  if (foregrounds.some((value) => value === undefined)) return false
  const tints = alpha === 0 ? [surface] : [...new Set([...offeredPrimaries(theme), ...primaries])]
  return tints.every((tint) => {
    const fill = compositeTint(tint, surface, alpha / 100)
    return (
      fill !== undefined &&
      foregrounds.every((foreground) => contrastRatio(foreground!, fill) >= CONTRAST_FLOORS.text)
    )
  })
}

const subtleAlphaCache = new WeakMap<object, number>()

/**
 * The tint strength a theme can carry, as a whole percentage.
 *
 * The appearance's {@link ACCENT_SUBTLE_ALPHA} ceiling, lowered one point at a time
 * until body text clears `CONTRAST_FLOORS.text` on the tint over every floored
 * surface, hover rung included, for every primary the theme offers. One value per
 * theme rather than one per accent, so switching between offered accents at runtime
 * needs no new tint: the expression follows `--primary` and the strength already
 * holds for all of them. Every catalogue theme lands at or above
 * {@link ACCENT_SUBTLE_MINIMUM_ALPHA}, because the normalizer fits its hover rung to
 * leave room for it.
 *
 * Pass `primaries` to hold the strength for colours outside the offered set too —
 * a product's own brand primary, say. The offered set is always included.
 */
export function primarySubtleAlpha(theme: TintedTheme, primaries: readonly string[] = []): number {
  const cached = primaries.length === 0 ? subtleAlphaCache.get(theme) : undefined
  if (cached !== undefined) return cached

  const surfaces = tintSurfaces(theme)
  const clears = (alpha: number): boolean =>
    surfaces.every((surface) => primaryTintClears(theme, surface, alpha, primaries))

  let alpha = ACCENT_SUBTLE_ALPHA[theme.appearance]
  while (alpha > 0 && !clears(alpha)) alpha -= 1

  if (primaries.length === 0) subtleAlphaCache.set(theme, alpha)
  return alpha
}

/**
 * The tint expression, for any primary.
 *
 * Pass the **theme**: the expression then carries that theme's measured strength
 * ({@link primarySubtleAlpha}) and body text on it is held to the floor for every
 * accent the theme offers. It still reads `var(--primary)`, so it follows a runtime
 * accent switch — but the strength is the theme's, so a consumer that applies
 * themes at runtime has to write this token per theme, as it already does for
 * {@link primaryHover}. A consumer whose primary is not one the theme offers passes
 * it as `primaries` to have the strength measured for it as well.
 *
 * Passing only an **appearance** gives the {@link ACCENT_SUBTLE_ALPHA} ceiling for
 * that appearance, unmeasured. That is the old behaviour and it is not legible on
 * every theme — One Dark's body text on its own primary's tint over a card measures
 * 4.34:1 at the dark ceiling — so it is kept for a consumer without a theme object
 * in hand, not as the default to reach for.
 */
export function primarySubtleCss(
  target: ThemeAppearance | TintedTheme,
  primaryVariable = '--primary',
  primaries: readonly string[] = []
): string {
  const alpha =
    typeof target === 'string' ? ACCENT_SUBTLE_ALPHA[target] : primarySubtleAlpha(target, primaries)
  return `color-mix(in oklch, var(${primaryVariable}) ${alpha}%, transparent)`
}

/**
 * ## The accents a theme offers
 *
 * The {@link ACCENTS} presets are brand colours: the same six everywhere, chosen
 * once. They read as visitors on a theme whose palette disagrees with them — a
 * Gruvbox canvas with a cool cyan primary is two palettes sharing one window. A
 * theme also carries colours of its *own* that are accent-shaped: its ANSI row is
 * full of vivid, hue-distinct colours that the palette's authors already tuned to
 * sit on that theme's surfaces.
 *
 * `themeAccentPresets` offers those. It pairs the two appearances on the accent
 * slots {@link ACCENT_PREFERENCE} ranks, keeps a slot only when it clears the
 * same floors a catalogue accent must clear — chroma, the raised-surface floor
 * against the theme's own canvas, and a legible label — and returns the theme's
 * values verbatim. Nothing here authors a colour: the slots are the palette's, the
 * floors are the catalogue's, and the pairing is the only new decision.
 *
 * The ids are role-shaped (`ansi-blue`), not value-shaped, so a stored accent
 * survives switching themes: the blue stays the blue, of whichever theme is
 * active. That is what "pulled from the selected theme" means — the offering
 * follows the theme, and so does the resolved colour.
 */
export type ThemeAccentSlot = (typeof ACCENT_PREFERENCE)[number]

const REPAIR_STEP = 0.002

/**
 * A slot's offerable value on one theme: the palette's own colour when it already
 * clears the accent floors on that theme's canvas, otherwise the catalogue's
 * contrast repair — lightness moved, hue and chroma kept, direction away from the
 * canvas, within the accent budget — applied to reach the raised-surface floor
 * with a legible label. `undefined` when even the budget cannot get there, which
 * is the one case where the theme honestly cannot offer the slot.
 */
function offeredSlotValue(
  theme: Pick<AdeaTheme, 'colors' | 'ansi'>,
  slot: ThemeAccentSlot
): string | undefined {
  const original = theme.ansi[slot as AnsiKey]
  const value = parseColor(original)
  const background = parseColor(theme.colors.background)
  if (!value || !background) return undefined
  if (value.c < MINIMUM_ACCENT_CHROMA) return undefined

  // Measured in the canonical form the offer commits, so a repair cannot
  // converge on a value that rounding then pushes back below the floor.
  const clearsFloors = (candidate: Oklch): boolean => {
    const canonical = parseColor(formatOklch(candidate))
    if (!canonical) return false
    return (
      contrastRatio(canonical, background) >= CONTRAST_FLOORS.accentRaised &&
      accentForegroundContrast(formatOklch(canonical)) >= CONTRAST_FLOORS.accentForeground
    )
  }

  if (clearsFloors(value)) return original

  const direction = value.l >= background.l ? 1 : -1
  const maximumSteps = Math.floor(REPAIR_BUDGET.accent / REPAIR_STEP)
  for (let index = 1; index <= maximumSteps; index += 1) {
    const candidate = { ...value, l: value.l + direction * REPAIR_STEP * index }
    if (candidate.l <= 0 || candidate.l >= 1) break
    if (clearsFloors(candidate)) return formatOklch(candidate)
  }
  return undefined
}

/**
 * The accent slots the theme pair offers, ordered by preference, floors enforced.
 * A slot survives only when both appearances can offer it.
 */
export function themeAccentPresets(light: AdeaTheme, dark: AdeaTheme): AccentPreset[] {
  const offered = new Map<ThemeAccentSlot, { light: string; dark: string }>()
  for (const slot of ACCENT_PREFERENCE) {
    const lightValue = offeredSlotValue(light, slot)
    if (lightValue === undefined) continue
    const darkValue = offeredSlotValue(dark, slot)
    if (darkValue === undefined) continue
    offered.set(slot, { light: lightValue, dark: darkValue })
  }
  return [...offered].map(([slot, value]) => ({
    id: `ansi-${slot}`,
    label: slot.charAt(0).toUpperCase() + slot.slice(1),
    description: `The theme's own ${slot} colour.`,
    light: value.light,
    dark: value.dark,
  }))
}

/**
 * The five declarations an accent sets, as CSS values.
 *
 * `primary`, `primaryForeground`, `primaryHover` and `ring` are resolved colours;
 * `primarySubtle` is an expression, for the reason in the module comment. A
 * consumer writes them as custom properties and the rules hold for every theme and
 * every accent at once.
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
  /**
   * The theme the accent is applied to, or only its appearance. A theme gives the
   * tint that theme's measured strength — see {@link primarySubtleCss}; an
   * appearance gives the unmeasured ceiling.
   */
  target: ThemeAppearance | TintedTheme,
  /** The property the subtle tint is built from. A consumer may pass its own alias. */
  primaryVariable = '--primary'
): AccentRoles {
  const appearance = typeof target === 'string' ? target : target.appearance
  const value = accentValue(preset, appearance)
  const parsed = parseColor(value)
  const primary = parsed ? formatOklch(parsed) : value

  return {
    primary,
    primaryForeground: accentForeground(value),
    primaryHover: primaryHover(value, appearance),
    primarySubtle: primarySubtleCss(target, primaryVariable),
    ring: primary,
  }
}
