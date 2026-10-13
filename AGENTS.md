# Agent instructions

This is the repository-level operating contract for coding agents working in
`adea-ai/themes`. It complements [CONTRIBUTING.md](CONTRIBUTING.md) and the root
organisation contract.

## Mission

Be the **only** place in the Adea organisation where a colour is decided. Adea,
Cortana and the design system consume this package; none of them keeps a palette.

That mission has one consequence that governs every change here, and it is the thing
to internalise before touching anything:

> **Adea owns the schema and the transformation. It does not own the colours.**

The palettes belong to the projects that maintain them — Catppuccin, Nord, Gruvbox
and the rest — and they are reproduced rather than authored. This repository's value
is the _normalizer_: the one place a terminal palette becomes an application theme,
measured against contrast floors, for every consumer at once.

So when a theme looks wrong, the fix is almost never a literal in a source file. It
is a change to how the palette is interpreted, and it lands in `src/normalize.ts` where
the catalogue benefits.

## Read before acting

1. This file and `CONTRIBUTING.md`.
2. `src/schema.ts` — the contract. Nothing may add a role that is not declared here.
3. `src/normalize.ts` — the transformation, and the header comment that explains why
   each step is not the obvious one. Most "why is this colour like that" questions
   are answered there.
4. `src/validate.ts` and `CONTRAST_FLOORS` — what the catalogue guarantees.
5. The theme you are about to touch, in the six places it appears: `palettes/`,
   `src/sources.ts`, `src/generated/themes.ts`, the fidelity assertions in
   `tests/provenance.test.ts`, the palette galleries, and `NOTICE` if its family's
   licence or provenance is not yet recorded.

## The invariants

Each is enforced by a test, a lint rule or the build. Breaking one is a failing
check rather than a review comment.

| Invariant                                                               | Enforced by                |
| ----------------------------------------------------------------------- | -------------------------- |
| Every theme clears every contrast floor                                 | `tests/catalogue.test.ts`  |
| `src/generated` matches `palettes/` and `src/sources.ts`                | `catalogue:check`          |
| Every theme's background and foreground match its upstream project      | `tests/provenance.test.ts` |
| A contrast repair moves lightness, never hue                            | `tests/provenance.test.ts` |
| Every theme records a project, a URL and an SPDX licence                | `tests/provenance.test.ts` |
| Only permissively licensed families are present                         | `tests/provenance.test.ts` |
| Every value that leaves an adapter is valid for that adapter            | `tests/adapters.test.ts`   |
| No theme is added without a fidelity assertion                          | `tests/provenance.test.ts` |
| Every published symbol is a `oklch()` string or an adapter's own format | `tests/adapters.test.ts`   |
| The package has no runtime dependencies                                 | `package.json`, and review |

## Working rules

**Never hand-edit `src/generated`.** Run `bun run catalogue:build`. The generated
files are committed on purpose — so that a palette change is a reviewable diff — and
`catalogue:check` fails when they disagree with their inputs.

**Never hand-edit `palettes/`.** Run `bun run vendor`. The files are reproduced from a
pinned revision so that every value can be traced; an edit there destroys the audit
trail. If a vendored value is _wrong_ — a port that has drifted from the project's own
palette — the correction is a `palette` block in `src/sources.ts`, which is reported
as a finding on every build. One Dark is the worked example.

**Repair by lightness, then by blending, and always report it.** A contrast repair
moves one axis. If a colour cannot be repaired within budget, the build fails and a
human decides — either the palette cannot express that role, or the floor is wrong.
Do not widen a floor to make a theme pass. `CONTRAST_FLOORS` carries the reasoning
for each value it holds, including the two that are deliberately two-tier.

**Never invent a colour.** Every value in the catalogue is a value from the palette it
is attributed to, viewed at a different brightness. A blend is reported on the entry
and named in the build log.

**A test that asserts nothing is worse than no test.** The provenance suite asserts
upstream values rather than internal consistency, because "this is really Catppuccin
Mocha" is the claim the catalogue makes and the only one worth checking.

**Comment the decision, not the code.** In this repository that means saying why a
step is _not_ the obvious thing: why the surface ladder's direction is measured
rather than declared, why `base01` is a ramp candidate on dark themes only, why
Everforest Light's status colours are deepened. A comment that restates the next line
will be asked for in review.

## Commands

```sh
bun install --frozen-lockfile
bun run verify            # formatting, typecheck, lint, catalogue freshness, tests, build
bun run catalogue:build   # regenerate the committed catalogue
bun run catalogue:check   # fail if it is stale
bun run vendor            # refresh palettes/ from the pinned revision
bun run test              # the suite
bun run build             # dist/ plus declarations
```

`bun run verify` is the gate. CI runs the same commands through Code Foundry.

## What not to do

- Do not add a runtime dependency. The package is pure data and pure functions, and
  its consumers include a desktop shell. A YAML parser, a colour library and a JSON
  reader have all been considered and rejected; the hand-written base24 reader in
  `src/adapters/base24.ts` is what that looks like.
- Do not add a role to `AdeaTheme` without changing `schema.ts`, the mapping table in
  `adapters/shadcn.ts`, the CSS and Tailwind adapters, and both test suites. The
  compiler will find most of them and the tests will find the rest.
- Do not add a theme to the catalogue by copying values out of a screenshot, a blog
  post or another theme package. Either vendor it from a pinned upstream revision or
  author it as Adea's own.
- Do not commit generated output other than `src/generated`. `dist/` is built by the
  release workflow.
- Do not commit secrets, credentials or machine-specific paths.

## Repository map and consumer review

- `src/schema.ts`, `src/normalize.ts`, `src/validate.ts`: semantic roles,
  normalization and contrast guarantees.
- `src/sources.ts`, `palettes/`, `NOTICE`: source revisions, vendored inputs and credit.
- `src/adapters/`: terminal, CSS, Tailwind, shadcn and syntax mappings.
- `scripts/build-catalogue.ts`, `src/generated/`: catalogue generator and committed output.
- `tests/`: provenance, contrast, adapters and packed-package contract.
- [README.md](README.md) and [docs/shadcn-bridge.md](docs/shadcn-bridge.md): public
  entry points and the semantic-to-component mapping.

Use `.mise.toml` when present and `package.json` for tool pins (Bun 1.4.2,
Node 24.21.0), with the committed `bun.lock`. Single-theme modules and metadata
entry points let consumers avoid loading the entire catalogue; `tests/package.test.ts`
checks actual package exports and browser bundle contents.
UI owns components and their token application; Adea and Cortana own app behavior.
Review appearance in UI's Storybook galleries or the affected consumer, using the
same published theme and adapter. Screenshots support appearance review; provenance
and contrast assertions remain the evidence for palette fidelity and floors.
A role meaning change includes schema, normalizer, adapters, affected themes and tests.
For guidance-only edits, check Markdown formatting, links and documented commands.

## Draft WIP workflow

Use one focused topic branch from `main` and one draft PR targeting `main`.
Check existing PRs before starting; reuse the suitable draft branch for the task.
Commit and push WIP to that branch throughout the task and before stopping or
handing off, then verify the remote SHA. Incomplete work and failing checks belong
in the draft PR with exact results and remaining work; they do not block WIP pushes.
Review and applicable passing checks gate readiness and merge. Use Conventional
Commit subjects; this repository uses Code Foundry's direct, squash workflow.

Proceed with ordinary authorized edits, checks, commits and draft pushes. Resolve
routine implementation choices from repository sources. Ask only when a genuinely
missing consequential decision or authority prevents the work.

## Code Foundry guidance

[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) retains the complete contribution,
review, merge and CI contract; [docs/EXTENSIONS.md](docs/EXTENSIONS.md) explains
managed files and extension points. `.github/code-foundry.yml` is the CI source of
truth. Use the repository's pinned tools and lockfiles; keep coverage thresholds,
formatting conventions, generated-file ownership and change-aware hooks intact.
Add regression coverage for behavior changes and run focused checks while iterating.
A passing commit hook is not full validation. Report exact checks and outcomes,
skips with reasons, remaining work, and the branch/PR at handoff.

User instructions take precedence; directory guidance applies to its own scope.
Read the nearest manifest, README and affected tests, and inspect branch, worktree
and existing changes before editing. Preserve unrelated work.

<!-- code-foundry-managed: safety-boundaries -->

## Safety boundaries

- Do not discard, reset, overwrite, or rewrite user-owned changes.
- Do not expose or commit secrets, credentials, tokens, private keys, local environment files, or personal machine paths.
- Do not modify production resources, repository settings, branch protections, secrets, deployments, or external systems unless explicitly requested.
- Do not add organization- or product-specific details to this reusable baseline.
- Do not change dependency managers or lockfiles unnecessarily.
- Do not bypass hooks, tests, review requirements, or required checks to hide a failure.
- Do not claim completion while required validation, review, deployment, or user decisions remain pending.
- Publishing, committing, or opening a pull request requires explicit task scope or user authorization.

<!-- /code-foundry-managed: safety-boundaries -->
