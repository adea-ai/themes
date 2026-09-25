/**
 * The normalizer: Base24 in, Adea theme out.
 *
 * This module is the reason the package exists. The palettes in `palettes/` are
 * other people's, and they arrive describing a *terminal*: a background, a
 * foreground, a comment grey, and sixteen hues. A UI needs different words — a
 * surface ladder, borders, an accent, four status roles that are legible as text.
 * Translating between the two is the work Adea owns, and it is done here, once,
 * for every theme in the catalogue, rather than by hand in each consumer.
 *
 * ## The transformations, and why each is not obvious
 *
 * **The surface ladder is built, not read.** Base24 has exactly one background
 * slot, so there is no upstream value to copy for "a card on the canvas". The four
 * rungs are derived by adding fixed increments to the background's OKLCH
 * lightness, keeping its hue and a damped share of its chroma — which is what
 * makes Catppuccin's ladder mauve-tinted and Nord's blue-tinted without either
 * being told to be.
 *
 * **The direction of that ladder flips with the appearance.** On a dark theme a
 * raised surface is *lighter*; on a light theme it is *darker*. Getting this
 * wrong yields a light theme whose dialogs are white-on-white, so
 * {@link ladderDirection} is measured from the background rather than assumed from
 * the declared variant.
 *
 * **Light Base24 schemes invert their own ramp.** In a dark scheme `base03` is a
 * dark grey and `base05` is near-white; in a light scheme `base03` is the lightest
 * grey and `base05` is near-black. A fixed assignment of slots to ANSI roles
 * therefore produces an inverted 16-colour ramp on half the catalogue. The ramp
 * roles are assigned by *measured contrast* and by appearance instead, in
 * {@link buildAnsiRamp}.
 *
 * **A selection colour can erase its own text.** Base24's `base02` is whatever the
 * palette's author set, and several set it to a near-white — fine as a terminal
 * selection, fatal as an app selection under near-white body text. The theme keeps
 * the palette's colour and the *adapters* derive a matching foreground
 * (see `adapters/xterm.ts`); the catalogue additionally checks that the selection
 * is perceptible against the background at all.
 *
 * **Status and accent colours are repaired, within a budget.** A palette chosen for
 * an editor is not automatically legible as UI text. Every status role is checked
 * against the background and its lightness moved by the least amount that clears
 * the floor — and if that would move it more than the budget allows, the theme is
 * reported as failing rather than silently shipping a colour that is no longer the
 * one the palette's author chose.
 */

import type {
  AdeaAnsi,
  AdeaThemeColors,
  AdeaThemeRecord,
  AnsiKey,
  ThemeAppearance,
  ThemeProvenance,
} from './schema'
import type { Base24Scheme, Base24Slot } from './adapters/base24'
import { parseBase24Palette } from './adapters/base24'
import type { Oklch } from './oklch'
import {
  canonical,
  contrastRatio,
  contrastDirection,
  deltaEok,
  formatOklch,
  mix,
  parseColor,
  shiftLightness,
} from './oklch'
import type { ContrastRepair } from './oklch'
import { repairContrast } from './oklch'

/**
 * The contrast floors.
 *
 * These are the catalogue's policy, and they are the reason an external palette
 * can be admitted at all: nothing enters the catalogue on taste. `text` sits at
 * the WCAG AA body-text floor; `border` is measured on the non-text scale, where
 * the requirement is perceptibility rather than legibility.
 */
export const CONTRAST_FLOORS = Object.freeze({
  text: 4.5,
  textMuted: 4.5,
  /** Large or non-essential text, per WCAG 1.4.3. */
  textSubtle: 3,
  accent: 4.5,
  /**
   * The accent on a raised surface, where it is a fill rather than a label.
   *
   * The same two-tier reasoning as `statusRaised`: a button or a selected tab is a
   * user-interface component, which WCAG holds to 3:1, and the pairing that
   * actually carries text — the accent's own label — is measured separately at 4.5
   * against the accent itself. Holding the accent to 4.5 on every surface instead
   * made Everforest Light's every hue collapse into its body text, because that
   * palette's colours are all around 2:1 on its own canvas.
   */
  accentRaised: 3,
  accentForeground: 4.5,
  /**
   * Status colours drawn on the canvas, where they are read as small text.
   */
  status: 4.5,
  /**
   * Status colours drawn on a raised surface, where they are an indicator.
   *
   * The two-tier policy is deliberate and it is not a relaxation for convenience.
   * A status role on a card is nearly always a dot, an icon or a chip's own fill —
   * a graphical object, which WCAG holds to 3:1 — and it is that way because the
   * alternative does not exist: Ayu Light and Everforest Light are muted palettes
   * built for a near-white canvas and neither contains a yellow that is legible as
   * small text on one. Forcing 4.5:1 there required blending the warning colour
   * 94% of the way to the body text, which produces a warning that is the same
   * colour as the text beside it and is therefore not a warning at all.
   *
   * A component that renders small status *text* on a raised surface should put it
   * on the role's `-subtle` fill, which is a tint of the canvas and is measured at
   * the body floor.
   */
  statusRaised: 3,
  /** A divider is decorative; it must be seen, not read. */
  border: 1.15,
  borderMuted: 1.08,
  /** A raised surface must be distinguishable from the canvas it sits on. */
  surface: 1.03,
  /** A selection must be visible under the text it selects. */
  selection: 1.2,
} as const)

/** How far the normalizer may move a colour's lightness before it gives up. */
/**
 * How much a repair changed the palette's colour.
 *
 * Lightness movement and blending are not equally costly. Moving lightness keeps
 * the hue and most of the chroma and is what a designer does by hand; blending
 * toward the foreground gives up chroma, and past roughly a third of the way the
 * result stops reading as the colour it came from. The weights encode that, and the
 * score is only ever used to compare two ways of repairing the *same role*, so its
 * absolute value means nothing.
 */
function distortionOf(attempt: { repair: ContrastRepair; blended: boolean }): number {
  return attempt.blended ? attempt.repair.delta * 3 : attempt.repair.delta
}

const REPAIR_BUDGET = Object.freeze({
  /** Body text: some palettes publish a foreground that fails on their own canvas. */
  text: 0.2,
  status: 0.24,
  accent: 0.24,
})

/** The accent preference order, best first. */
const ACCENT_PREFERENCE = ['blue', 'magenta', 'cyan', 'green'] as const satisfies readonly AnsiKey[]

/**
 * How much stronger body text must be than the secondary rung.
 *
 * Small on purpose. The requirement is that the two are *distinguishable*, not that
 * there is a wide gulf — 0.4 of a contrast ratio is a visible difference without
 * making secondary text unnecessarily faint.
 */
const MINIMUM_LADDER_GAP = 0.4

/** The smallest chroma a colour needs before it reads as "a colour" rather than grey. */
const MINIMUM_ACCENT_CHROMA = 0.035

/** A theme's source description, as the catalogue declares it. */
export interface ThemeSourceSpec {
  id: string
  name: string
  family: string
  familyLabel: string
  label: string
  description: string
  /** The declared appearance. The measured one is used when the two disagree. */
  appearance: ThemeAppearance
  tags: readonly string[]
  /** The Base24 scheme this theme was normalized from. */
  scheme: Base24Scheme
  /**
   * Corrections to the vendored palette, applied before anything is derived.
   *
   * A terminal port is not always the project's own palette. Where a port has
   * deliberately changed a value for terminal use — iTerm2's One Dark ships a
   * darker canvas than Atom's editor did — the official value is the one Adea
   * should theme with, and the correction is recorded as a finding and documented
   * on the entry that makes it.
   */
  palette?: Partial<Record<Base24Slot, string>>
  /**
   * Transpose the palette's hues onto the canvas.
   *
   * Set when a composition borrows one palette's hues for another palette's canvas.
   * See {@link transposeHues} for why the move is common to every hue rather than
   * applied per hue.
   */
  hueTranspose?: { floor: number }
  /** Which ANSI role supplies the accent, when the family's identity demands one. */
  accentSlot?: AnsiKey
  /** Explicit roles for authored themes, applied after derivation. */
  colors?: Partial<AdeaThemeColors>
  ansi?: Partial<AdeaAnsi>
  cursor?: string
  selection?: string
  /**
   * A provenance that overrides the family's.
   *
   * For a theme that is not simply a member of a family — Adea's composed dark theme
   * belongs to the `adea` family but has two upstream parents to name.
   */
  provenance?: ThemeProvenance
}

/** Something the normalizer did that a reviewer should know about. */
export interface NormalizationFinding {
  themeId: string
  role: string
  kind: 'repaired' | 'budget-exceeded' | 'substituted'
  message: string
}

const SURFACE_STEPS = Object.freeze({
  surface: 0.035,
  surfaceElevated: 0.065,
  surfaceHover: 0.1,
  surfaceActive: 0.135,
} as const)

/**
 * Which way a raised surface moves from the canvas.
 *
 * Measured from the background's lightness rather than taken from the declared
 * variant. The declaration is authored by hand and has been wrong; the luminance
 * of the background is not.
 */
function ladderDirection(background: Oklch): 1 | -1 {
  return background.l <= 0.5 ? 1 : -1
}

/** True when the declared variant and the measured canvas agree. */
export function appearanceMatchesCanvas(
  appearance: ThemeAppearance,
  background: Oklch
): boolean {
  return (background.l <= 0.5 ? 'dark' : 'light') === appearance
}

/**
 * Builds one rung of the surface ladder.
 *
 * Chroma is scaled up slightly rather than held constant: the steps are small
 * enough that a hue carried at its original chroma reads as a grey smudge, while
 * the same hue with a little more chroma reads as "the tint this theme is made
 * of". The scale is modest because a surface is still a surface — at the hover
 * rung a large scale turns a panel into a coloured button.
 */
function surfaceRung(background: Oklch, step: number, direction: 1 | -1): Oklch {
  const raised = shiftLightness(background, step * direction)
  const chromaScale = 1 + Math.min(0.6, step * 6)
  return { ...raised, c: Math.min(0.06, raised.c * chromaScale) }
}

/**
 * Assigns the greyscale ANSI roles.
 *
 * Base24 does not name `black`, `white` or `brightBlack` — the background and
 * foreground slots do double duty — so the mapping is Adea's, and two things about
 * it are not obvious.
 *
 * **It is appearance-aware, because the ANSI greyscale ramp means opposite things
 * on the two kinds of theme.** On a dark terminal ANSI 0 is a dark neutral used for
 * text on light fills and ANSI 8 is the dim comment grey; on a light terminal ANSI
 * 0 *is* the body text. A single fixed rule gets one of the two wrong.
 *
 * **`white` and `brightWhite` are read from different slots per appearance.** On a
 * dark theme they are the two strongest foregrounds, because that is where a dark
 * palette keeps its light colours. On a light theme the foreground ramp is
 * *entirely dark* — Gruvbox Light's `base05`, `base06` and `base07` are all
 * `#3c3836` — so reading "white" off it yields a near-black, and the light colours
 * have to come from the two slots the palette puts *beyond* its canvas, `base10`
 * and `base11`. Where a palette leaves those darker than its canvas, the foreground
 * ramp is used instead.
 *
 * Candidates are paired with `base01` and de-duplicated first, because light
 * schemes routinely set `base05`, `base06` and `base07` to the same value — without
 * de-duplication the ramp collapses to three members and the roles collide.
 */
function buildAnsiRamp(
  palette: Record<Base24Slot, Oklch>,
  background: Oklch,
  appearance: ThemeAppearance
): { black: Oklch; white: Oklch; brightBlack: Oklch; brightWhite: Oklch } {
  // Which slots are *foregrounds* depends on the appearance, because Base24's
  // background slots do double duty. `base01` is the "lighter background" — a
  // status-bar fill — so on a dark scheme it is a usable mid grey and on a light
  // scheme it is a second, barely-darker canvas. `base06` and `base07` are the
  // "light foreground" and "light background", and light schemes routinely set
  // `base07` to the *lightest* background, which ranks as the dimmest member of the
  // ramp: including it gave Everforest Light a `brightBlack` of `#fffbef`, a
  // comment colour 1.16:1 against its own canvas.
  //
  // So a light theme's greyscale foregrounds are exactly the three slots Base24
  // defines as foreground-ish, and a dark theme's include the two extra slots it has
  // to work with.
  const candidates =
    appearance === 'dark'
      ? [palette.base01, palette.base03, palette.base04, palette.base05, palette.base06, palette.base07]
      : [palette.base03, palette.base04, palette.base05]

  const distinct: Oklch[] = []
  for (const candidate of candidates) {
    if (distinct.every((kept) => deltaEok(kept, candidate) > 0.02)) distinct.push(candidate)
  }
  // Strongest first: the ramp is ranked by measured contrast, not by slot number,
  // because a slot's contrast depends on which appearance the palette is.
  distinct.sort((a, b) => contrastRatio(b, background) - contrastRatio(a, background))

  const strongest = distinct[0] ?? palette.base05
  const dimmest = distinct[distinct.length - 1] ?? palette.base03
  const secondStrongest = distinct[1] ?? strongest
  const secondDimmest = distinct[distinct.length - 2] ?? dimmest

  if (appearance === 'dark') {
    return {
      brightWhite: strongest,
      white: secondStrongest,
      black: dimmest,
      brightBlack: secondDimmest,
    }
  }

  // The two slots a light scheme places beyond its canvas. `base11` is one step
  // further than `base10`, which is what makes it the brighter of the pair.
  //
  // A canvas that is already at the top of the range — Adea's own light theme is
  // pure white — has nothing beyond it, so the fallback is the *brightest* end of
  // the foreground ramp rather than the darkest. Falling back to the dimmest would
  // hand a light theme an ANSI white darker than its own text.
  const beyondCanvas = [palette.base10, palette.base11].filter(
    (candidate) => candidate.l > background.l
  )

  return {
    brightWhite: beyondCanvas[1] ?? beyondCanvas[0] ?? strongest,
    white: beyondCanvas[0] ?? secondStrongest,
    black: strongest,
    brightBlack: dimmest,
  }
}

/** Formats a role, pairing the value with the finding it produced if any. */
function emit(
  themeId: string,
  role: string,
  repair: ContrastRepair,
  floor: number,
  blended = false
): { value: string; finding?: NormalizationFinding } {
  if (repair.satisfied && repair.delta === 0) return { value: formatOklch(repair.color) }
  if (repair.satisfied) {
    return {
      value: formatOklch(repair.color),
      finding: {
        themeId,
        role,
        kind: 'repaired',
        message: blended
          ? `blended ${(repair.delta * 100).toFixed(0)}% into the foreground to reach ${floor}:1 (now ${repair.ratio.toFixed(2)}:1)`
          : `lightness moved ${repair.delta.toFixed(3)} to reach ${floor}:1 (now ${repair.ratio.toFixed(2)}:1)`,
      },
    }
  }
  return {
    value: formatOklch(repair.color),
    finding: {
      themeId,
      role,
      kind: 'budget-exceeded',
      message: `still ${repair.ratio.toFixed(2)}:1 against the canvas after the maximum lightness move; needs ${floor}:1`,
    },
  }
}

/**
 * Chooses the accent.
 *
 * The accent is the one colour a UI uses for "this is interactive", so it is
 * chosen by measurement rather than by convention: candidates are tried in a fixed
 * preference order (blue first, because a blue accent is what most of these
 * palettes were designed around) and the first that clears the text floor within
 * budget, while still being *a* colour rather than a grey, wins. A family whose
 * identity lies elsewhere — Everforest is green, Rosé Pine is iris — declares its
 * slot explicitly, and that declaration is honoured before any preference.
 */
function chooseAccent(
  themeId: string,
  ansi: Record<AnsiKey, Oklch>,
  surfaces: readonly Oklch[],
  preferred: AnsiKey | undefined,
  anchor: Oklch
): { role: AnsiKey; repair: ContrastRepair; findings: NormalizationFinding[] } {
  const findings: NormalizationFinding[] = []
  const background = surfaces[0] as Oklch
  const order: readonly AnsiKey[] = preferred ? [preferred, ...ACCENT_PREFERENCE] : ACCENT_PREFERENCE

  let fallback: { role: AnsiKey; repair: ContrastRepair } | undefined
  const satisfying: {
    role: AnsiKey
    repair: ContrastRepair
    distortion: number
    blended: boolean
  }[] = []

  for (const role of order) {
    const candidate = ansi[role]
    if (!candidate || candidate.c < MINIMUM_ACCENT_CHROMA) continue
    // Two tiers, as for the status roles: the link floor on the canvas, then the
    // component floor on a raised surface, applied in sequence.
    const onCanvas = repairRole(
      candidate,
      [background],
      anchor,
      CONTRAST_FLOORS.accent,
      REPAIR_BUDGET.accent
    )
    if (!onCanvas.repair.satisfied) {
      if (!fallback || onCanvas.repair.ratio > fallback.repair.ratio) {
        fallback = { role, repair: onCanvas.repair }
      }
      continue
    }

    const onRaised = repairRole(
      onCanvas.repair.color,
      surfaces.slice(1),
      anchor,
      CONTRAST_FLOORS.accentRaised,
      REPAIR_BUDGET.accent
    )
    const attempt = {
      repair: {
        color: onRaised.repair.color,
        ratio: onRaised.repair.ratio,
        delta: onCanvas.repair.delta + onRaised.repair.delta,
        satisfied: onRaised.repair.satisfied,
      },
      blended: onCanvas.blended || onRaised.blended,
    }

    if (attempt.repair.satisfied) {
      satisfying.push({ role, repair: attempt.repair, distortion: distortionOf(attempt), blended: attempt.blended })
      continue
    }
    // Track the best attempt so a theme that cannot satisfy the floor still gets
    // its most legible candidate rather than an arbitrary one.
    if (!fallback || attempt.repair.ratio > fallback.repair.ratio) {
      fallback = { role, repair: attempt.repair }
    }
  }

  if (satisfying.length > 0) {
    // A declared accent is honoured whenever it can be reached without giving the
    // colour up. Lightness movement *is* what a palette author does to make an
    // accent usable — Rosé Pine's iris needs a 0.11 step on its light variant and is
    // still unmistakably iris — so a lightness repair never costs a family its
    // identity. Blending does: past about a third of the way the result stops being
    // the colour it came from, and a green repaired into slate is no longer
    // Everforest's accent.
    //
    // So the declared slot wins unless it had to be blended; if it did — or if none
    // was declared — the least-distorted candidate wins, with the preference order
    // breaking ties.
    const cheapest = satisfying.reduce((best, entry) =>
      entry.distortion < best.distortion ? entry : best
    )
    const declared = preferred ? satisfying.find((entry) => entry.role === preferred) : undefined
    const chosen = declared && !declared.blended ? declared : cheapest

    if (chosen.role !== preferred && preferred) {
      findings.push({
        themeId,
        role: 'accent',
        kind: 'substituted',
        message: declared
          ? `the declared accent slot ${preferred} could only clear the floor by blending ${(declared.repair.delta * 100).toFixed(0)}% into the foreground; used ${chosen.role} at ${(chosen.repair.delta * 100).toFixed(0)}% instead`
          : `the declared accent slot ${preferred} could not clear the floor; used ${chosen.role} instead`,
      })
    }
    if (chosen.repair.delta > 0.01) {
      findings.push({
        themeId,
        role: 'accent',
        kind: 'repaired',
        message: chosen.blended
          ? `blended ${(chosen.repair.delta * 100).toFixed(0)}% into the foreground from the palette's ${chosen.role}`
          : `lightness moved ${chosen.repair.delta.toFixed(3)} from the palette's ${chosen.role}`,
      })
    }
    return { role: chosen.role, repair: chosen.repair, findings }
  }

  const chosen = fallback ?? {
    role: 'blue' as AnsiKey,
    repair: repairContrast(background, background, 1),
  }
  findings.push({
    themeId,
    role: 'accent',
    kind: 'budget-exceeded',
    message: `no accent candidate cleared ${CONTRAST_FLOORS.accent}:1; the best was ${chosen.role} at ${chosen.repair.ratio.toFixed(2)}:1`,
  })
  return { role: chosen.role, repair: chosen.repair, findings }
}

/**
 * Picks the text colour drawn on top of the accent.
 *
 * Not derived from the appearance, which is the tempting shortcut and is wrong:
 * Catppuccin Mocha's blue accent is light enough that black is the legible label,
 * while Nord's is dark enough that white is. The pick is whichever of the
 * palette's own two extremes measures better, repaired if neither clears the floor.
 */
function chooseAccentForeground(
  themeId: string,
  accent: Oklch,
  palette: Record<Base24Slot, Oklch>
): { value: Oklch; findings: NormalizationFinding[] } {
  const findings: NormalizationFinding[] = []
  const candidates = [palette.base00, palette.base07, palette.base05, palette.base06]

  let best = candidates[0] as Oklch
  let bestRatio = contrastRatio(best, accent)
  for (const candidate of candidates.slice(1)) {
    const ratio = contrastRatio(candidate, accent)
    if (ratio > bestRatio) {
      best = candidate
      bestRatio = ratio
    }
  }

  const repair = repairContrast(best, accent, CONTRAST_FLOORS.accentForeground, 0.6)
  if (!repair.satisfied) {
    findings.push({
      themeId,
      role: 'accentForeground',
      kind: 'budget-exceeded',
      message: `only ${repair.ratio.toFixed(2)}:1 against the accent; needs ${CONTRAST_FLOORS.accentForeground}:1`,
    })
  }
  return { value: repair.color, findings }
}

/**
 * Moves a colour's lightness until it clears a floor against **every** surface it
 * can be drawn on.
 *
 * This is the difference between a theme that is legible on its canvas and a theme
 * that is legible in the application. `repairContrast` measures against one
 * background, which is right for a terminal and wrong for a UI: a status colour is
 * as likely to appear inside a card or a popover as on the canvas, and those rungs
 * are deliberately moved away from the canvas, so a colour tuned to exactly 4.5:1
 * on the background lands at roughly 4.0:1 on a card.
 *
 * The surfaces of one theme all sit on the same side of the canvas, so the surface
 * with the *lowest* current ratio is the furthest from the colour, and moving away
 * from it moves away from all of them. The worst surface is recomputed on every
 * step rather than chosen once, because a colour can cross between them.
 */
function repairAcrossSurfaces(
  color: Oklch,
  surfaces: readonly Oklch[],
  minimum: number,
  budget: number
): ContrastRepair {
  // Measured in the canonical form the catalogue commits, so a repair cannot
  // converge on a value that rounding then pushes back below the floor.
  const worst = (candidate: Oklch): { surface: Oklch; ratio: number } => {
    const rounded = canonical(candidate)
    let result = { surface: surfaces[0] as Oklch, ratio: Number.POSITIVE_INFINITY }
    for (const surface of surfaces) {
      const ratio = contrastRatio(rounded, surface)
      if (ratio < result.ratio) result = { surface, ratio }
    }
    return result
  }

  const initial = worst(color)
  if (initial.ratio >= minimum) {
    return { color, ratio: initial.ratio, delta: 0, satisfied: true }
  }

  const direction = contrastDirection(color, initial.surface)
  const step = 0.002
  const maximumSteps = Math.floor(budget / step)

  for (let index = 1; index <= maximumSteps; index += 1) {
    const candidate: Oklch = { ...color, l: color.l + direction * step * index }
    if (candidate.l <= 0 || candidate.l >= 1) break
    const measured = worst(candidate)
    if (measured.ratio >= minimum) {
      return {
        color: candidate,
        ratio: measured.ratio,
        delta: Number((step * index).toFixed(4)),
        satisfied: true,
      }
    }
  }

  return { color, ratio: initial.ratio, delta: 0, satisfied: false }
}

/**
 * Repairs a colour that cannot reach the floor by lightness alone, by blending it
 * toward the palette's own foreground.
 *
 * Everforest Light is why this exists. Its entire palette is muted pastels chosen
 * for a cream canvas, and its brightest accents measure 1.6:1 against that canvas —
 * no lightness move fixes that within a budget that leaves the colour recognisable,
 * because the colour is already as dark as its own hue allows. Darkening it further
 * produces olive.
 *
 * Blending toward the palette's foreground instead is what the palette's own author
 * does when they need a colour to be read rather than seen: it keeps the hue, gives
 * up chroma, and converges on the foreground's contrast as the blend approaches 1.
 * The result is a muted, deeper version of the accent — which is what Everforest's
 * light themes actually look like.
 *
 * The blend is bound by the foreground, so it always terminates; and when even a
 * full blend cannot clear the floor, the theme is reported rather than shipped with
 * an invented colour.
 */
function repairByBlending(
  color: Oklch,
  surfaces: readonly Oklch[],
  anchor: Oklch,
  minimum: number
): ContrastRepair {
  const worstRatio = (candidate: Oklch): number =>
    Math.min(...surfaces.map((surface) => contrastRatio(canonical(candidate), surface)))

  let low = 0
  let high = 1
  if (worstRatio(anchor) < minimum) {
    return { color, ratio: worstRatio(color), delta: 0, satisfied: false }
  }

  // The smallest blend that works: 20 iterations resolve the amount far below the
  // precision the catalogue is committed at.
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const mid = (low + high) / 2
    if (worstRatio(mix(color, anchor, mid)) >= minimum) high = mid
    else low = mid
  }

  const blended = canonical(mix(color, anchor, high))
  return {
    color: blended,
    ratio: worstRatio(blended),
    delta: Number(high.toFixed(4)),
    satisfied: true,
  }
}

/**
 * The full repair chain for a foreground role.
 *
 * Lightness first, because that is the cheapest change and usually enough; blending
 * second, because some palettes cannot be repaired any other way. Both are reported
 * so a reviewer can see which themes needed which.
 */
function repairRole(
  color: Oklch,
  surfaces: readonly Oklch[],
  anchor: Oklch,
  minimum: number,
  budget: number
): { repair: ContrastRepair; blended: boolean } {
  const lightness = repairAcrossSurfaces(color, surfaces, minimum, budget)
  if (lightness.satisfied) return { repair: lightness, blended: false }

  const blend = repairByBlending(color, surfaces, anchor, minimum)
  if (blend.satisfied) return { repair: blend, blended: true }

  return { repair: lightness, blended: false }
}


/**
 * The Base24 slots that carry a hue rather than a grey.
 *
 * `base09` and `base0F` are included even though neither donor publishes them: they
 * are synthesised from red and yellow, and leaving them behind would put an
 * untransposed orange next to a transposed red.
 */
const CHROMATIC_SLOTS = [
  'base08',
  'base09',
  'base0A',
  'base0B',
  'base0C',
  'base0D',
  'base0E',
  'base0F',
  'base12',
  'base13',
  'base14',
  'base15',
  'base16',
  'base17',
] as const satisfies readonly Base24Slot[]

/** The six slots whose bright siblings make a normal/bright pair. */
const NORMAL_HUE_SLOTS = ['base08', 'base0A', 'base0B', 'base0C', 'base0D', 'base0E'] as const

/**
 * Moves every hue in a palette by one common lightness step, so a hue set authored
 * against one canvas becomes legible on another.
 *
 * This exists because a composition can put a palette's hues on somebody else's
 * background. GitHub's dark hues measure between 2.5:1 and 4.1:1 on a light canvas —
 * fine as accents, unusable as terminal text — and repairing each hue *independently*
 * to the floor destroys the thing that makes an ANSI palette an ANSI palette: the
 * bright variants would converge onto their normal siblings, because a bright variant
 * differs from its normal one mainly in lightness and the repair would land them all
 * on the same lightness.
 *
 * Moving the group by one step instead transposes the whole set: every hue keeps its
 * angle and chroma exactly, every relative lightness is preserved, and the palette
 * stays internally consistent. The step is the smallest one that brings every *normal*
 * hue to the floor, measured in the canonical form the catalogue commits so that
 * rounding cannot push one back under.
 */
function transposeHues(
  themeId: string,
  palette: Record<Base24Slot, Oklch>,
  floor: number,
  findings: NormalizationFinding[]
): Partial<Record<Base24Slot, Oklch>> {
  const background = palette.base00
  const worst = (step: number): number =>
    Math.min(
      ...NORMAL_HUE_SLOTS.map((slot) =>
        contrastRatio(canonical(shiftLightness(palette[slot], step)), background)
      )
    )

  const initial = worst(0)
  if (initial >= floor) return {}

  // Both directions are tried, nearest first, as in `repairContrast`: a dark canvas
  // needs its hues lightened and a light canvas needs them darkened, and a palette
  // moved to the other kind of canvas is the whole point of the operation.
  const step = 0.002
  let chosen: number | undefined
  for (let index = 1; index <= Math.floor(0.45 / step) && chosen === undefined; index += 1) {
    for (const direction of [1, -1] as const) {
      const candidate = step * index * direction
      const probe = shiftLightness(palette[NORMAL_HUE_SLOTS[0]], candidate)
      if (probe.l <= 0.02 || probe.l >= 0.98) continue
      if (worst(candidate) >= floor) {
        chosen = candidate
        break
      }
    }
  }

  if (chosen === undefined) {
    findings.push({
      themeId,
      role: 'hues',
      kind: 'budget-exceeded',
      message: `no single lightness step brings every hue to ${floor}:1 against the canvas`,
    })
    return {}
  }

  findings.push({
    themeId,
    role: 'hues',
    kind: 'repaired',
    message: `transposed all ${CHROMATIC_SLOTS.length} hue slots by ${chosen.toFixed(3)} in lightness to reach ${floor}:1 on the borrowed canvas; hue and chroma unchanged`,
  })

  return Object.fromEntries(
    CHROMATIC_SLOTS.map((slot) => [slot, shiftLightness(palette[slot], chosen as number)])
  ) as Partial<Record<Base24Slot, Oklch>>
}

/** The catalogued result of normalizing one source. */
export interface NormalizedTheme {
  record: AdeaThemeRecord
  findings: NormalizationFinding[]
}

/**
 * Normalizes one source into a catalogue entry.
 *
 * Pure: the same inputs always produce the same theme and the same findings, which
 * is what lets the committed catalogue be regenerated and diffed in CI.
 */
export function normalizeTheme(source: ThemeSourceSpec): NormalizedTheme {
  const findings: NormalizationFinding[] = []
  const vendored = parseBase24Palette(source.scheme.palette)

  // Corrections are applied to the palette before anything derives from it, so the
  // surface ladder, the accent and every floor are computed from the value that
  // will actually ship. Correcting the output instead would leave the ladder built
  // around a background that is not the background.
  const palette: Record<Base24Slot, Oklch> = { ...vendored }
  for (const [slot, value] of Object.entries(source.palette ?? {})) {
    const parsed = parseColor(value as string)
    if (!parsed) throw new Error(`${source.id}: palette correction for ${slot} is not a colour`)
    palette[slot as Base24Slot] = parsed
    findings.push({
      themeId: source.id,
      role: slot,
      kind: 'substituted',
      message: `replaced the vendored ${slot} with the upstream project's own value`,
    })
  }

  // The hue transpose, applied at the same stage as the corrections and for the same
  // reason: the semantic roles derive from these slots, so transposing afterwards
  // would leave `error` built from the untransposed red and the two disagreeing.
  if (source.hueTranspose) {
    const transposed = transposeHues(source.id, palette, source.hueTranspose.floor, findings)
    for (const [slot, value] of Object.entries(transposed)) {
      palette[slot as Base24Slot] = value
    }
  }

  const background = palette.base00

  const appearance: ThemeAppearance = ladderDirection(background) === 1 ? 'dark' : 'light'
  if (appearance !== source.appearance) {
    findings.push({
      themeId: source.id,
      role: 'appearance',
      kind: 'substituted',
      message: `declared ${source.appearance} but the canvas measures ${appearance}; used the measurement`,
    })
  }

  const direction = ladderDirection(background)

  const surface = surfaceRung(background, SURFACE_STEPS.surface, direction)
  const surfaceElevated = surfaceRung(background, SURFACE_STEPS.surfaceElevated, direction)
  const surfaceHover = surfaceRung(background, SURFACE_STEPS.surfaceHover, direction)
  const surfaceActive = surfaceRung(background, SURFACE_STEPS.surfaceActive, direction)

  /**
   * Every surface a foreground role can be drawn on.
   *
   * The interaction rungs are excluded: text is not placed on a hover fill without
   * the component also choosing a foreground for it, and holding every role to the
   * furthest rung would compress the whole palette for a case that does not occur.
   */
  const surfaces = [background, surface, surfaceElevated]

  const colors: AdeaThemeColors = {
    background: formatOklch(background),
    foreground: formatOklch(palette.base05),
    surface: formatOklch(surface),
    surfaceElevated: formatOklch(surfaceElevated),
    surfaceHover: formatOklch(surfaceHover),
    surfaceActive: formatOklch(surfaceActive),
    border: formatOklch({
      ...surfaceRung(background, 0.15, direction),
      c: Math.min(0.05, background.c * 0.9),
    }),
    borderMuted: formatOklch({
      ...surfaceRung(background, 0.095, direction),
      c: Math.min(0.04, background.c * 0.6),
    }),
    text: formatOklch(palette.base05),
    textMuted: '',
    textSubtle: '',
    accent: '',
    accentForeground: '',
    success: '',
    warning: '',
    error: '',
    info: '',
  }

  // Body text first: several palettes publish a foreground that fails on their own
  // background, and every other role's floors are measured against the canvas.
  const textRepair = repairAcrossSurfaces(
    palette.base05,
    surfaces,
    CONTRAST_FLOORS.text,
    REPAIR_BUDGET.text
  )
  const text = emit(source.id, 'text', textRepair, CONTRAST_FLOORS.text)
  colors.text = text.value
  colors.foreground = text.value
  if (text.finding) findings.push(text.finding)

  // Muted and subtle text are blends toward the canvas, then measured. Blending in
  // OKLCH rather than alpha-compositing keeps the result a real colour that CSS can
  // use without a backdrop.
  const mutedRepair = repairAcrossSurfaces(
    mix(textRepair.color, background, 0.32),
    surfaces,
    CONTRAST_FLOORS.textMuted,
    0.3
  )
  const muted = emit(source.id, 'textMuted', mutedRepair, CONTRAST_FLOORS.textMuted)
  colors.textMuted = muted.value
  if (muted.finding) findings.push(muted.finding)

  /*
   * The ladder is derived in order — body, secondary, tertiary — and each rung is
   * held to being dimmer than the one above it.
   *
   * Sourcing the tertiary rung from `base03` is faithful to Base24, which defines that
   * slot as comments and invisibles, and for most palettes it is exactly right: the
   * value the author chose for dim text. But a few publish a `base03` that is not a dim
   * grey at all — Solarized's light scheme carries its near-black `base03`, Nord Light's
   * is a mid slate — and taking it on trust produced a *tertiary* role that was the
   * most prominent text on the screen, at 13.9:1 against a canvas whose body text
   * measures 5.5:1. So the slot is used when it cooperates and a blend replaces it when
   * it does not, and either way the rung is reported.
   */
  const mutedContrast = contrastRatio(mutedRepair.color, background)
  const fromPalette = repairAcrossSurfaces(
    palette.base03,
    surfaces,
    CONTRAST_FLOORS.textSubtle,
    0.3
  )
  const paletteSubtleContrast = contrastRatio(fromPalette.color, background)

  const subtleFromPalette = paletteSubtleContrast < mutedContrast
  const subtleRepair =
    subtleFromPalette
      ? fromPalette
      : repairAcrossSurfaces(
          mix(textRepair.color, background, 0.55),
          surfaces,
          CONTRAST_FLOORS.textSubtle,
          0.3
        )

  const subtle = emit(source.id, 'textSubtle', subtleRepair, CONTRAST_FLOORS.textSubtle)
  colors.textSubtle = subtle.value
  if (subtle.finding) findings.push(subtle.finding)
  if (!subtleFromPalette) {
    findings.push({
      themeId: source.id,
      role: 'textSubtle',
      kind: 'substituted',
      message: `base03 measures ${paletteSubtleContrast.toFixed(1)}:1, no dimmer than textMuted's ${mutedContrast.toFixed(1)}:1, so the tertiary rung is a blend rather than the palette's comment colour`,
    })
  }

  /**
   * The status roles, each with fallback candidates.
   *
   * A palette's yellow is chosen to be *a* yellow, not to be legible as text — Ayu
   * Light's `#ffcc66` measures 1.9:1 on its own near-white canvas, and no amount of
   * lightness repair fixes that without turning it into olive, which is no longer
   * Ayu. So each status role has candidates and takes the first that clears the
   * floor: warnings fall back to the palette's orange slot, which is Base24's
   * constants colour and in practice the warning colour this palette already uses;
   * reds and greens fall back to their bright variants.
   *
   * The order is not "brightest first" — on a light canvas the bright variants are
   * worse, so the declared ANSI colour is always tried before its bright sibling.
   */
  /*
   * Body text gets enough headroom above the secondary rung to stay the stronger of the
   * two.
   *
   * The secondary rung is repaired against the *raised* surfaces, which is the binding
   * constraint, so on a palette whose foreground is itself only a little above the floor
   * the repair can push secondary text past the body text — Tokyo Night Day came out
   * with 5.6:1 for a caption and 5.5:1 for the paragraph, which collapses the two roles
   * into one. The fix is to give the body text room rather than to weaken the secondary
   * floor, and it is a small move: the foreground is already above its own floor, so this
   * only ever fires on a palette that was already tight.
   */
  const bodyContrast = contrastRatio(textRepair.color, background)
  const mutedAgainstCanvas = contrastRatio(mutedRepair.color, background)
  if (mutedAgainstCanvas + MINIMUM_LADDER_GAP > bodyContrast) {
    const lifted = repairAcrossSurfaces(
      textRepair.color,
      surfaces,
      mutedAgainstCanvas + MINIMUM_LADDER_GAP,
      REPAIR_BUDGET.text
    )
    if (lifted.satisfied) {
      colors.text = formatOklch(lifted.color)
      colors.foreground = colors.text
      findings.push({
        themeId: source.id,
        role: 'text',
        kind: 'repaired',
        message: `lightness moved a further ${lifted.delta.toFixed(3)} so body text (${lifted.ratio.toFixed(1)}:1) stays clear of the secondary rung (${mutedAgainstCanvas.toFixed(1)}:1)`,
      })
    }
  }

  const statusCandidates = {
    error: [palette.base08, palette.base12],
    success: [palette.base0B, palette.base14],
    warning: [palette.base0A, palette.base09],
    info: [palette.base0C, palette.base0D],
  } as const

  for (const [role, candidates] of Object.entries(statusCandidates)) {
    const key = role as 'error' | 'success' | 'warning' | 'info'
    let chosen: { repair: ContrastRepair; blended: boolean } | undefined

    for (const candidate of candidates) {
      // Two tiers, applied in sequence: the body floor on the canvas, then the
      // indicator floor on the raised surfaces. Both push the colour the same way,
      // so applying the second to the result of the first cannot undo it.
      //
      // The blend anchor is the *repaired* text colour rather than the palette's
      // raw foreground: when a palette's own body text fails the floor on a raised
      // surface, blending toward the raw value inherits that failure and the blend
      // has no valid endpoint.
      const onCanvas = repairRole(
        candidate,
        [background],
        textRepair.color,
        CONTRAST_FLOORS.status,
        REPAIR_BUDGET.status
      )
      if (!onCanvas.repair.satisfied) {
        if (!chosen || onCanvas.repair.ratio > chosen.repair.ratio) chosen = onCanvas
        continue
      }

      const onRaised = repairRole(
        onCanvas.repair.color,
        surfaces.slice(1),
        textRepair.color,
        CONTRAST_FLOORS.statusRaised,
        REPAIR_BUDGET.status
      )
      const combined: { repair: ContrastRepair; blended: boolean } = {
        repair: {
          color: onRaised.repair.color,
          ratio: onRaised.repair.ratio,
          delta: onCanvas.repair.delta + onRaised.repair.delta,
          satisfied: onRaised.repair.satisfied,
        },
        blended: onCanvas.blended || onRaised.blended,
      }

      if (combined.repair.satisfied) {
        chosen = combined
        break
      }
      if (!chosen || combined.repair.ratio > chosen.repair.ratio) chosen = combined
    }

    const result = emit(source.id, key, chosen!.repair, CONTRAST_FLOORS.statusRaised, chosen!.blended)
    colors[key] = result.value
    if (result.finding) findings.push(result.finding)
    if (chosen!.blended) {
      findings.push({
        themeId: source.id,
        role: key,
        kind: 'repaired',
        message: `blended ${(chosen!.repair.delta * 100).toFixed(0)}% toward the theme's own foreground; lightness alone could not reach the floors`,
      })
    }
  }

  const ramp = buildAnsiRamp(palette, background, appearance)

  const ansi: AdeaAnsi = {
    black: formatOklch(ramp.black),
    red: formatOklch(palette.base08),
    green: formatOklch(palette.base0B),
    yellow: formatOklch(palette.base0A),
    blue: formatOklch(palette.base0D),
    magenta: formatOklch(palette.base0E),
    cyan: formatOklch(palette.base0C),
    white: formatOklch(ramp.white),
    brightBlack: formatOklch(ramp.brightBlack),
    brightRed: formatOklch(palette.base12),
    brightGreen: formatOklch(palette.base14),
    brightYellow: formatOklch(palette.base13),
    brightBlue: formatOklch(palette.base16),
    brightMagenta: formatOklch(palette.base17),
    brightCyan: formatOklch(palette.base15),
    brightWhite: formatOklch(ramp.brightWhite),
  }

  const ansiColors = Object.fromEntries(
    Object.entries(ansi).map(([key]) => [key, palette[ansiToSlot(key, palette, ramp)]])
  ) as Record<AnsiKey, Oklch>

  const accent = chooseAccent(source.id, ansiColors, surfaces, source.accentSlot, textRepair.color)
  findings.push(...accent.findings)
  colors.accent = formatOklch(accent.repair.color)
  if (accent.repair.delta > 0) {
    findings.push({
      themeId: source.id,
      role: 'accent',
      kind: 'repaired',
      message: `lightness moved ${accent.repair.delta.toFixed(3)} to reach ${CONTRAST_FLOORS.accent}:1 against the canvas`,
    })
  }

  const accentForeground = chooseAccentForeground(source.id, accent.repair.color, palette)
  colors.accentForeground = formatOklch(accentForeground.value)
  findings.push(...accentForeground.findings)

  /*
   * The selection is the palette's own where the source declares one, and the floor
   * applies to it either way.
   *
   * A composition can carry its structure donor's selection explicitly, and taking that
   * on trust is how Adea Light shipped a selection measuring 1.11:1 against its own
   * canvas — Nord's is deliberately subtle, and subtle is not the same as invisible. An
   * invisible selection is a functional defect rather than a matter of taste: the user
   * cannot see what they have selected. So the declared value is used as given and still
   * measured, and moving it is reported.
   *
   * The cursor is deliberately *not* treated this way. It has no floor — a cursor is an
   * affordance rather than text, and several palettes in the catalogue give it a colour
   * of its own — so the adapters derive a legible glyph for it instead
   * (see `adapters/xterm.ts`).
   */
  const declaredSelection = source.selection ? parseColor(source.selection) : undefined
  const selectionRepair = repairContrast(
    declaredSelection ?? (palette.base02 as Oklch),
    background,
    CONTRAST_FLOORS.selection,
    0.5
  )
  const selection = emit(source.id, 'selection', selectionRepair, CONTRAST_FLOORS.selection)
  if (selection.finding) findings.push(selection.finding)

  // Authored overrides, applied last so they win over derivation. They go through
  // the same conversion as every derived value: the catalogue's contract is that a
  // role is an `oklch()` string, and an override written as hex in the source list
  // must not be the one place that contract leaks.
  if (source.colors) {
    for (const [role, value] of Object.entries(source.colors)) {
      colors[role as keyof AdeaThemeColors] = authoredColor(source.id, role, value as string)
    }
  }
  if (source.ansi) {
    for (const [role, value] of Object.entries(source.ansi)) {
      ansi[role as AnsiKey] = authoredColor(source.id, role, value as string)
    }
  }

  return {
    record: {
      id: source.id,
      name: source.name,
      appearance,
      colors,
      ansi,
      cursor: source.cursor
        ? authoredColor(source.id, 'cursor', source.cursor)
        : formatOklch(palette.base05),
      // The repaired value, not the declared one: `selectionRepair` above started from
      // whatever the source declared.
      selection: selection.value,
      family: source.family,
      familyLabel: source.familyLabel,
      label: source.label,
      description: source.description,
      provenance: source.provenance ?? { project: '', url: '', license: '' },
      tags: source.tags,
    },
    findings,
  }
}

/** Parses an authored value and re-serialises it in the catalogue's notation. */
function authoredColor(themeId: string, role: string, value: string): string {
  const parsed = parseColor(value)
  if (!parsed) throw new Error(`${themeId}: ${role} is not a colour: ${value}`)
  return formatOklch(parsed)
}

/** Maps an ANSI role back to the Base24 slot it was read from. */
function ansiToSlot(
  role: string,
  palette: Record<Base24Slot, Oklch>,
  ramp: { black: Oklch; white: Oklch; brightBlack: Oklch; brightWhite: Oklch }
): Base24Slot {
  const direct: Record<string, Base24Slot> = {
    red: 'base08',
    green: 'base0B',
    yellow: 'base0A',
    blue: 'base0D',
    magenta: 'base0E',
    cyan: 'base0C',
    brightRed: 'base12',
    brightYellow: 'base13',
    brightGreen: 'base14',
    brightCyan: 'base15',
    brightBlue: 'base16',
    brightMagenta: 'base17',
  }
  const slot = direct[role]
  if (slot) return slot

  const rampSlots: Record<string, Oklch> = {
    black: ramp.black,
    white: ramp.white,
    brightBlack: ramp.brightBlack,
    brightWhite: ramp.brightWhite,
  }
  const target = rampSlots[role]
  if (!target) return 'base05'
  const match = (Object.keys(palette) as Base24Slot[]).find(
    (candidate) => deltaEok(palette[candidate], target) < 1e-9
  )
  return match ?? 'base05'
}

/** Re-exported so the normalizer's callers do not need a second import. */
export { contrastDirection }
