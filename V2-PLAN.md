# v2.0 Plan

Working checklist for the 2.0 release (Zod 4 + code splitting + tooling cleanup).
Brain-dump from 2026-06-13, organized into tracks. Check items off as we go.

**Reference template: [Unirend](https://github.com/keverw/unirend)** — mirror its tooling,
scripts (`sync-version`/`update-docs`/`check-deps`/`prepublishOnly`), config, and multi-entry
exports throughout.

## Decisions made
- **Zod: 4-only.** v4 has been out ~a year; fair to require it for a major bump.
- **React: 19-only.** Published peer `react: ^19` (going 2.0 anyway). Drop React 18.
- **Deps: match Unirend's pinned versions** (its "known-good latest"), NOT bleeding edge.
  This keeps **TypeScript `^5.9.3`** and **ESLint `^9.39.4`** — i.e. we deliberately
  skip TypeScript 6 / ESLint 10 and their breaking changes. (See version table in Track 1.)
- **Test runner: switch vitest → `bun test`** (mirror Unirend). Migrate the 3 test files + setup.
- **ESLint: lighter than Unirend's strict config**, but DO include the **jsx-a11y + React /
  react-hooks** rules (most relevant for a form lib). Skip unicorn/check-file/strict naming.
- **Code splitting like Unirend.** Multi-entry conditional exports. Core stays DOM-free;
  debug tooling and platform-specific bits are separate entries.
- **Root `package.json` = single source of truth** for version + metadata + peerDependencies.
  `build-lib` reads the root version & peers (no more hard-coded `1.2.0`). `check-deps`
  validates peers match devDependencies; `sync-version`/`update-docs` ported from Unirend.
- **Sequencing: tooling first**, then Zod 4, then code splitting / RN.
- **Bun is the tool.** Drop npm lockfile, keep `bun.lock`.

---

## 1. Tooling & packaging cleanup  *(doing first)*

- [x] Delete tracked `package-lock.json` and gitignore npm/yarn/pnpm lockfiles
      (mirrors Unirend; keep `bun.lock`).
- [x] `bun audit` + `bun outdated` reviewed. **All audit vulns are dev/transitive only**
      (eslint→ajv, testing-library→lodash, tsup/tailwind/vite/vitest→minimatch/brace-expansion,
      vite). None affect the shipped lib (zero runtime deps, zod peer only).
- [x] **Bump deps to Unirend-pinned versions** (table below). Then bump the repo-specific
      ones Unirend doesn't have (tailwind, postcss, autoprefixer, lucide) to current latest.
      ✅ DONE for dev/source deps. Held back on purpose: zod at `3.25.76` (Track 2 takes it to
      4; bumped off 3.24 only because react-hooks 7 needs the `zod/v4` subpath), tailwind at 3.x
      (v4 is its own migration), vitest/jsdom/testing-library untouched (removed in bun-test step).
      NOTE: this is the **dev/source** side. The **published peer deps** (`react ^19`, `zod ^4`)
      live in build-lib's generated manifest and flip during the build-lib refactor + `check-deps`.

      | Package | Now | Target (Unirend-pinned) |
      |---|---|---|
      | react / react-dom | 18.3.1 | `^19.2.7` |
      | @types/react / -dom | 18.x | `^19.2.x` |
      | @vitejs/plugin-react | 4.4 | `^6.0.2` |
      | vite | 5.4 | `^8.0.16` |
      | typescript | 5.8 | `^5.9.3` (NOT 6) |
      | eslint / @eslint/js | 9.12 | `^9.39.4` (NOT 10) |
      | typescript-eslint | 8.8 | `^8.61.0` |
      | tsup / prettier | 8.4 / 3.5 | `^8.5.1` / `^3.8.4` |
      | eslint-plugin-react-hooks | 5.1-rc | `^7.1.1` |
      | eslint-plugin-react-refresh | 0.4 | `^0.5.2` |

- [x] Add ESLint plugins for the lighter-but-a11y config: `eslint-plugin-jsx-a11y` `^6.10.2`,
      `eslint-plugin-react` `^7.37.5` (keep react-hooks). Skip unicorn/check-file/naming.
      ✅ DONE — cherry-pick style (no `flat.recommended`), so `no-unescaped-entities` stays off.
- [x] **Switch test runner to `bun test`.** ✅ DONE — 66 tests pass.
      - DOM via `@happy-dom/global-registrator` (`happydom.ts` preload); jest-dom matchers via
        `expect.extend` in `testSetup.ts`; both wired through `bunfig.toml` `[test].preload`.
      - `vitest`→`bun:test`, `vi.`→`jest.` (incl. a multiline `vi\n.spyOn`).
      - Rewrote the `advanceTimers` helper: bun has no `advanceTimersToNextTimerAsync`, so it
        loops `jest.runAllTimers()` + microtask flush inside async `act()`. `useFakeTimers()` has
        no `shouldAdvanceTime` option in bun (dropped it; tests still green).
      - Removed `vitest`/`@vitest/coverage-v8`/`jsdom` + `vitest.config.ts`/`vitest.setup.ts`;
        added `@types/bun` for `bun:test` typings. Scripts → `bun test` (+ `test:coverage`).
- [ ] Set published **React peer to `^19`** in build-lib's generated manifest (the *published*
      peer, not the dev deps — those are done). Lands with the build-lib refactor + `check-deps`.
- [ ] **Single source of truth for version + metadata.** Make the *root* `package.json` the
      real manifest (name, version, author, bugs, homepage, repository). `build-lib` reads the
      root version **and peerDependencies** instead of the hard-coded `1.2.0` / inline peers.
      Today root is still `vite-react-typescript-starter` / `0.0.0` / `private`.
- [ ] Port Unirend's scripts:
      - `sync-version` — root `package.json` version → generated `src/version.ts` (`PKG_VERSION`).
      - `update-docs` — `update-readme-version.ts` + markdown-toc-gen (kills README drift).
      - `check-deps` — validate published `peerDependencies` match what we dev/test against.
- [ ] **README drift.** Today the dev `README.md` and the build-lib.js-generated README are
      separate and diverge. Consolidate: one source, generated/synced — not two hand-maintained copies.
- [ ] Add `prepublishOnly` modeled on Unirend (audit + build + type-check + lint + test;
      **skip spellcheck** per Kevin).
- [ ] Rename `build-lib.js` → `build-lib.ts`, run via bun (we're on bun for tooling now).
- [ ] Published manifest (build-lib.js `PACKAGE_CONFIG`): add `author`, `bugs`, `homepage`
      (currently `author: ''`, no bugs/homepage).

## 2. Zod 4 upgrade (the headline / major-version reason)

[changelog](https://zod.dev/v4/changelog) · [library authors guide](https://zod.dev/library-authors)

- [ ] Bump `zod` to `^4`; set published **peer dependency** to `zod: ^4` (4-only).
- [ ] Fix `error.errors` → `error.issues` in [zod-helpers.ts:23](src/lib/zod-helpers.ts#L23)
      (`.errors` removed/deprecated in v4).
- [ ] Re-check `ZodError` / `SafeParseError` imports in [zod-helpers.ts:1](src/lib/zod-helpers.ts#L1)
      against v4 type names (`SafeParseError` shape changed).
- [ ] Verify `z.ZodType<T>` still types correctly under v4.
- [ ] Update demo examples using deprecated `z.string().email()` → `z.email()`.
- [ ] **README note**: v2 requires Zod 4; one-line migration note for Zod 3 users.

## 3. Code splitting (Unirend-style multi-entry exports)

Unirend uses conditional exports with separate entries, each emitting types/import/require.
Apply the same so the core is DOM-free and RN-friendly; debug tooling is opt-in.

- [ ] Define entry points:
      - `.` — core (`FormProvider`, hooks, zod-helpers) — **no DOM imports**.
      - `./devtools` — web `FormState` debug component (DOM).
      - `./devtools/native` — React Native debug component equivalent (see track 5).
- [ ] Update tsup config for multiple entries; update generated `package.json` `exports`/`files`.
- [ ] Move `FormState` out of the root `index.ts` barrel into the `devtools` entry.
- [ ] ⚠️ **Singleton concern: `FormContext` must be ONE instance across entries.** If
      `./devtools` bundles its own copy of the `createContext()` call, `FormState`'s
      `useContext` returns `null` even though the app rendered `FormProvider` from `.`.
      Fix the Unirend way ([its tsup.config.ts](https://github.com/keverw/unirend/blob/master/tsup.config.ts)):
      put the context in its **own entry** and mark it **external** so every other entry
      imports the shared instance instead of inlining a copy (Unirend uses an esbuild
      `onResolve` plugin to redirect `./context` imports to the shared subpath). The same
      applies to the type side — a duplicated context type breaks nominal identity.
- [ ] `react-refresh/only-export-components` (3 warnings) — re-evaluate / resolve here, since
      splitting components out of barrels into dedicated entries naturally addresses it.

## 4. Lint findings to triage (surfaced by the eslint 9.39 + react-hooks 7 + jsx-a11y upgrade)

`react/no-unescaped-entities` is **disabled** — we use Unirend's cherry-pick style (a few
`react/*` rules) instead of `react.configs.flat.recommended`, so that rule never turns on.
Remaining 13 findings:

- [ ] **`react-hooks/refs` (6) — investigate, don't blind-fix.** react-hooks 7's new rule
      flags reading `*Ref.current` during render in the context value
      ([form-context.tsx ~1339](src/lib/form-context.tsx#L1339), ~1410). This is the deliberate
      ref+reducer hybrid (commit "a bit of both refs and reducer to avoid race condition").
      Open question: are we genuinely constrained by the architecture, or can the context value
      derive these from reducer state instead? Worth a real look — may be per-line disables with
      a rationale comment, or a small refactor. Don't churn the race-condition design blindly.
- [ ] **`react-hooks/set-state-in-effect` (2) — scan.** Find the `setState`-in-effect spots and
      decide if they're legit (sync-from-prop) or a re-render smell.
- [ ] **`jsx-a11y/label-has-associated-control` (2) — fix.** Real a11y wins (the point of
      adding the plugin) — associate `<label>`s with their controls.
- [ ] `react-refresh/only-export-components` (3) — deferred to Track 3 (code splitting).

## 5. Code review / scan

Done before Cursor had review tooling — re-run now.

- [ ] Run `/code-review high` on the working tree once changes are staged.
- [ ] Manual pass over `form-context.tsx` (1420 lines — the ref + reducer hybrid is the
      riskiest area for race conditions).
- [ ] Lint clean (`bun run lint`) and typecheck under the new Zod.

## 5. React Native support

Feasible — field binding is via hooks (render-agnostic). Only DOM hard-deps:
1. the optional `<form>` wrapper ([form-context.tsx:1412](src/lib/form-context.tsx#L1412)) —
   confirm it can be fully disabled (RN has no `<form>`).
2. `FormState` debug component (web-only) — replaced by a native equivalent via code splitting.

- [ ] Confirm `FormProvider` works with no `<form>` wrapper.
- [ ] Build a **React Native debug component** (the RN equivalent of `FormState`),
      shipped under `./devtools/native` (track 3).
- [ ] **Ship an Expo example.** For local dev, have users clone the repo and run a command
      that links the package locally (`bun link` / local file path) into the Expo app —
      no need to publish to test.
- [ ] Decide `react-native` export condition if RN needs a distinct core build.

## 6. Test coverage

Currently only 3 test files (`utils.test.ts`, `zod-helpers.test.ts`, `form-context.test.tsx`).
`form-context.tsx` is large and undertested.

- [ ] Audit current coverage report (`bun run test` already runs `--coverage`).
- [ ] Add tests for hooks: `useField`, `useArrayField`, `useFormContext` (none today).
- [ ] Add tests for submission flow: submission ID lifecycle, race/queueing path,
      server vs client error sources, root messages.
- [ ] Add `FormState` smoke test.

## 7. Hydration safety  ✅ (verified — doc task only)

Scanned the lib: **no hydration hazards found.**
- `useReducer` initial state is deterministic ([form-context.tsx:174](src/lib/form-context.tsx#L174)).
- `generateID()` (`Date.now()+Math.random()`) only runs at submit time
  ([form-context.tsx:1168](src/lib/form-context.tsx#L1168)), never during render.
- No `useId` / `window` / `document` reads during render.

- [ ] Add a short README "SSR/Hydration" note: hydration-safe as long as the caller passes
      identical `initialValues` on server and client.
- [ ] (Optional) Add an SSR render test (`renderToString`) to lock it in.

## 8. Release

- [ ] Bump root `package.json` to `2.0.0` (single source of truth; everything syncs from it).
- [ ] CHANGELOG / release notes covering the Zod 4 break.
- [ ] `bun run build:lib` and verify `dist_module/`.
- [ ] Publish.
