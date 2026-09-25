import { describe, expect, test } from 'bun:test'

import { ACCENTS, ACCENT_HOVER_STEP, accentForegroundContrast, accentRoles, getAccent } from '../src'
import { contrastRatio, parseColor, shiftLightness } from '../src/oklch'

/**
 * The accent axis.
 *
 * The invariant worth pinning is the *hover direction*: a hovered primary moves away
 * from the canvas, so a button lifts rather than recedes. It was wrong in a consumer
 * for as long as the rule lived in two places — the generated default mixed toward
 * the canvas while every hand-written accent moved away — and nothing failed, because
 * every existing check measured a static pairing and no linter has a rule for a hover.
 *
 * The canvases below are the two the consumer ships, since "away from the canvas" is
 * only meaningful against a canvas.
 */
/** The share of the primary a tint expression carries. */
function tintAlpha(value: string): number {
  return Number(/([\d.]+)%/.exec(value)![1])
}

const CANVAS = {
  light: parseColor('oklch(0.933 0.016 261.79)')!,
  dark: parseColor('oklch(0.1913 0 0)')!,
}

describe('the accent presets', () => {
  test('every preset has both appearances and a unique id', () => {
    const ids = new Set<string>()
    for (const preset of ACCENTS) {
      expect(preset.id, 'an id is required').toBeTruthy()
      expect(ids.has(preset.id), `${preset.id} is a duplicate`).toBe(false)
      ids.add(preset.id)
      expect(parseColor(preset.light), `${preset.id} light is unreadable`).toBeDefined()
      expect(parseColor(preset.dark), `${preset.id} dark is unreadable`).toBeDefined()
    }
  })

  test('the presets are lookups', () => {
    expect(getAccent('violet')?.label).toBe('Violet')
    expect(getAccent('nope')).toBeUndefined()
  })
})

describe('the accent label', () => {
  /**
   * The label is measured, not conventional — "white on a coloured fill" is about
   * 2.1:1 on the bright half of this set, which is why the pairs are designed to flip
   * polarity between appearances.
   */
  test('every accent clears the floor on its own fill, in both appearances', () => {
    for (const preset of ACCENTS) {
      for (const appearance of ['light', 'dark'] as const) {
        const measured = accentForegroundContrast(
          appearance === 'light' ? preset.light : preset.dark
        )
        expect(
          measured,
          `${preset.id} in the ${appearance} appearance carries a ${measured.toFixed(2)}:1 label`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  test('the polarity flips where the pair was designed to', () => {
    // The bright dark-mode accents take a black label; the deep light-mode ones take
    // a white one. If that ever stops being true the pairs have been retuned and this
    // test should be revisited rather than deleted.
    const violet = accentRoles(getAccent('violet')!, 'dark')
    expect(violet.primaryForeground).toBe('oklch(0 0 0)')
    const light = accentRoles(getAccent('violet')!, 'light')
    expect(light.primaryForeground).toBe('oklch(1 0 0)')
  })
})

describe('the accent hover', () => {
  test('every accent moves away from the canvas, in both appearances', () => {
    for (const preset of ACCENTS) {
      for (const appearance of ['light', 'dark'] as const) {
        const roles = accentRoles(preset, appearance)
        const primary = parseColor(roles.primary)!
        const hover = parseColor(roles.primaryHover)!
        const canvas = CANVAS[appearance]

        const primaryDistance = Math.abs(primary.l - canvas.l)
        const hoverDistance = Math.abs(hover.l - canvas.l)

        expect(
          hoverDistance,
          `${preset.id} in the ${appearance} appearance hovers toward the canvas: ` +
            `${primary.l.toFixed(3)} → ${hover.l.toFixed(3)}, canvas ${canvas.l.toFixed(3)}`
        ).toBeGreaterThan(primaryDistance)
      }
    }
  })

  /** The step is uniform, which is the reason it is not a `color-mix()`. */
  test('the step is the same size for every accent', () => {
    for (const preset of ACCENTS) {
      for (const appearance of ['light', 'dark'] as const) {
        const roles = accentRoles(preset, appearance)
        const primary = parseColor(roles.primary)!
        const hover = parseColor(roles.primaryHover)!
        expect(
          Math.abs(hover.l - primary.l),
          `${preset.id} in the ${appearance} appearance steps ${Math.abs(hover.l - primary.l)}`
        ).toBeCloseTo(ACCENT_HOVER_STEP, 2)
      }
    }
  })

  /** A hover that changes the hue is a different colour, not a state. */
  test('the step keeps the hue', () => {
    for (const preset of ACCENTS) {
      for (const appearance of ['light', 'dark'] as const) {
        const roles = accentRoles(preset, appearance)
        const primary = parseColor(roles.primary)!
        const hover = parseColor(roles.primaryHover)!
        expect(hover.h, `${preset.id} drifts hue on hover`).toBeCloseTo(primary.h, 0)
      }
    }
  })

  test('the hover is the step applied to the primary, and nothing else', () => {
    const preset = getAccent('violet')!
    const roles = accentRoles(preset, 'light')
    const expected = shiftLightness(parseColor(preset.light)!, -ACCENT_HOVER_STEP)
    const hover = parseColor(roles.primaryHover)!
    expect(hover.l).toBeCloseTo(expected.l, 4)
    expect(hover.c).toBeCloseTo(expected.c, 4)
  })

  /** A hovered button still has to carry its label. */
  test('the label stays legible on a hovered fill', () => {
    for (const preset of ACCENTS) {
      for (const appearance of ['light', 'dark'] as const) {
        const roles = accentRoles(preset, appearance)
        const measured = contrastRatio(
          parseColor(roles.primaryForeground)!,
          parseColor(roles.primaryHover)!
        )
        expect(
          measured,
          `${preset.id} in the ${appearance} appearance: ${measured.toFixed(2)}:1 on hover`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})

describe('the accent tint', () => {
  test('it is a mix over the primary, so it follows the primary', () => {
    for (const appearance of ['light', 'dark'] as const) {
      const roles = accentRoles(getAccent('violet')!, appearance)
      expect(roles.primarySubtle).toContain('var(--primary)')
      expect(roles.primarySubtle).toContain('transparent')
    }
  })

  /** A tint over a near-black surface needs more of the colour than over a near-white one. */
  test('the dark appearance carries more of the colour', () => {
    const light = accentRoles(getAccent('violet')!, 'light')
    const dark = accentRoles(getAccent('violet')!, 'dark')
    expect(tintAlpha(dark.primarySubtle)).toBeGreaterThan(tintAlpha(light.primarySubtle))
  })
})
