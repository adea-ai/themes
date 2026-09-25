import { describe, expect, test } from 'bun:test'

import {
  ANSI_KEYS,
  THEME_COLOR_KEYS,
  contrastRatio,
  formatFindings,
  parseColor,
  themes,
  validateCatalogue,
  validateTheme,
} from '../src'
import { CONTRAST_FLOORS } from '../src/normalize'

/**
 * The catalogue's gate.
 *
 * This is what lets the catalogue hold other people's palettes without anyone
 * hand-checking a colour: a theme either clears the floors or the build fails with
 * the pairing and the number. That is the difference between a catalogue and a pile
 * of colour schemes.
 */
describe('catalogue contrast', () => {
  test('every theme clears every floor', () => {
    const findings = validateCatalogue(themes)

    expect(
      formatFindings(findings),
      'A theme in the catalogue has a pairing below its floor. Fix the value or drop the theme — ' +
        'the floors are the reason the catalogue can accept external palettes at all.'
    ).toBe('')
  })

  test('the floors are the ones the tests measure against', () => {
    // Guards against a floor being relaxed to make a failure go away, which is the
    // one edit that would make the test above pass while making the catalogue worse.
    expect(CONTRAST_FLOORS.text).toBe(4.5)
    expect(CONTRAST_FLOORS.textMuted).toBe(4.5)
    expect(CONTRAST_FLOORS.textSubtle).toBe(3)
    expect(CONTRAST_FLOORS.accent).toBe(4.5)
    expect(CONTRAST_FLOORS.status).toBe(4.5)
  })
})

/** Reads the lightness out of a canonical `oklch()` string. */
function lightness(value: string): number {
  return Number(/oklch\(([\d.]+)/.exec(value)?.[1])
}

describe('catalogue shape', () => {
  test('ids are unique', () => {
    const ids = themes.map((theme) => theme.id)
    expect(ids.toSorted()).toEqual([...new Set(ids)].toSorted())
  })

  test('the catalogue covers both appearances', () => {
    const light = themes.filter((theme) => theme.appearance === 'light').length
    const dark = themes.filter((theme) => theme.appearance === 'dark').length

    // A catalogue that is all dark leaves a light-theme user with one option.
    expect(light).toBeGreaterThanOrEqual(4)
    expect(dark).toBeGreaterThanOrEqual(4)
  })

  test('every theme sets every role the schema declares', () => {
    for (const theme of themes) {
      for (const role of THEME_COLOR_KEYS) {
        expect(theme.colors[role], `${theme.id} leaves colors.${role} empty`).toBeTruthy()
      }
      for (const role of ANSI_KEYS) {
        expect(theme.ansi[role], `${theme.id} leaves ansi.${role} empty`).toBeTruthy()
      }
      expect(theme.cursor, `${theme.id} leaves cursor empty`).toBeTruthy()
      expect(theme.selection, `${theme.id} leaves selection empty`).toBeTruthy()
    }
  })

  test('every theme records its provenance and licence', () => {
    const missing = themes
      .filter(
        (theme) =>
          !theme.provenance.url ||
          !theme.provenance.license ||
          !theme.provenance.project
      )
      .map((theme) => theme.id)

    expect(missing).toEqual([])
  })

  test('the declared appearance matches the canvas', () => {
    // A light theme with a dark canvas is the defect that makes a dialog render
    // white-on-white, and it is invisible in a diff.
    for (const theme of themes) {
      const canvas = lightness(theme.colors.background)
      expect(canvas, `${theme.id} has an unreadable background`).toBeFinite()
      if (theme.appearance === 'dark') expect(canvas).toBeLessThanOrEqual(0.5)
      else expect(canvas).toBeGreaterThan(0.5)
    }
  })

  test('the default dark theme is not a near-black canvas', () => {
    const adeaDark = themes.find((theme) => theme.id === 'adea-dark')
    expect(adeaDark).toBeDefined()

    // A dark theme whose canvas is almost black is the most common way a dark
    // interface is made unpleasant, and it is a rule this system has held since the
    // first theme file.
    expect(lightness(adeaDark!.colors.background)).toBeGreaterThan(0.1)
  })

  test('the surface ladder ascends away from the canvas', () => {
    for (const theme of themes) {
      const background = lightness(theme.colors.background)
      const rungs = (['surface', 'surfaceElevated', 'surfaceHover', 'surfaceActive'] as const).map(
        (role) => lightness(theme.colors[role])
      )

      const direction = theme.appearance === 'dark' ? 1 : -1
      let previous = background
      for (const [index, rung] of rungs.entries()) {
        // Non-decreasing rather than strictly ascending: a light theme may convey
        // elevation with a border and a shadow instead of a fill, and Adea's own
        // light theme deliberately does. What must never happen is a rung that
        // *descends* toward the canvas, which reads as a pressed surface.
        const step = (rung - previous) * direction
        expect(
          step,
          `${theme.id} rung ${index} descends toward the canvas`
        ).toBeGreaterThanOrEqual(-1e-9)
        previous = rung
      }

      // The interaction rungs are the ones that must be visible as feedback, so
      // they are held to the perceptibility floor even when the static ones are flat.
      for (const role of ['surfaceHover', 'surfaceActive'] as const) {
        const ratio = contrastRatio(
          parseColor(theme.colors[role])!,
          parseColor(theme.colors.background)!
        )
        expect(ratio, `${theme.id} ${role} is indistinguishable from the canvas`).toBeGreaterThanOrEqual(
          CONTRAST_FLOORS.surface * 0.7
        )
      }
    }
  })
})

describe('validator behaviour', () => {
  test('a theme with a legibility failure is reported, not silently repaired', () => {
    const broken = structuredClone(themes[0]!)
    broken.id = 'broken'
    // Body text on its own canvas, at the worst possible contrast.
    broken.colors.text = broken.colors.background

    const findings = validateTheme(broken)
    expect(findings.length).toBeGreaterThan(0)
    expect(formatFindings(findings)).toContain('broken')
  })
})
