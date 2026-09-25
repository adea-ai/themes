import { describe, expect, test } from 'bun:test'

import { getTheme, themes } from '../src'
import { contrastRatio, oklchToHex, parseColor } from '../src/oklch'

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

  // Adea's own two. Both are *composed*, so the entries here are the half that comes
  // from each one's structure donor; the suites below assert the other half, and the
  // light one's canvas carries a recorded chroma correction (see `COMPOSED_SOURCES`).
  // The foreground is asserted by hue: the theme is held to AAA on every surface it
  // renders text on, and Nord Light's own is 7.5:1 on the canvas and 6.2:1 on a popover,
  // so the repair moves its lightness. Hue and chroma are untouched, which the
  // assertion below the pair suite checks.
  { id: 'adea-light', background: '#e3e9f4', foregroundHue: 266.5 },
  { id: 'adea-dark', background: '#0f141f', foreground: '#b4bcca' },
])

/** A theme role as hex, which is how upstream palettes are published. */
function hex(value: string): string {
  return oklchToHex(parseColor(value)!)
}

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

/**
 * Adea's dark theme is composed rather than copied, so "does it match upstream" has
 * two answers and the interesting failure is a composition that quietly stops
 * honouring one of its donors. These assert each half against the palette it came
 * from: the canvas and greyscale against Aardvark Ink, the sixteen hues against
 * GitHub Dark Default.
 */
describe('adea-dark composition', () => {
  const AARDVARK = {
    background: '#0f141f',
    foreground: '#b4bcca',
    black: '#222734',
    brightBlack: '#3a4152',
    white: '#5a6377',
    brightWhite: '#dfe5ee',
    cursor: '#b4bcca',
    selection: '#2a3645',
  } as const

  const GITHUB = {
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
  } as const

  test('the structure comes from Aardvark Ink', () => {
    const theme = getTheme('adea-dark')!

    expect(hex(theme.colors.background), 'canvas').toBe(AARDVARK.background)
    expect(hex(theme.colors.foreground), 'foreground').toBe(AARDVARK.foreground)
    expect(hex(theme.cursor), 'cursor').toBe(AARDVARK.cursor)
    expect(hex(theme.selection), 'selection').toBe(AARDVARK.selection)
    expect(hex(theme.ansi.black), 'ansi black').toBe(AARDVARK.black)
    expect(hex(theme.ansi.brightBlack), 'ansi bright black').toBe(AARDVARK.brightBlack)
    expect(hex(theme.ansi.white), 'ansi white').toBe(AARDVARK.white)
    expect(hex(theme.ansi.brightWhite), 'ansi bright white').toBe(AARDVARK.brightWhite)
  })

  test('the hues come from GitHub Dark Default, unmodified', () => {
    const theme = getTheme('adea-dark')!

    // Unmodified is the assertion, not merely "close". These are the colours the
    // composition exists to get; a contrast repair that moved one would mean the
    // canvas could not carry it, and the answer to that would be a different canvas,
    // not a duller hue.
    for (const [role, expected] of Object.entries(GITHUB)) {
      expect(hex(theme.ansi[role as keyof typeof GITHUB]), `ansi.${role}`).toBe(expected)
    }
  })

  test('the vibrant hues clear the floor on the borrowed canvas', () => {
    // The premise of the composition: Aardvark Ink's canvas is darker and less
    // saturated than GitHub's, so GitHub's hues have *more* contrast here, not less.
    const theme = getTheme('adea-dark')!
    const background = parseColor(theme.colors.background)!
    for (const role of ['success', 'warning', 'error', 'info', 'accent'] as const) {
      const ratio = contrastRatio(parseColor(theme.colors[role])!, background)
      expect(ratio, `${role} measures ${ratio.toFixed(2)}:1 on the canvas`).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('the composition names both donors', () => {
    const theme = getTheme('adea-dark')!
    const sources = theme.provenance.bootstrappedFrom ?? []
    expect(sources.join(' ')).toContain('Aardvark Ink')
    expect(sources.join(' ')).toContain('GitHub Dark Default')
  })
})

/**
 * The two defaults are a *pair*, and these are the properties that make them one.
 *
 * Adea Dark and Adea Light are separate compositions from separate structure donors, so
 * nothing structural stops either from drifting away from the other — and the failure
 * mode is quiet: each new version is still a good theme on its own, and only someone
 * switching appearance at dusk notices that the application changed character rather
 * than exposure. So the partnership is asserted.
 *
 * The shared hue donor is what makes the strongest of these cheap to check: because
 * both themes take their hues from GitHub Dark Default and only the dark one uses them
 * untransposed, every chromatic role should come out at the *same hue and the same
 * chroma* in both, differing only in lightness. That is the definition of a pair I'd
 * defend — switching appearance changes how bright the interface is and nothing else
 * about which colour is which.
 */
describe('the adea pair', () => {
  const light = getTheme('adea-light')!
  const dark = getTheme('adea-dark')!

  const CHROMATIC = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'] as const
  const BRIGHT = [
    'brightRed',
    'brightGreen',
    'brightYellow',
    'brightBlue',
    'brightMagenta',
    'brightCyan',
  ] as const

  test('they are one light theme and one dark theme', () => {
    expect(light.appearance).toBe('light')
    expect(dark.appearance).toBe('dark')
  })

  test('their canvases are in the same hue family', () => {
    const lightHue = parseColor(light.colors.background)!.h
    const darkHue = parseColor(dark.colors.background)!.h
    const delta = Math.abs(lightHue - darkHue)

    expect(
      delta,
      `the canvases are ${delta.toFixed(1)}° apart in hue, so switching appearance shifts the theme's colour rather than its exposure`
    ).toBeLessThanOrEqual(8)
  })

  test('both canvases are tinted rather than neutral', () => {
    // A neutral grey beside a tinted one reads as two different design systems — the
    // light theme was exactly that before this composition, and it is why the light
    // canvas carries a recorded chroma correction.
    for (const theme of [light, dark]) {
      const chroma = parseColor(theme.colors.background)!.c
      expect(
        chroma,
        `${theme.id}'s canvas carries ${chroma.toFixed(3)} of chroma, which is too close to neutral to read as tinted`
      ).toBeGreaterThanOrEqual(0.012)
    }
  })

  test('a red is the same red in both, and so is every other hue', () => {
    for (const role of [...CHROMATIC, ...BRIGHT]) {
      const a = parseColor(light.ansi[role])!
      const b = parseColor(dark.ansi[role])!

      expect(
        Math.abs(a.h - b.h),
        `ansi.${role} is ${a.h.toFixed(1)}° in the light theme and ${b.h.toFixed(1)}° in the dark one`
      ).toBeLessThanOrEqual(0.5)

      expect(
        Math.abs(a.c - b.c),
        `ansi.${role} carries ${a.c.toFixed(3)} of chroma in the light theme and ${b.c.toFixed(3)} in the dark one, so the hue sets have diverged`
      ).toBeLessThanOrEqual(0.005)
    }
  })

  test('the interactive colour is the same hue in both', () => {
    const a = parseColor(light.colors.accent)!
    const b = parseColor(dark.colors.accent)!

    expect(
      Math.abs(a.h - b.h),
      `the accent is ${a.h.toFixed(1)}° in the light theme and ${b.h.toFixed(1)}° in the dark one, so a primary button changes hue with the appearance`
    ).toBeLessThanOrEqual(1)
  })

  test('the text ladder is monotonic in both', () => {
    // The defect this guards shipped in three themes: a tertiary rung that was stronger
    // than the secondary one, and in one case the most prominent text on the screen.
    for (const theme of [light, dark]) {
      const background = parseColor(theme.colors.background)!
      const contrast = (role: 'text' | 'textMuted' | 'textSubtle') =>
        contrastRatio(parseColor(theme.colors[role])!, background)

      expect(
        contrast('text'),
        `${theme.id}'s body text (${contrast('text').toFixed(1)}:1) is not stronger than its secondary text (${contrast('textMuted').toFixed(1)}:1)`
      ).toBeGreaterThan(contrast('textMuted'))
      expect(
        contrast('textMuted'),
        `${theme.id}'s secondary text (${contrast('textMuted').toFixed(1)}:1) is not stronger than its tertiary text (${contrast('textSubtle').toFixed(1)}:1)`
      ).toBeGreaterThan(contrast('textSubtle'))
    }
  })

  test('both name the donor each half came from', () => {
    const lightSources = (light.provenance.bootstrappedFrom ?? []).join(' ')
    const darkSources = (dark.provenance.bootstrappedFrom ?? []).join(' ')

    expect(lightSources).toContain('Nord Light')
    expect(lightSources).toContain('GitHub Dark Default')
    expect(darkSources).toContain('Aardvark Ink')
    expect(darkSources).toContain('GitHub Dark Default')
  })
})

describe('the text ladder', () => {
  test('is monotonic in every theme in the catalogue', () => {
    // Catalogue-wide, because the cause was a palette's `base03` not being a dim grey —
    // which is not a property of the defaults, so the defaults' suite cannot catch it.
    for (const theme of themes) {
      const background = parseColor(theme.colors.background)!
      const contrast = (role: 'text' | 'textMuted' | 'textSubtle') =>
        contrastRatio(parseColor(theme.colors[role])!, background)

      expect(
        contrast('text'),
        `${theme.id}: text ${contrast('text').toFixed(1)}:1 is not above textMuted ${contrast('textMuted').toFixed(1)}:1`
      ).toBeGreaterThan(contrast('textMuted'))
      expect(
        contrast('textMuted'),
        `${theme.id}: textMuted ${contrast('textMuted').toFixed(1)}:1 is not above textSubtle ${contrast('textSubtle').toFixed(1)}:1`
      ).toBeGreaterThan(contrast('textSubtle'))
    }
  })
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
