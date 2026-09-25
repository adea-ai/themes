import { describe, expect, test } from 'bun:test'

import { getTheme, themes } from '../src'
import { oklchToHex, parseColor } from '../src/oklch'

/**
 * The catalogue claims to hold *other people's palettes*, and this file is what
 * makes that claim checkable.
 *
 * Every value below was read from the upstream project's own published palette — the
 * background and foreground each project's documentation and source files state —
 * and the assertion is that the catalogue reproduces it exactly. Without this, a
 * refresh that pulled the wrong slug, or a normalizer change that quietly rewrote a
 * background, would produce a catalogue that still passed every contrast test while
 * no longer being the theme it says it is. "Catppuccin Mocha" that is not
 * Catppuccin Mocha is a worse failure than an unreadable colour.
 *
 * The foreground is asserted loosely for some families: several projects state a
 * foreground that their own background fails against, and the normalizer is allowed
 * to repair it (Solarized Light is the clearest case, at 4.28:1 upstream). Those
 * entries assert the hue instead, so the theme stays recognisable while the repair
 * stays permitted.
 */
type Fidelity = {
  id: string
  /** The project's own background, from its published palette. */
  background: string
  /** The project's own foreground, or undefined when the repair changes it. */
  foreground?: string
  /**
   * The upstream foreground's *hue*, asserted within a degree, for a foreground the
   * normalizer repairs.
   *
   * The repair is a lightness move, and a lightness move in OKLCH preserves hue and
   * chroma exactly — so this is a stronger assertion than a hue *range* would be: it
   * says the value that shipped is the palette's own colour, viewed at a different
   * brightness, and not a blend of it with something else. Solarized Light's
   * foreground is the case that needs it, at 4.28:1 upstream.
   */
  foregroundHue?: number
  /** A hue the family is known for, asserted so a repair cannot erase the identity. */
  signature?: { role: 'accent' | 'ansi.green' | 'ansi.blue' | 'ansi.magenta' | 'ansi.cyan'; hue: [number, number] }
}

const FIDELITY: readonly Fidelity[] = Object.freeze([
  // Catppuccin's four flavours. Backgrounds and foregrounds as published.
  { id: 'catppuccin-latte', background: '#eff1f5', foreground: '#4c4f69', signature: { role: 'ansi.magenta', hue: [320, 345] } },
  { id: 'catppuccin-frappe', background: '#303446', foreground: '#c6d0f5' },
  { id: 'catppuccin-macchiato', background: '#24273a', foreground: '#cad3f5' },
  { id: 'catppuccin-mocha', background: '#1e1e2e', foreground: '#cdd6f4', signature: { role: 'ansi.blue', hue: [250, 270] } },

  // Tokyo Night.
  { id: 'tokyonight-night', background: '#1a1b26', foreground: '#c0caf5' },
  { id: 'tokyonight-storm', background: '#24283b', foreground: '#c0caf5' },
  { id: 'tokyonight-day', background: '#e1e2e7', foregroundHue: 264.1 },

  // Rosé Pine. Its signature is iris, which the accent must still be.
  { id: 'rosepine', background: '#191724', foreground: '#e0def4', signature: { role: 'accent', hue: [290, 320] } },
  { id: 'rosepine-moon', background: '#232136', foreground: '#e0def4', signature: { role: 'accent', hue: [290, 320] } },
  { id: 'rosepine-dawn', background: '#faf4ed', foreground: '#575279', signature: { role: 'accent', hue: [290, 320] } },

  // Gruvbox's warm ground.
  { id: 'gruvbox-dark', background: '#282828', foreground: '#ebdbb2' },
  { id: 'gruvbox-light', background: '#fbf1c7', foreground: '#3c3836' },

  // Nord's polar blue-grey.
  { id: 'nord', background: '#2e3440', foreground: '#d8dee9', signature: { role: 'ansi.blue', hue: [240, 260] } },

  // Dracula.
  { id: 'dracula', background: '#282a36', foreground: '#f8f8f2', signature: { role: 'accent', hue: [295, 315] } },

  // One Dark, asserted against *Atom's* palette rather than the terminal port's
  // darker canvas. See `ONE_DARK_OFFICIAL` in `src/sources.ts`.
  { id: 'one-dark', background: '#282c34', foreground: '#abb2bf' },

  // Solarized. The light foreground is repaired (4.28:1 upstream), so the hue is
  // asserted instead of the value.
  { id: 'solarized-dark', background: '#002b36', foregroundHue: 205.3 },
  { id: 'solarized-light', background: '#fdf6e3', foregroundHue: 221.9 },

  // Everforest's forest ground.
  { id: 'everforest-dark', background: '#232a2e', foreground: '#d3c6aa', signature: { role: 'accent', hue: [100, 145] } },
  { id: 'everforest-light', background: '#efebd4', foregroundHue: 232.9, signature: { role: 'accent', hue: [100, 160] } },

  // Ayu's three variants.
  { id: 'ayu', background: '#0b0e14', foreground: '#bfbdb6' },
  { id: 'ayu-mirage', background: '#1f2430', foreground: '#cccac2' },
  { id: 'ayu-light', background: '#f8f9fa', foreground: '#5c6166' },

  // Kanagawa's sumi ink.
  { id: 'kanagawa', background: '#1f1f28', foreground: '#dcd7ba', signature: { role: 'accent', hue: [250, 275] } },

  // Vesper.
  { id: 'vesper', background: '#101010', foreground: '#ffffff' },

  // Monokai's olive ground.
  { id: 'monokai', background: '#272822', signature: { role: 'accent', hue: [285, 310] } },

  // Adea's own two, which are authored here rather than imported. Asserted so that a
  // change to the authored ramp is a deliberate edit to this file rather than a
  // silent shift in the product's appearance.
  { id: 'adea-light', background: '#ffffff', foreground: '#252525' },
  { id: 'adea-dark', background: '#252525', foreground: '#fcfcfc' },
])

function resolve(theme: ReturnType<typeof getTheme>, role: Fidelity['signature'] extends never ? never : string): string | undefined {
  if (!theme) return undefined
  const [group, key] = role.split('.')
  if (key) {
    const bucket = (theme as unknown as Record<string, Record<string, string>>)[group as string]
    return bucket?.[key]
  }
  if (group === 'accent') return theme.colors.accent
  return undefined
}

describe('upstream fidelity', () => {
  test('every catalogued theme is listed here', () => {
    // A new theme cannot be added without recording where its colours come from.
    const listed = new Set(FIDELITY.map((entry) => entry.id))
    const missing = themes.map((theme) => theme.id).filter((id) => !listed.has(id))
    expect(missing, 'these themes have no fidelity assertion').toEqual([])
  })

  for (const entry of FIDELITY) {
    test(`${entry.id} reproduces its upstream palette`, () => {
      const theme = getTheme(entry.id)
      expect(theme, `${entry.id} is not in the catalogue`).toBeDefined()

      expect(
        oklchToHex(parseColor(theme!.colors.background)!),
        `${entry.id} background differs from upstream`
      ).toBe(entry.background)

      if (entry.foreground) {
        expect(
          oklchToHex(parseColor(theme!.colors.foreground)!),
          `${entry.id} foreground differs from upstream`
        ).toBe(entry.foreground)
      }

      if (entry.foregroundHue !== undefined) {
        const hue = parseColor(theme!.colors.foreground)!.h
        expect(
          Math.abs(hue - entry.foregroundHue),
          `${entry.id} foreground hue drifted to ${hue.toFixed(1)} from the upstream ${entry.foregroundHue}; ` +
            'the contrast repair is allowed to change lightness, not hue'
        ).toBeLessThanOrEqual(1)
      }
    })

    const signature = entry.signature
    if (signature) {
      test(`${entry.id} keeps its signature hue`, () => {
        const theme = getTheme(entry.id)!
        const value = resolve(theme, signature.role)
        expect(value, `${entry.id} has no ${signature.role}`).toBeDefined()
        const [low, high] = signature.hue
        const hue = parseColor(value!)!.h
        expect(
          hue,
          `${entry.id}'s ${signature.role} has hue ${hue.toFixed(1)}, outside ${low}–${high}; a repair has cost the theme its identity`
        ).toBeGreaterThanOrEqual(low)
        expect(hue).toBeLessThanOrEqual(high)
      })
    }
  }
})

describe('provenance', () => {
  test('every family records a project, a URL and an SPDX licence', () => {
    for (const theme of themes) {
      expect(theme.provenance.project, `${theme.id} has no project`).toBeTruthy()
      expect(theme.provenance.url, `${theme.id} has no url`).toMatch(/^https:\/\//)
      expect(theme.provenance.license, `${theme.id} has no licence`).toMatch(/^[A-Za-z0-9.\-+]+$/)
    }
  })

  test('every imported theme records what its values were bootstrapped from', () => {
    // Adea's own theme is authored, so it is the only one without a chain.
    const imported = themes.filter((theme) => theme.family !== 'adea')
    for (const theme of imported) {
      expect(
        theme.provenance.bootstrappedFrom?.length ?? 0,
        `${theme.id} does not record where its values came from`
      ).toBeGreaterThan(0)
    }
  })

  test('only permissively licensed families are present', () => {
    const allowed = new Set(['MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC', '0BSD'])
    for (const theme of themes) {
      expect(allowed.has(theme.provenance.license), `${theme.id} is ${theme.provenance.license}`).toBe(true)
    }
  })
})
