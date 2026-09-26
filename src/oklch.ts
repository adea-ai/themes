/**
 * The colour core.
 *
 * OKLCH is the canonical representation in this package, which means every value
 * that enters the catalogue is converted to it and every value that leaves is
 * derived from it. The reason is not fashion: OKLCH's lightness axis is
 * perceptually uniform, so a surface ladder built by adding `0.035` to L produces
 * rungs that *look* evenly spaced across every hue, and a contrast repair that
 * moves L by a fixed amount changes the perceived brightness by a predictable
 * amount. Neither holds in sRGB or HSL, where the same numeric step is a large
 * change in yellow and an invisible one in blue.
 *
 * Two conversion directions are needed and they are not symmetric:
 *
 * - **In**, from the hex values upstream palettes publish. Lossless.
 * - **Out**, to hex, for consumers that cannot express OKLCH — xterm.js reads
 *   hex, and older Shiki engines resolve hex. This direction can land outside
 *   sRGB, so it gamut-maps rather than clipping.
 *
 * Clipping a channel is what turns a carefully chosen out-of-gamut purple into a
 * flat, over-bright magenta. The gamut mapping here reduces chroma at constant
 * lightness and hue instead, which is the standard CSS Color 4 approach and keeps
 * the colour recognisably the one that was asked for.
 */

/** A colour in OKLCH. `l` and `c` are unbounded here; use {@link inGamut} to test. */
export type Oklch = {
  /** Perceptual lightness, nominally 0–1. */
  l: number
  /** Chroma, nominally 0–0.4. */
  c: number
  /** Hue angle in degrees, 0–360. Meaningless when `c` is 0. */
  h: number
}

const SRGB_TO_LINEAR = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

const LINEAR_TO_SRGB = (channel: number): number =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055

/** One sRGB channel as a two-digit hex pair. */
function hexChannel(value: number): string {
  return Math.round(Math.min(1, Math.max(0, LINEAR_TO_SRGB(value))) * 255)
    .toString(16)
    .padStart(2, '0')
}

type LinearRgb = { r: number; g: number; b: number }

/** OKLab, the rectangular form OKLCH is the polar form of. */
type Oklab = { l: number; a: number; b: number }

function linearRgbToOklab({ r, g, b }: LinearRgb): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

function oklabToLinearRgb({ l, a, b }: Oklab): LinearRgb {
  const lp = l + 0.3963377774 * a + 0.2158037573 * b
  const mp = l - 0.1055613458 * a - 0.0638541728 * b
  const sp = l - 0.0894841775 * a - 1.291485548 * b
  const lc = lp ** 3
  const mc = mp ** 3
  const sc = sp ** 3
  return {
    r: 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    g: -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    b: -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  }
}

export const oklchToOklab = ({ l, c, h }: Oklch): Oklab => {
  const radians = (h * Math.PI) / 180
  return { l, a: c * Math.cos(radians), b: c * Math.sin(radians) }
}

export const oklabToOklch = ({ l, a, b }: Oklab): Oklch => {
  const c = Math.hypot(a, b)
  // Hue is undefined for a neutral; report 0 rather than NaN so that a grey
  // survives a round trip and can still be interpolated.
  const h = c < 1e-6 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  return { l, c, h }
}

/** True when every linear channel sits inside the sRGB cube. */
export function inGamut(color: Oklch, tolerance = 1e-4): boolean {
  const { r, g, b } = oklabToLinearRgb(oklchToOklab(color))
  const within = (channel: number): boolean => channel >= -tolerance && channel <= 1 + tolerance
  return within(r) && within(g) && within(b)
}

/**
 * Brings a colour into sRGB by reducing chroma at constant lightness and hue.
 *
 * Reduction is a bisection because the sRGB boundary along a constant-hue line is
 * not a linear function of chroma — a fixed number of decrements either stops
 * short of the boundary (leaving a clipped colour) or overshoots it (desaturating
 * far more than necessary). 24 iterations resolve chroma to well under one
 * 8-bit-steps' worth of difference.
 */
export function gamutMap(color: Oklch): Oklch {
  const lightness = Math.min(1, Math.max(0, color.l))
  const saturated = { ...color, l: lightness }
  if (inGamut(saturated)) return saturated

  let low = 0
  let high = saturated.c
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const mid = (low + high) / 2
    if (inGamut({ ...saturated, c: mid })) low = mid
    else high = mid
  }
  return { ...saturated, c: low }
}

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Parses `#rgb` and `#rrggbb`. Returns undefined rather than throwing. */
export function hexToOklch(hex: string): Oklch | undefined {
  const match = HEX_PATTERN.exec(hex.trim())
  if (!match) return undefined
  const digits = match[1] ?? ''
  const expanded =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits

  const [r, g, b] = [0, 2, 4].map((offset) =>
    SRGB_TO_LINEAR(Number.parseInt(expanded.slice(offset, offset + 2), 16) / 255)
  ) as [number, number, number]

  return oklabToOklch(linearRgbToOklab({ r, g, b }))
}

/** Serialises to `#rrggbb` after gamut mapping. Always lower case. */
export function oklchToHex(color: Oklch): string {
  const mapped = gamutMap(color)
  const { r, g, b } = oklabToLinearRgb(oklchToOklab(mapped))
  return `#${hexChannel(r)}${hexChannel(g)}${hexChannel(b)}`
}

/** Reads one component, allowing a percentage scaled to the channel's own maximum. */
function readComponent(raw: string | undefined, scale: number): number {
  const text = raw ?? '0'
  const value = Number.parseFloat(text)
  if (Number.isNaN(value)) return Number.NaN
  return text.endsWith('%') ? (value / 100) * scale : value
}

const OKLCH_PATTERN =
  /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?\s*(?:\/\s*[\d.]+%?\s*)?\)$/i

/**
 * Parses an `oklch()` string.
 *
 * Alpha is accepted and discarded: every role in the catalogue is opaque, and a
 * translucent value would silently break the contrast floors, which are defined
 * for opaque colours.
 */
export function parseOklch(input: string): Oklch | undefined {
  const match = OKLCH_PATTERN.exec(input.trim())
  if (!match) return undefined
  const l = readComponent(match[1], 1)
  const c = readComponent(match[2], 0.4)
  const h = Number.parseFloat(match[3] ?? '0')
  if ([l, c, h].some(Number.isNaN)) return undefined
  return { l, c, h }
}

/** Accepts either notation, so adapters and fixtures can use whichever reads better. */
export function parseColor(input: string): Oklch | undefined {
  const text = input.trim()
  return text.toLowerCase().startsWith('oklch') ? parseOklch(text) : hexToOklch(text)
}

/**
 * Serialises to the canonical `oklch(L C H)` form, rounded to the precision the
 * catalogue is committed at.
 *
 * The rounding is part of the on-disk contract, not cosmetic: generated files are
 * diffed in CI to prove the committed catalogue matches its sources, and a full
 * float would make that diff unstable across platforms.
 */
export function formatOklch(color: Oklch): string {
  const l = Number(color.l.toFixed(4))
  const c = Number(color.c.toFixed(4))
  const h = color.c < 1e-6 ? 0 : Number(color.h.toFixed(2))
  return `oklch(${l} ${c} ${h})`
}

/**
 * Relative luminance of an sRGB colour, per WCAG 2.1.
 *
 * Computed from linear-light channels, which is why this goes through OKLab
 * rather than being read off `L`: OKLCH lightness is perceptual and WCAG's is
 * not, and the two disagree most in the saturated blues and yellows where the
 * contrast floors actually bite.
 */
export function relativeLuminance(color: Oklch): number {
  const { r, g, b } = oklabToLinearRgb(oklchToOklab(gamutMap(color)))
  return 0.2126 * unit(r) + 0.7152 * unit(g) + 0.0722 * unit(b)
}

/** The WCAG 2.1 contrast ratio, 1–21. Order-independent. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la]
  return (lighter + 0.05) / (darker + 0.05)
}

/** Clamps a linear channel into 0–1. */
function unit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** The direction in which a colour's lightness must move to gain contrast. */
export function contrastDirection(foreground: Oklch, background: Oklch): 1 | -1 {
  return foreground.l >= background.l ? 1 : -1
}

/**
 * The colour as it will actually be written.
 *
 * Repairs must be measured against this rather than against their own working
 * value. {@link formatOklch} rounds lightness to four decimals, and rounding can
 * move a pairing from 4.5001:1 to 4.4998:1 — so a repair that converges on the
 * exact floor and is then rounded ships a value that fails the floor it was
 * computed to satisfy. Measuring the canonical form closes that gap by making the
 * thing measured and the thing committed the same thing.
 */
export function canonical(color: Oklch): Oklch {
  return parseColor(formatOklch(color)) ?? color
}

export type ContrastRepair = {
  color: Oklch
  ratio: number
  /** How far L moved, 0 when the input already cleared the floor. */
  delta: number
  /** False when the floor could not be reached within `budget`. */
  satisfied: boolean
}

/**
 * Moves a colour's lightness until it clears a contrast floor, by the smallest
 * step that works.
 *
 * A theme's status colours come from its author's palette, and a palette chosen
 * for a terminal is not automatically legible as a UI accent: Solarized's yellow
 * is the colour Solarized is famous for, and it is also nearly invisible on
 * Solarized's own light background. The catalogue's answer is not to discard the
 * colour or to accept the failure, but to keep the hue and chroma the author
 * chose and move only the lightness, by the least amount that clears the floor.
 *
 * `budget` bounds that movement. Past it the colour is no longer the one the
 * palette specifies, so the repair reports `satisfied: false` and the validator
 * fails the theme instead of shipping a palette that quietly is not Solarized.
 */
export function repairContrast(
  foreground: Oklch,
  background: Oklch,
  minimum: number,
  budget = 0.22
): ContrastRepair {
  // Measured in the canonical form, for the reason {@link canonical} gives: the caller
  // commits `formatOklch`'s rounded output, and a repair that converges on the exact
  // floor of an unrounded value ships a value that fails it. The lower a floor is, the
  // more this matters, and the scale starts at 1.2:1 — so a selection colour's whole
  // range is a few rounding steps wide.
  const initial = contrastRatio(canonical(foreground), background)
  if (initial >= minimum) {
    return { color: foreground, ratio: initial, delta: 0, satisfied: true }
  }

  // Both directions are tried, nearest first. Moving away from the background's
  // lightness is the usual answer, but when the colour is already near an end of the
  // range there is no headroom in that direction — Solarized Light's cursor is a
  // mid grey on a near-white canvas, and *lightening* it has 0.03 to work with while
  // darkening it has the whole range.
  const preferred = contrastDirection(foreground, background)
  const step = 0.002
  const maximumSteps = Math.floor(budget / step)

  for (let index = 1; index <= maximumSteps; index += 1) {
    for (const direction of [preferred, -preferred] as const) {
      const candidate: Oklch = { ...foreground, l: foreground.l + direction * step * index }
      if (candidate.l <= 0 || candidate.l >= 1) continue
      const ratio = contrastRatio(canonical(candidate), background)
      if (ratio >= minimum) {
        return {
          color: canonical(candidate),
          ratio,
          delta: Number((step * index).toFixed(4)),
          satisfied: true,
        }
      }
    }
  }

  return {
    color: foreground,
    ratio: initial,
    delta: 0,
    satisfied: false,
  }
}

/**
 * Interpolates two colours in OKLCH.
 *
 * Hue takes the shorter arc, so a blend from magenta (330°) to orange (30°) goes
 * through red rather than the long way round through green. When either side is
 * neutral its hue is meaningless, so the other side's hue is carried across
 * instead of being interpolated toward an arbitrary zero.
 */
export function mix(a: Oklch, b: Oklch, amount: number): Oklch {
  const t = Math.min(1, Math.max(0, amount))
  const neutral = 1e-6
  const aChromatic = a.c > neutral
  const bChromatic = b.c > neutral

  let hue: number
  if (aChromatic && bChromatic) {
    const delta = ((b.h - a.h + 540) % 360) - 180
    hue = (a.h + delta * t + 360) % 360
  } else if (aChromatic) {
    hue = a.h
  } else {
    hue = b.h
  }

  return {
    l: a.l + (b.l - a.l) * t,
    c: a.c + (b.c - a.c) * t,
    h: hue,
  }
}

/** Shifts lightness by `delta`, keeping chroma and hue. Chroma is damped at the extremes. */
export function shiftLightness(color: Oklch, delta: number): Oklch {
  const l = Math.min(1, Math.max(0, color.l + delta))
  // Chroma that was representable at the original lightness may not be at the new
  // one — every hue's maximum chroma collapses toward the black and white ends.
  // Damping before the gamut map keeps the hue from drifting as it is reduced.
  const headroom = Math.min(1, 4 * Math.min(l, 1 - l) + 0.15)
  return { l, c: color.c * headroom, h: color.h }
}

/** Scales chroma, clamped to the maximum the hue can hold. */
export function scaleChroma(color: Oklch, factor: number): Oklch {
  return { ...color, c: Math.max(0, Math.min(0.4, color.c * factor)) }
}

/** The perceptual distance between two colours, for deduplication and assertions. */
export function deltaEok(a: Oklch, b: Oklch): number {
  const first = oklchToOklab(a)
  const second = oklchToOklab(b)
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b)
}
