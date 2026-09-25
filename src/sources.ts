/**
 * What the catalogue contains, and where each palette came from.
 *
 * Two lists. {@link VENDORED_SOURCES} names the Base24 schemes that
 * `scripts/vendor-palettes.ts` reproduces from upstream, and {@link AUTHORED_SOURCES}
 * is Adea's own theme, which has no upstream to vendor from. Together they are the
 * catalogue's input; `scripts/build-catalogue.ts` runs them all through the
 * normalizer and writes the committed output.
 *
 * ## Provenance is per-family, and it was checked rather than assumed
 *
 * Every licence below was read from the upstream repository, not recalled. Two
 * needed care:
 *
 * - **Gruvbox** declares MIT/X11 in its README and ships no `LICENSE` file, so
 *   GitHub's detector reports nothing. The README is the licence grant and it is
 *   recorded as MIT.
 * - **Monokai** has no permissively licensed repository of its own: the repository
 *   under the Monokai organisation carries no licence at all. The *values* in the
 *   catalogue are therefore taken from the MIT-licensed iTerm2-Color-Schemes port,
 *   which is the artefact recorded as the licence basis, and Monokai is credited
 *   as the design's origin. See NOTICE for the full reasoning.
 *
 * ## The chain of custody
 *
 * These palettes reach the catalogue through one intermediate artefact, and the
 * honest description of that is: `palettes/<id>.json` holds values reproduced from
 * a Base24 scheme in the `oklch-terminal-themes` dataset at a pinned revision,
 * which is itself derived from `iTerm2-Color-Schemes` at a pinned revision, which
 * is where the per-family values were first published as terminal schemes. Each
 * family's official project is recorded as the design's origin, and the values were
 * checked against those projects' published palettes — the backgrounds and
 * foregrounds of all fourteen families match the official palettes exactly.
 *
 * `tests/provenance.test.ts` holds those official values as assertions, so the
 * claim "this is really Catppuccin Mocha" fails the build rather than drifting.
 */

import type { Base24Slot } from './adapters/base24'
import type { ThemeAppearance, ThemeProvenance } from './schema'

/** The dataset the Base24 schemes are reproduced from. */
export const CATALOGUE_REPOSITORY = 'https://github.com/williamzujkowski/oklch-terminal-themes'

/**
 * The pinned revision. Refreshing the catalogue starts by changing this, which is
 * what makes a palette update a reviewable diff rather than an invisible drift.
 */
export const CATALOGUE_REVISION = '9e800e7fe760081d4c10317498038ed4227341d6'

/** The upstream the dataset's per-family values were first published in. */
const ITERM2 = 'https://github.com/mbadolato/iTerm2-Color-Schemes'

/** Where Adea's own theme lives. */
export const ADEA_PROVENANCE: ThemeProvenance = Object.freeze({
  project: 'Adea',
  url: 'https://github.com/adea-ai/themes',
  license: 'Apache-2.0',
})

/**
 * Per-family provenance.
 *
 * `url` is the project's own repository — the place its palette is defined — while
 * the vendored values come through the chain described in this module's header.
 * Recording both is the point: one answers "whose palette is this", the other
 * answers "which bytes are in the file".
 */
export const FAMILY_PROVENANCE: Readonly<Record<string, ThemeProvenance>> = Object.freeze({
  adea: ADEA_PROVENANCE,
  catppuccin: {
    project: 'Catppuccin',
    url: 'https://github.com/catppuccin/catppuccin',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  tokyonight: {
    project: 'Tokyo Night',
    url: 'https://github.com/folke/tokyonight.nvim',
    license: 'Apache-2.0',
    bootstrappedFrom: [ITERM2],
  },
  rosepine: {
    project: 'Rosé Pine',
    url: 'https://github.com/rose-pine/rose-pine-theme',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  gruvbox: {
    project: 'Gruvbox',
    // Gruvbox grants MIT/X11 in its README and ships no LICENSE file, so
    // repository licence detection finds nothing. The README is the grant.
    url: 'https://github.com/morhetz/gruvbox#license',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  nord: {
    project: 'Nord',
    url: 'https://github.com/nordtheme/nord',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  dracula: {
    project: 'Dracula',
    url: 'https://github.com/dracula/dracula-theme',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  onedark: {
    project: 'One Dark',
    url: 'https://github.com/atom/one-dark-syntax',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  solarized: {
    project: 'Solarized',
    url: 'https://github.com/altercation/solarized',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  everforest: {
    project: 'Everforest',
    url: 'https://github.com/sainnhe/everforest',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  ayu: {
    project: 'Ayu',
    url: 'https://github.com/ayu-theme/ayu-colors',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  kanagawa: {
    project: 'Kanagawa',
    url: 'https://github.com/rebelot/kanagawa.nvim',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  vesper: {
    project: 'Vesper',
    url: 'https://github.com/raunofreiberg/vesper',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
  monokai: {
    project: 'Monokai',
    // Monokai's own repository carries no licence. The values are therefore taken
    // from the MIT port, which is the artefact the licence below attaches to;
    // Monokai is credited here as the design's origin.
    url: 'https://monokai.pro',
    license: 'MIT',
    bootstrappedFrom: [ITERM2],
  },
})

/** A theme that is normalized from a vendored Base24 scheme. */
export interface VendoredSource {
  id: string
  /** The scheme's slug in the dataset. */
  slug: string
  family: keyof typeof FAMILY_PROVENANCE
  familyLabel: string
  label: string
  name: string
  description: string
  appearance: ThemeAppearance
  tags: readonly string[]
  /** Declared when the family's identity is not in its blue slot. */
  accentSlot?: 'blue' | 'magenta' | 'cyan' | 'green'
  /**
   * Corrections to the vendored scheme, applied before normalization.
   *
   * One entry uses this, and it is worth reading as the example of when it is
   * legitimate: iTerm2's One Dark port deliberately darkens the canvas to `#21252b`
   * so a terminal reads as a distinct surface, but Atom's own editor palette — the
   * thing "One Dark" means — is `hsl(220, 13%, 18%)` = `#282c34`, with comments at
   * `#5c6370` rather than the port's `#767676`. Adea themes an application, so the
   * project's value is the correct one. Every correction is reported as a finding
   * and appears in the catalogue's build log.
   */
  palette?: Partial<Record<Base24Slot, string>>
}

/** Convenience for the one source that corrects its palette. */
const ONE_DARK_OFFICIAL = Object.freeze({
  base00: '#282c34',
  base03: '#5c6370',
  base04: '#818896',
})

/**
 * The vendored catalogue.
 *
 * Ordered family by family, and within a family light-to-dark or by the order the
 * project itself lists its flavours. The order is the order a picker shows, so it
 * is deliberate rather than alphabetical.
 */
export const VENDORED_SOURCES: readonly VendoredSource[] = Object.freeze([
  /* --- Catppuccin: four flavours, lightest first ------------------------- */
  {
    id: 'catppuccin-latte',
    slug: 'catppuccin-latte',
    family: 'catppuccin',
    familyLabel: 'Catppuccin',
    label: 'Latte',
    name: 'Catppuccin Latte',
    description: 'The light flavour. Warm and low-contrast, built for long sessions.',
    appearance: 'light',
    tags: ['light', 'warm', 'muted'],
  },
  {
    id: 'catppuccin-frappe',
    slug: 'catppuccin-frappe',
    family: 'catppuccin',
    familyLabel: 'Catppuccin',
    label: 'Frappé',
    name: 'Catppuccin Frappé',
    description: 'The first dark flavour: soft, desaturated, easy on the eyes.',
    appearance: 'dark',
    tags: ['dark', 'muted', 'soft'],
  },
  {
    id: 'catppuccin-macchiato',
    slug: 'catppuccin-macchiato',
    family: 'catppuccin',
    familyLabel: 'Catppuccin',
    label: 'Macchiato',
    name: 'Catppuccin Macchiato',
    description: 'The middle dark flavour, a shade deeper than Frappé.',
    appearance: 'dark',
    tags: ['dark', 'muted'],
  },
  {
    id: 'catppuccin-mocha',
    slug: 'catppuccin-mocha',
    family: 'catppuccin',
    familyLabel: 'Catppuccin',
    label: 'Mocha',
    name: 'Catppuccin Mocha',
    description: 'The deepest flavour, and the most used of the four.',
    appearance: 'dark',
    tags: ['dark', 'muted', 'popular'],
  },

  /* --- Tokyo Night ------------------------------------------------------- */
  {
    id: 'tokyonight-day',
    slug: 'tokyonight-day',
    family: 'tokyonight',
    familyLabel: 'Tokyo Night',
    label: 'Day',
    name: 'Tokyo Night Day',
    description: 'The daylight variant: cool paper rather than warm.',
    appearance: 'light',
    tags: ['light', 'cool'],
  },
  {
    id: 'tokyonight-storm',
    slug: 'tokyonight-storm',
    family: 'tokyonight',
    familyLabel: 'Tokyo Night',
    label: 'Storm',
    name: 'Tokyo Night Storm',
    description: 'A lifted dark canvas, a touch brighter than Night.',
    appearance: 'dark',
    tags: ['dark', 'cool'],
  },
  {
    id: 'tokyonight-night',
    slug: 'tokyonight-night',
    family: 'tokyonight',
    familyLabel: 'Tokyo Night',
    label: 'Night',
    name: 'Tokyo Night',
    description: 'The original: deep blue-black with neon-adjacent hues.',
    appearance: 'dark',
    tags: ['dark', 'cool', 'popular'],
  },

  /* --- Rosé Pine: the family's accent is iris, not blue ------------------ */
  {
    id: 'rosepine-dawn',
    slug: 'rose-pine-dawn',
    family: 'rosepine',
    familyLabel: 'Rosé Pine',
    label: 'Dawn',
    name: 'Rosé Pine Dawn',
    description: 'The light variant: a warm paper ground with muted rose ink.',
    appearance: 'light',
    tags: ['light', 'warm'],
    accentSlot: 'magenta',
  },
  {
    id: 'rosepine-moon',
    slug: 'rose-pine-moon',
    family: 'rosepine',
    familyLabel: 'Rosé Pine',
    label: 'Moon',
    name: 'Rosé Pine Moon',
    description: 'The lifted dark variant, greyer than Main.',
    appearance: 'dark',
    tags: ['dark', 'muted'],
    accentSlot: 'magenta',
  },
  {
    id: 'rosepine',
    slug: 'rose-pine',
    family: 'rosepine',
    familyLabel: 'Rosé Pine',
    label: 'Main',
    name: 'Rosé Pine',
    description: 'The original: deep plum ground, iris and foam accents.',
    appearance: 'dark',
    tags: ['dark', 'muted', 'popular'],
    accentSlot: 'magenta',
  },

  /* --- Gruvbox ----------------------------------------------------------- */
  {
    id: 'gruvbox-light',
    slug: 'gruvbox-light',
    family: 'gruvbox',
    familyLabel: 'Gruvbox',
    label: 'Light',
    name: 'Gruvbox Light',
    description: 'Retro warm cream and burnt orange.',
    appearance: 'light',
    tags: ['light', 'warm', 'retro'],
  },
  {
    id: 'gruvbox-dark',
    slug: 'gruvbox-dark',
    family: 'gruvbox',
    familyLabel: 'Gruvbox',
    label: 'Dark',
    name: 'Gruvbox Dark',
    description: 'The classic: warm brown-black with high-chroma retro accents.',
    appearance: 'dark',
    tags: ['dark', 'warm', 'retro', 'popular'],
  },

  /* --- Single-variant families ------------------------------------------ */
  {
    id: 'nord',
    slug: 'nord',
    family: 'nord',
    familyLabel: 'Nord',
    label: 'Nord',
    name: 'Nord',
    description: 'Arctic blue-grey, all cool and all low-contrast by design.',
    appearance: 'dark',
    tags: ['dark', 'cool', 'muted', 'popular'],
  },
  {
    id: 'dracula',
    slug: 'dracula',
    family: 'dracula',
    familyLabel: 'Dracula',
    label: 'Dracula',
    name: 'Dracula',
    description: 'Deep grey-purple with a violet accent and vivid hues.',
    appearance: 'dark',
    tags: ['dark', 'purple', 'vivid', 'popular'],
  },
  {
    id: 'one-dark',
    slug: 'atom-one-dark',
    family: 'onedark',
    familyLabel: 'One Dark',
    label: 'One Dark',
    name: 'One Dark',
    description: "Atom's editor palette: cool grey ground, one blue accent.",
    appearance: 'dark',
    tags: ['dark', 'cool', 'editor'],
    palette: ONE_DARK_OFFICIAL,
  },
  {
    id: 'kanagawa',
    slug: 'kanagawa-wave',
    family: 'kanagawa',
    familyLabel: 'Kanagawa',
    label: 'Wave',
    name: 'Kanagawa',
    description: 'Sumi ink and indigo, after the Great Wave.',
    appearance: 'dark',
    tags: ['dark', 'ink', 'muted', 'popular'],
  },
  {
    id: 'vesper',
    slug: 'vesper',
    family: 'vesper',
    familyLabel: 'Vesper',
    label: 'Vesper',
    name: 'Vesper',
    description: 'Near-black with a single warm amber accent. Very high contrast.',
    appearance: 'dark',
    tags: ['dark', 'high-contrast', 'minimal'],
  },
  {
    id: 'monokai',
    slug: 'monokai-classic',
    family: 'monokai',
    familyLabel: 'Monokai',
    label: 'Classic',
    name: 'Monokai',
    description: 'The original 2006 palette: olive ground, pink and acid green.',
    appearance: 'dark',
    tags: ['dark', 'vivid', 'retro', 'popular'],
    // Monokai's blue slot is orange in the terminal port, which would read as a
    // warning colour. The family's own accent is its magenta.
    accentSlot: 'magenta',
  },

  /* --- Solarized: one palette, two appearances --------------------------- */
  {
    id: 'solarized-light',
    slug: 'iterm2-solarized-light',
    family: 'solarized',
    familyLabel: 'Solarized',
    label: 'Light',
    name: 'Solarized Light',
    description: 'Ethan Schoonover\'s paper variant, on the same eight accents.',
    appearance: 'light',
    tags: ['light', 'warm', 'precision'],
  },
  {
    id: 'solarized-dark',
    slug: 'iterm2-solarized-dark',
    family: 'solarized',
    familyLabel: 'Solarized',
    label: 'Dark',
    name: 'Solarized Dark',
    description: 'The base16 teal ground, with deliberately equalised contrast.',
    appearance: 'dark',
    tags: ['dark', 'precision', 'popular'],
  },

  /* --- Everforest: the accent is its green ----------------------------- */
  {
    id: 'everforest-light',
    slug: 'everforest-light-med',
    family: 'everforest',
    familyLabel: 'Everforest',
    label: 'Light',
    name: 'Everforest Light',
    description: 'A soft light green-grey, medium contrast.',
    appearance: 'light',
    tags: ['light', 'green', 'soft'],
    accentSlot: 'green',
  },
  {
    id: 'everforest-dark',
    slug: 'everforest-dark-med',
    family: 'everforest',
    familyLabel: 'Everforest',
    label: 'Dark',
    name: 'Everforest Dark',
    description: 'Forest green ground with the family\'s signature green accent.',
    appearance: 'dark',
    tags: ['dark', 'green', 'soft', 'popular'],
    accentSlot: 'green',
  },

  /* --- Ayu: three variants --------------------------------------------- */
  {
    id: 'ayu-light',
    slug: 'ayu-light',
    family: 'ayu',
    familyLabel: 'Ayu',
    label: 'Light',
    name: 'Ayu Light',
    description: 'Clean white paper with an orange accent.',
    appearance: 'light',
    tags: ['light', 'warm'],
  },
  {
    id: 'ayu-mirage',
    slug: 'ayu-mirage',
    family: 'ayu',
    familyLabel: 'Ayu',
    label: 'Mirage',
    name: 'Ayu Mirage',
    description: 'The mid-dark variant: blue-grey rather than black.',
    appearance: 'dark',
    tags: ['dark', 'cool'],
  },
  {
    id: 'ayu',
    slug: 'ayu',
    family: 'ayu',
    familyLabel: 'Ayu',
    label: 'Dark',
    name: 'Ayu Dark',
    description: 'The original: near-black with orange and blue.',
    appearance: 'dark',
    tags: ['dark', 'popular'],
  },
])

/**
 * Adea's own theme.
 *
 * Authored here rather than vendored, and the only entry whose colours are chosen
 * rather than reproduced. It is deliberately a neutral ladder with a monochrome
 * accent — the design system's default has to work as a default for everyone, which
 * means it cannot be anybody's favourite colour.
 *
 * Both appearances are generated from the accent-and-grey ramp below, so the two
 * variants cannot drift apart: a change to the ramp changes both, and the contrast
 * suite measures both.
 */
export interface AuthoredSource {
  id: string
  family: string
  familyLabel: string
  label: string
  name: string
  description: string
  appearance: ThemeAppearance
  tags: readonly string[]
  /**
   * The greyscale ramp the theme is built from, darkest first.
   *
   * Authored as hex rather than OKLCH because that is how the design system's
   * values were originally specified and reviewed; the normalizer converts, and the
   * committed catalogue is OKLCH.
   */
  ramp: {
    background: string
    foreground: string
    surface: string
    surfaceElevated: string
    surfaceHover: string
    surfaceActive: string
    border: string
    borderMuted: string
    textMuted: string
    textSubtle: string
  }
  accent: string
  accentForeground: string
  status: {
    success: string
    warning: string
    error: string
    info: string
  }
  /**
   * The terminal palette.
   *
   * Adea ships a terminal, so its own theme has to answer the sixteen ANSI
   * questions the same way an imported theme does. These are the values the product
   * already runs: the light set is GitHub's light scheme and the dark set GitHub's
   * dark, which is what the embedded terminal was drawn against.
   */
  ansi: {
    black: string
    red: string
    green: string
    yellow: string
    blue: string
    magenta: string
    cyan: string
    white: string
    brightBlack: string
    brightRed: string
    brightGreen: string
    brightYellow: string
    brightBlue: string
    brightMagenta: string
    brightCyan: string
    brightWhite: string
  }
  cursor: string
  selection: string
}

export const AUTHORED_SOURCES: readonly AuthoredSource[] = Object.freeze([
  {
    id: 'adea-light',
    family: 'adea',
    familyLabel: 'Adea',
    label: 'Light',
    name: 'Adea Light',
    description: "The default light theme. A neutral ladder with a monochrome accent.",
    appearance: 'light',
    tags: ['light', 'neutral', 'default'],
    ramp: {
      background: '#ffffff',
      foreground: '#252525',
      surface: '#ffffff',
      surfaceElevated: '#ffffff',
      surfaceHover: '#f7f7f7',
      surfaceActive: '#f0f0f0',
      border: '#ebebeb',
      borderMuted: '#f2f2f2',
      textMuted: '#6f6f6f',
      textSubtle: '#767676',
    },
    accent: '#343434',
    accentForeground: '#fcfcfc',
    status: {
      success: '#1a7f37',
      warning: '#a16207',
      error: '#c53c2b',
      info: '#0e7490',
    },
    ansi: {
      black: '#1b1f24',
      red: '#b91c1c',
      green: '#116a2e',
      yellow: '#8a5a1b',
      blue: '#0b57d0',
      magenta: '#a0186f',
      cyan: '#0e7490',
      white: '#57606a',
      brightBlack: '#57606a',
      brightRed: '#c94d4d',
      brightGreen: '#1f9d4f',
      brightYellow: '#a9752c',
      brightBlue: '#3b82f6',
      brightMagenta: '#c04a92',
      brightCyan: '#0891b2',
      brightWhite: '#24292f',
    },
    cursor: '#24292f',
    selection: '#b6c7ff',
  },
  {
    id: 'adea-dark',
    family: 'adea',
    familyLabel: 'Adea',
    label: 'Dark',
    name: 'Adea Dark',
    description: "The default dark theme. A soft grey, never a near-black.",
    appearance: 'dark',
    tags: ['dark', 'neutral', 'default'],
    ramp: {
      background: '#252525',
      foreground: '#fcfcfc',
      surface: '#2d2d2d',
      surfaceElevated: '#343434',
      surfaceHover: '#444444',
      surfaceActive: '#4d4d4d',
      border: '#3d3d3d',
      borderMuted: '#333333',
      textMuted: '#a3a3a3',
      textSubtle: '#8a8a8a',
    },
    accent: '#ebebeb',
    accentForeground: '#343434',
    status: {
      success: '#3fb950',
      warning: '#e3b341',
      // Lighter than the value the product shipped: `#e07060` measures 4.37:1 on
      // this theme's raised surface and 4.09:1 on a popover, which is where an
      // alert is most likely to sit. Same hue, same chroma, four steps up.
      error: '#ee7c6c',
      info: '#39c5cf',
    },
    ansi: {
      black: '#2f3742',
      red: '#ff8183',
      green: '#56d364',
      yellow: '#e3b341',
      blue: '#6ca4f8',
      magenta: '#db61a2',
      cyan: '#39c5cf',
      white: '#d5dde5',
      brightBlack: '#57606a',
      brightRed: '#ff9494',
      brightGreen: '#79dd8a',
      brightYellow: '#f0c264',
      brightBlue: '#8db9ff',
      brightMagenta: '#e87cb4',
      brightCyan: '#66d3dc',
      brightWhite: '#eef2f6',
    },
    cursor: '#e6edf3',
    selection: '#264f78',
  },
])
