/**
 * The catalogue's policy: the contrast floors, the repair budgets and the accent
 * preference.
 *
 * Kept apart from the normalizer, which applies them, so that the accent axis —
 * which the normalizer now consults to fit the interaction rungs around the primary
 * tint — can read the same numbers without the two modules importing each other.
 * `normalize.ts` re-exports everything here.
 */

import type { AnsiKey } from './schema.js'

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
export const REPAIR_BUDGET = Object.freeze({
  /** Body text: some palettes publish a foreground that fails on their own canvas. */
  text: 0.2,
  status: 0.24,
  accent: 0.24,
})

/** The accent preference order, best first. */
export const ACCENT_PREFERENCE = [
  'blue',
  'magenta',
  'cyan',
  'green',
] as const satisfies readonly AnsiKey[]

/** The smallest chroma a colour needs before it reads as "a colour" rather than grey. */
export const MINIMUM_ACCENT_CHROMA = 0.035
