# Contributing

Thanks for helping. This repository is small and its rules are short. The operating
contract for agents and humans alike is [AGENTS.md](AGENTS.md); this file is the
human-facing version and the pull-request checklist.

## Setting up

```sh
bun install
bun run verify
```

`verify` runs typecheck, lint, the catalogue freshness check, the test suite and the
build. If it is green, CI will be green.

## What a change usually looks like

### Adding a theme

Read "Adding a theme" in the [README](README.md). The short version: vendor its Base24
scheme into `palettes/`, register it in `src/sources.ts` with its family's project,
URL and licence, add a fidelity assertion to `tests/provenance.test.ts`, and run
`bun run catalogue:build`. The test suite refuses a theme that has no fidelity
assertion, which is deliberate — "this is really Catppuccin Mocha" is the claim the
catalogue makes, and a theme nobody checked is that claim unverified.

### Changing a contrast floor

`CONTRAST_FLOORS` in `src/normalize.ts` carries the reasoning for every value. If you
change one, change its comment in the same commit and say in the pull request which
theme it was blocking. A floor widened to make a theme pass is the one edit that makes
the whole catalogue less trustworthy, because the floors are the only reason an
external palette can be admitted at all.

### Changing the schema

A new role lands in the same commit as: `src/schema.ts`, the mapping table in
`src/adapters/shadcn.ts`, the CSS and Tailwind adapters, `src/derive.ts` if the role
is derived, both test suites, and `docs/shadcn-bridge.md`. The compiler finds most of
these; the tests find the rest.

### Refreshing from upstream

```sh
# edit CATALOGUE_REVISION in src/sources.ts
bun run vendor
bun run catalogue:build
git diff   # this is the review
```

The build prints every value it repaired and every substitution it made, so the diff
and the log together are the whole story of what changed.

## Testing

- Assert _upstream_ values, not internal consistency. `tests/provenance.test.ts` is
  the model: it knows what Catppuccin Mocha's background is and checks it.
- Assert the contract an adapter's target actually has, not that it returned
  something. xterm's is "every value is valid hex and selected text is legible";
  Shiki's is "every colour is hex and more than one token rule exists".
- A test that would pass with the feature deleted is worse than no test.

## Pull requests

- Branch from `main`: `feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*`, `test/*`.
- Conventional Commit subjects. Release Please derives the version from them, and
  this repository publishes to npm, so `feat` is a minor release and `fix` is a patch.
- Open as a **draft**, mark it ready when `bun run verify` is clean.
- A palette or colour change should say in the description which themes it moves and
  whether the before/after was looked at. `bun run catalogue:build` prints a diff of
  every role it changed.

## Licence

By contributing you agree your work is licensed under Apache-2.0. If your change
vendors a palette from a new project, its licence and provenance go in
[NOTICE](NOTICE) in the same commit, and only permissive licences are accepted —
`tests/provenance.test.ts` enforces that list.
