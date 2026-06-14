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

## 1. Tooling & packaging cleanup _(doing first)_

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
- [x] **Switch test runner to `bun test`.** ✅ DONE — 66 tests pass. - DOM via `@happy-dom/global-registrator` (`happydom.ts` preload); jest-dom matchers via
      `expect.extend` in `testSetup.ts`; both wired through `bunfig.toml` `[test].preload`. - `vitest`→`bun:test`, `vi.`→`jest.` (incl. a multiline `vi\n.spyOn`). - Rewrote the `advanceTimers` helper: bun has no `advanceTimersToNextTimerAsync`, so it
      loops `jest.runAllTimers()` + microtask flush inside async `act()`. `useFakeTimers()` has
      no `shouldAdvanceTime` option in bun (dropped it; tests still green). - Removed `vitest`/`@vitest/coverage-v8`/`jsdom` + `vitest.config.ts`/`vitest.setup.ts`;
      added `@types/bun` for `bun:test` typings. Scripts → `bun test` (+ `test:coverage`).
- [x] Set published **React peer to `^19`**. ✅ Root now has a `peerDependencies` field
      (`react ^19`, `react-dom ^19`, `zod ^3`); build-lib reads it into the published manifest.
      Verified in `dist_module/package.json`. (zod stays `^3` until Track 2.)
- [x] **Single source of truth for version + metadata.** ✅ Root `package.json` is now the real
      manifest: name `form-context-react-zod`, version `2.0.0`, description, author, license,
      homepage, repository, bugs, keywords (kept `private: true` so root itself can't be
      published). `build-lib.js` reads all of these from root (no more hard-coded `1.2.0` /
      inline metadata). Verified: generated `dist_module/package.json` carries them through.
      ✅ `build-lib` now also reads **peerDependencies** from root (see React-peer item above).
- [x] Port Unirend's scripts (`check-deps` only): - ✅ `scripts/check-deps.ts` — validates root `peerDependencies` are satisfied by local
      deps/devDeps (adapted from Unirend, minus the starter-template surface it doesn't have).
      Added `semver`. Runs in `build:lib` before tsup. Currently passes. - ❌ `sync-version` — SCRAPPED. Unirend needs it for its CLI's `PKG_VERSION`; this lib has
      no runtime use for its own version, and `build-lib` already reads the version straight
      from root. A public `VERSION` export would just be dead weight. - ✅ `scripts/update-docs.ts` — stamps the version into the dev README's **H1 title**
      (`# Form Context React Zod vX.Y.Z`), Unirend-style, from root version. Kept the dev +
      published READMEs as separate documents (per plan), so this guards them from drifting on
      version. Runs in `build:lib`. Verified both branches (corrects stale, stamps bare title).
      (markdown-toc-gen TOC not added — README is short.)
- [x] **README drift.** DECISION: keep the dev `README.md` and the build-lib-generated published
      README as **separate documents** (different audiences — contributors vs npm consumers).
      Drift risk was really just the version, now handled by `update-docs` syncing the dev
      README's `**Current version:**` line. No consolidation needed.
- [x] Add `prepublishOnly` + `type-check`. ✅ - `type-check`: `tsc --noEmit`. **Consolidated the Vite-starter split tsconfig** into one
      root `tsconfig.json` (merged `tsconfig.app.json` in, repointed `tsconfig.lib.json`'s
      `extends`, dropped the project references) so a bare `tsc --noEmit` checks `src` — no more
      `-p`, matching the other repos. `tsconfig.node.json` stays for the Vite config. - Fixed the latent type errors this surfaced: added `src/matchers.d.ts` to type jest-dom
      matchers under `bun:test`; `_`-prefixed unused params; cast one intentionally-mutated test
      object. Also added a public **`FormSubmitHandler<T>`** type (`onSubmit` handler) so the
      value type is declared once instead of repeating `z.infer<…>` for both `values` and
      `helpers`; converted the 4 demos and documented it in `FORM-API.md`. - `publish:lib` uses `bun publish` (was `npm publish`) — staying on bun. The root stays
      `private` so it can't be published directly; we publish the generated `dist_module`. - `prepublishOnly`: `bun audit --prod && type-check && lint && test && build:lib`
      (skips spellcheck per Kevin). Moved `tsup` dependencies→devDependencies so `audit --prod`
      is clean (it's a build tool; was dragging in transitive advisories). - `publish:lib` now runs `prepublishOnly` first. NOTE: since we publish from `dist_module`
      (which has no scripts), the npm `prepublishOnly` lifecycle hook won't auto-fire — we
      invoke it explicitly via `publish:lib`. - ⚠️ Currently `prepublishOnly` **blocks at `lint`** on the 10 outstanding Track 4 errors
      (react-hooks/refs, jsx-a11y, set-state-in-effect). That's the gate working as intended —
      it goes green once Track 4 is resolved. audit + type-check already pass.
- [x] Rename `build-lib.js` → `scripts/build-lib.ts`, run via bun. ✅ `git mv` into a new
      `scripts/` folder; `node:` imports; internal `npx tsup` → `bunx tsup`; scripts now
      `build:lib: bun run scripts/build-lib.ts` and `publish:lib: bun run build:lib && …`.
      Verified `bun run build:lib` builds + emits the manifest. (Future `sync-version`/
      `check-deps`/`update-docs` live here too.)
- [x] Published manifest: add `author`, `bugs`, `homepage`. ✅ Done as part of the
      source-of-truth refactor — `build-lib` reads them from root and emits them; verified in
      `dist_module/package.json`.
- [x] **Tailwind 3 → 4 (demo-only hygiene).** ✅ Migrated to `tailwindcss@4` via the
      `@tailwindcss/vite` plugin (added to `vite.config.ts`). `src/index.css` is now a single
      `@import 'tailwindcss'`; deleted `tailwind.config.js` + `postcss.config.js`; removed
      `tailwindcss@3`/`autoprefixer`/`postcss` devDeps (v4 handles content detection + prefixing).
      Verified renders the same: built CSS contains all demo utilities; checked the v4 gotchas —
      bare `border`/`ring` were false positives (always paired with a color, or substrings), bare
      `rounded` is unchanged (.25rem), and the one real shift (`shadow-sm` enlarged in v4) was
      mapped to `shadow-xs` in the 3 spots so it matches v3's old value exactly
      (`0 1px 2px 0 rgba(0,0,0,.05)`). Published lib unaffected (zero CSS deps).

## 2. Zod 4 upgrade (the headline / major-version reason)

[changelog](https://zod.dev/v4/changelog) · [library authors guide](https://zod.dev/library-authors)

- [x] Bump `zod` to `^4` (root dep `zod@4.4.3`); published **peer dependency** now `zod: ^4`
      (verified in `dist_module/package.json`). `check-deps` passes.
- [x] `error.errors` → `error.issues` in [zod-helpers.ts](src/lib/zod-helpers.ts) (path narrowed
      to `(string|number)[]` since v4 issue paths are `PropertyKey[]`).
- [x] `SafeParseError` import removed — after the `result.success` early-return, `result.error`
      narrows directly, so the cast is gone. `ZodError` import kept. `z.ZodType<T>` still typechecks.
- [x] Demo + test schemas: `z.string().email()` → `z.email()`; `z.enum(..., { errorMap })` →
      `{ error }` (v4 renamed it).
- [x] **README note**: dev README + build-lib's generated README both state "Requires React 19
      and Zod 4; use 1.x for React 18 / Zod 3."
- [x] **Docs updated**: `ZOD-HELPERS.md` gains a Zod-4 requirements banner; `FORM-API.md` example
      uses `z.email()`. (Public helper API — `validate`/`validateAsync`/`ValidationError` — is
      unchanged, so no signature edits needed.)
- ✅ All green under Zod 4: type-check, lint, 69 tests, build:lib, prepublishOnly.

## 3. API additions (baked into 2.0)

Gaps spotted comparing to React Hook Form / Formik / TanStack Form. All additive (no breaking
changes). **Doing these before React Native** — they touch the core hooks, so it's cleaner to
stabilize the API before splitting entries / adding platform bindings. Implementation notes are
rough.

**Confirmed for 2.0:**

- [x] **`useArrayField` helper parity.** ✅ Added `insert(i, item)`, `prepend(item)`,
      `swap(a, b)`, `replace(newArray)`, `update(i, item)`. The reorder ops (`move`/`swap`/`insert`/
      `prepend`/`replace`) just compute the new array + an `indexMap` (old→new|null) and delegate to
      a new context primitive **`reindexArray`**; `prepend` = `insert(0, …)`; `update` = sugar for
      `setValue([...path, i], item)`. `reindexArray` atomically re-indexes touched + validation
      errors + the `serverErrorsRef` baseline in one dispatch and refreshes the array-path-level
      validation error (e.g. `z.array().min`), so there's no stale-baseline/stale-error edge case —
      and it fixed `move`'s latent version of the same bug. 8 new tests (insert shift, error follow,
      prepend, swap+errors, replace drop, update, server-baseline-after-reorder, array-level `.min`
      refresh). Demo: per-item "insert below" + Prepend/Append/Swap/Replace controls. FORM-API.md
      updated.
- [x] **Stable array item IDs (`useArrayField` → `arrayFieldIDs`).** ✅ Returned as a parallel
      `arrayFieldIDs: string[]` (named to avoid confusion with submission IDs). Use as the React
      `key` instead of index so focus/cursor/uncontrolled state survive reorders. **Context-integrated
      (Option B, pub/sub)**: the context broadcasts every structural array change via
      `subscribeArrayStructure` — `reindexArray`/`deleteField` send the old→new `indexMap`,
      `setValue(arrayPath,…)`/`reset` send a re-mint signal — and `useArrayField` subscribes and
      applies it. So ids follow items **no matter which mutation path** changed the array, including a
      **direct `form.deleteField([...path, i])`** from elsewhere (the case hook-local couldn't handle).
      Wholesale replacement (`setValue` on the array path, `replace`, `reset`) re-mints, which is the
      honest result (no old→new mapping). `add` routes through `reindexArray` (identity map) to keep
      ids; `update` keeps the id (sub-path set, no structural notify). Subscribers handle three
      change kinds: `reindex` (their own array — precise remap; OR an **ancestor** array — re-mint
      iff their pinned index's occupant changed, i.e. `indexMap(myIndex) !== myIndex`),
      `reset-subtree` (a wholesale `setValue` at/above their path — covers replacing a parent
      object), and `reset-all` (form reset). Render-time length check is a safety net. 18 tests incl.
      direct-context delete/setValue/reset, parent-object replace, and nested ancestor reorder.
      Demo keys `TodoItem` by `arrayFieldIDs[index]`. FORM-API.md updated. Array-only by design.
- [x] **`getFieldState(path)` convenience.** Returns `{ errors, error, isTouched, invalid, exists }`
      for one field in a single call. Pure read over existing `getError(path)` + `touched` + `hasField`;
      errors are raw (not touched-gated) so `invalid`/`error` reflect real validation state, and
      `exists` distinguishes a missing/typo'd path from a present valid one. Exported `FieldState` type.
      Docs + 3 tests (touched/invalid lifecycle; raw-vs-gated via server error; non-existent path).
- [x] **Submit-attempt flags.** Three reducer fields, framed as an _attempt_ so a failed submit
      doesn't read weirdly: **`submitAttempted`** (true once the user has tried to submit at all,
      pass or fail), **`submitSucceeded`** (true only if the most recent attempt completed cleanly:
      validation passed, `onSubmit` resolved without throwing, AND the handler set no submission
      errors — server or client submission), and **`submitCount`** (running count of attempts,
      bumped at the start of each `submit()` including validation failures). All set in `submit()`,
      all **cleared by `reset()` / `resetWithValues()`**. Went with the clearer names only — **no RHF
      aliases** (keeps the surface free of other-lib vocabulary). Success is detected via the
      already-cleared `serverErrorsRef`/`clientSubmissionErrorRef` being empty after the handler, so
      it captures handlers that report failure without throwing. FORM-API docs + 4 tests (clean
      submit lifecycle + count + reset; failed validation; handler-reported error; thrown handler).
- [x] **`setError(path, message)` for manual/client errors.** Targeted setter mirroring
      `setServerError`'s shape (string | string[] | null, null clears). **Decision resolved:** a
      manual error **survives re-validation, like server errors** — but since Zod validation errors
      are already `source: 'client'`, a `'client'`-tagged manual error would be wiped by the next
      validate. So manual errors get a **distinct `source: 'manual'`**, preserved alongside `'server'`
      in every validate-merge (`validateFunction`, `performInitialValidation`). They behave exactly
      parallel to server errors (survive validate, show regardless of touched via `useField`, clear on
      field edit / submit start / reset, follow the field through array reindex/delete via the
      existing `errorsRef` remap) — just a different label, and lighter plumbing (no parallel
      canonical ref). Does not gate `canSubmit` (schema-only). Also exposed on the `onSubmit` helpers,
      where setting one marks the attempt failed (`submitSucceeded` stays `false`, same as
      `setServerError`/`setClientSubmissionError`). Supports a root path (`setError([], msg)`) as a
      field-style form-level error — distinct channel from `setClientSubmissionError` (`'manual'` in the
      main error list vs `'client-form-handler'` in its own store). Added `'manual'` to the
      `ValidationError` source union; FORM-API "Error sources" table + form-level-channels note + 6 tests.
      Audit follow-ups (same change): fixed the array-level revalidation refresh in `reindexArray` +
      `deleteField` to preserve `manual` (not just `server`); the submit validation-fail merge now
      preserves `server`/`manual` consistently; `FormState` debug component got a dedicated "Manual
      Errors" section. Also made **`deleteField` (array item) re-index errors instead of wiping** —
      previously a remove dropped every error under the array and only Zod ones regenerated, losing
      `server`/`manual` errors on surviving (shifted) items; now it shares `reindexArray`'s remap
      (extracted to module-level `remapPathUnderArray`/`remapErrorsUnderArray`) so `useArrayField.remove`
      and direct `form.deleteField` shift later items' metadata down like the reorder ops. +2 tests
      (bisected), updated 1 existing test that encoded the old wipe behavior.
      Consistency pass (same change): unified `deleteField`'s array-item **touched** re-index to use the
      shared `remapPathUnderArray` (was a hand-rolled JSON-parse loop, now matches the error remap);
      **`setValue` now clears errors on the whole subtree** (path + descendants, all sources) not just the
      exact path, so replacing an object/array value drops stale child-field errors; **`clearValue` now
      delegates to `setValue`** so it clears errors + marks touched + re-validates instead of leaving stale
      errors behind. +2 bisected tests (clearValue clears errors; setValue clears stale child errors).
      Codex P2 fix: `setValue` now also syncs the `serverErrorsRef` baseline when clearing (path +
      descendants) — previously it cleared `errorsRef` only, so a later `setServerError` rebuilt from the
      stale baseline and resurrected a cleared server error (pre-existing for the exact path, widened by
      the cascade). Manual errors need no equivalent (no parallel baseline). +1 bisected test.
- [ ] **`validateField(path)` (manual per-field validate / "trigger").** `validate()` runs the
      whole Zod schema (no isolated field check). Implement as `setFieldTouched(path, true)` +
      `validateFunction()`: since error display gates on `touched`, only that field surfaces. ~15
      lines + test.
- [ ] **`AbortSignal` on the `onSubmit` helpers.** Today `reset(force)` only _invalidates_ a
      submission (flips `isSubmitting`, clears the submission ID so `helpers.*` writes no-op via
      `isCurrentSubmission`) — it does **not** abort the user's network call, and there's no signal
      handed to `onSubmit`. Add **`helpers.signal`** (an `AbortSignal`) that fires when the
      submission is superseded / force-reset / the provider unmounts, so users can just pass it to
      `fetch(url, { signal })` and get real cancellation instead of manually polling
      `isCurrentSubmission`. We already track the submission lifecycle that'd drive it — wire an
      `AbortController` per submit, `abort()` it on invalidate/unmount. Update the "Resetting
      mid-submit" docs once it lands.
- [ ] **`isDirty` + `dirtyFields`.** Derived from a **baseline** kept in a ref (starts =
      `initialValues`): `isDirty` = `!deepEqual(values, baseline)`, `dirtyFields` = the per-field
      diff. Enables "disable Save until changed." For "mark clean after a save," add a dedicated
      **`markPristine(path?, value?)`** (a.k.a. `commitValues`) that **only moves the baseline** —
      it never mutates form values/errors/touched and never force-flips the flag. `isDirty` is
      _always derived_ by comparing current values to the baseline, so `markPristine` just changes
      what we compare against and lets the comparison decide. Two knobs: - **`path`** (optional) scopes the baseline update to a single field/subtree; omit for the
      whole form. - **`value`** (optional) sets the baseline to an _explicit_ saved value rather than the
      current form value. This matters: a save often returns server-normalized data (trimmed
      strings, coerced numbers, server-filled fields), so baselining to **what actually
      persisted** is the correct comparison target. Defaults to the current value at `path`.

      Key consequence (this is the desired behavior): if the user kept typing past what was saved,
      the current value **won't match** the new baseline, so the field **stays dirty** — exactly
      right, there are real unsaved edits. This is the fundamental split from `reset`: `reset`
      **mutates values** to a target (forces a state), `markPristine` **mutates the baseline** and
      derives dirtiness from it. (RHF's nearest equivalent is `reset(values, { keepDirty: false })`,
      but it conflates the two; a focused baseline-only method reads cleaner.) So the dirty baseline
      can drift from the `reset()` baseline (`initialValues`) — intended: `reset()` = "back to
      load", `markPristine()` = "this is the new saved-clean reference."

- [ ] **`setFocus(path)` / `focusFirstError()`.** Needs a field-ref registry: `useField` spreads
      props but doesn't register the input centrally (RHF focuses via `register()`'s captured ref).
      Add a context `Map<serializedPath, { focus(): void }>` that `useField` populates, then walk
      error paths and `.focus()` the first match. **Pairs with the React Native track:** type the
      registry to `{ focus(): void }` (NOT `HTMLElement`) since RN `TextInput` refs expose
      `.focus()`, and have `useField` **expose a `ref`** for the consumer to attach
      (`<TextInput ref={field.ref} />`). Do it alongside RN field-wiring, not as a web-only add.

## 4. Code splitting (Unirend-style multi-entry exports)

Unirend uses conditional exports with separate entries, each emitting types/import/require.
Apply the same so the core is DOM-free and RN-friendly; debug tooling is opt-in.

- [ ] Define entry points: - `.` — core (`FormProvider`, hooks, zod-helpers) — **no DOM imports**. - `./devtools` — web `FormState` debug component (DOM). - `./devtools/native` — React Native debug component equivalent (see the React Native track).
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

## 5. Lint findings to triage (surfaced by the eslint 9.39 + react-hooks 7 + jsx-a11y upgrade)

`react/no-unescaped-entities` is **disabled** — we use Unirend's cherry-pick style (a few
`react/*` rules) instead of `react.configs.flat.recommended`, so that rule never turns on.
Remaining 13 findings:

- [x] **`react-hooks/refs` (6) — clean refactor.** ✅ The rule was right: the `contextValue`
      memo (reactive output) was reading refs. Fix = read **reactive state** there, keep refs for
      the synchronous submit/validation paths. `canSubmit` → reactive `canSubmit` state (+dep);
      `isValid` → `errors.length === 0 && (lastValidated !== null || !schema)` (a schema-less form
      is vacuously valid). Demo `ServerExample` read `formRef.current` in render → use `form`.
      Caught a real regression in review (schema-less isValid stuck false) — fixed + new test.
- [x] **`react-hooks/set-state-in-effect` (2).** ✅ FormState: derive `timeAgo` during render from
      a `now` tick (no setState-in-effect). Test helper: justified disable (intentionally remembers
      last non-null submission ID across clears).
- [x] **`jsx-a11y/label-has-associated-control` (2).** ✅ The two were group captions misusing
      `<label>`; converted to `<p>` (demo files).
- [ ] `react-refresh/only-export-components` (3) — deferred to the code-splitting track. Warnings,
      don't block the prepublishOnly gate.

## 6. Code review / scan

Done before Cursor had review tooling — re-run now.

- [ ] Run `/code-review high` on the working tree once changes are staged.
- [ ] Manual pass over `form-context.tsx` (1420 lines — the ref + reducer hybrid is the riskiest area for race conditions).
- [ ] Lint clean (`bun run lint`) and typecheck under the new Zod.

## 7. React Native support

Feasible — field binding is via hooks (render-agnostic). Only DOM hard-deps:

1. the optional `<form>` wrapper ([form-context.tsx:1412](src/lib/form-context.tsx#L1412)) —
   confirm it can be fully disabled (RN has no `<form>`).
2. `FormState` debug component (web-only) — replaced by a native equivalent via code splitting.

- [ ] Confirm `FormProvider` works with no `<form>` wrapper.
- [ ] Build a **React Native debug component** (the RN equivalent of `FormState`),
      shipped under `./devtools/native` (the code-splitting track).
- [ ] **Ship an Expo example.** For local dev, have users clone the repo and run a command
      that links the package locally (`bun link` / local file path) into the Expo app —
      no need to publish to test.
- [ ] Decide `react-native` export condition if RN needs a distinct core build.

## 8. Test coverage

- [x] Audit coverage. Found the hooks (`useArrayField`, and pre-validateOnBlur `useField`) and
      `FormState` had **zero** direct tests — they weren't even imported by the suite.
- [x] **Add hook tests.** ✅ `useField` → 100%, `useFormContext` (incl. the outside-provider
      throw) → 100%, `useArrayField` (items/add/remove/move + the move() error-reindexing) → 73%.
- [x] **Add `FormState` smoke test.** ✅ sections render, values shown, dark-mode toggle works
      (0% → 85%).
- [x] **Fixed a latent test-isolation bug:** `@testing-library/react`'s auto-cleanup never
      registered under `bun:test` (it looks for a global `afterEach`), so renders leaked across
      tests. Wired `afterEach(cleanup)` in `testSetup.ts` — hardens the whole suite.
- [x] **Coverage push (round 2).** Added `utils` (serialize/deserialize/cloneAlongPath/generateID + edge cases), `useArrayField` move() touched-reindexing, FormState value-type + all three
      error sections, and an onSubmit-`helpers` surface test (covers the big 1203–1276 block).
- [x] Submission flow (ID lifecycle, race/queueing, error sources, root messages) — already well
      covered by the existing `form-context.test.tsx`; the new helpers test adds the in-submit
      `helpers` surface on top.
- [x] **🐛 Bug found + fixed via the coverage push:** `getValuePaths` built array-item paths from
      `Object.entries`, which **stringifies indices** (`['items', '1', 'name']`) — but the rest of
      the lib uses **number** indices (`['items', 1, 'name']`), and `serializePath` makes those
      distinct keys. So `validate(true)`'s force-touch (and `getValueAtPath`) silently missed nested
      array fields — the original "validate(true) doesn't reach nested paths" suspicion. Fixed by
      restoring numeric indices when traversing arrays; added a regression test (fails pre-fix).
- [x] **Coverage push (round 3):** added `deleteField` tests (array-item delete clears under-array
      errors; field delete re-validates + merges → covered 869–886). **69 → 100 tests**, overall
      lines **~86% → 98.4%** (funcs ~98%). Per-file: form-context 94% · FormState 99% · useArrayField
      97% · utils 95% · useField/useFormContext/zod-helpers 100%. `prepublishOnly` green.
- [x] **🧹 Removed dead code:** `deleteField`'s array-item branch had a reindex `.map` that was
      **unreachable** — the preceding filter strips every under-array error before the map runs
      (verified: errors drop, then re-validation regenerates them). It was pure `.filter().map(identity)`,
      so collapsing to just `.filter()` is a zero-behavior change. form-context lines 94.4% → 96.9%.
- [x] **🔇 Quieted intentional-error tests:** several tests trigger the lib's own error/warn paths
      on purpose (onSubmit throw/reject, double-submit, reset-while-submitting) and assert the result.
      `testSetup.ts` now filters ONLY those known messages from console; everything else still prints.
- Remaining red is scattered 1–3 line edge guards (stale-submission branches, error-path mismatches) + 2 defensive `utils` lines — diminishing returns. Overall **98% lines / ~96% funcs**, 100 tests.

## 9. Hydration safety ✅ (verified — doc task only)

Scanned the lib: **no hydration hazards found.**

- `useReducer` initial state is deterministic ([form-context.tsx:174](src/lib/form-context.tsx#L174)).
- `generateID()` (`Date.now()+Math.random()`) only runs at submit time
  ([form-context.tsx:1168](src/lib/form-context.tsx#L1168)), never during render.
- No `useId` / `window` / `document` reads during render.

- [ ] Add a short README "SSR/Hydration" note: hydration-safe as long as the caller passes
      identical `initialValues` on server and client. (would go for the server errors warning stuff too)
- [ ] (Optional) Add an SSR render test (`renderToString`) to lock it in.

## 10. Features (emerged while dogfooding the demo)

- [x] **`validateOnBlur` (default true).** ✅ Found while playing with the demo: focusing a
      required field and leaving it empty did nothing — touched but never validated, so no error
      showed and the submit button sat disabled with no explanation ("broken button" feeling).
      Now leaving a field runs validation so its error surfaces. New `validateOnBlur` prop
      (default on; set `false` to opt out), wired in `useField`'s blur handler (kept separate from
      `setTouched` so typing doesn't double-validate via `validateOnChange`). Tests + FORM-API.md
      updated. (Submit button stays disabled by design — the blur errors now guide the user.)
- [x] **`form.handleBlur(path)` context method.** ✅ validateOnBlur lived only in `useField`, so
      raw-context fields (the MultipleChildren demo) missed it. Centralized blur (touch + validate-
      if-enabled) as a context method; `useField` uses it; raw-context fields call `form.handleBlur`.
      Converted MultipleChildren to `useField` (it also wasn't gating errors on touched, so blur
      revealed _all_ errors). Tests + FORM-API.md updated.
- [x] **`validateOnMount` now touches only populated fields** (+ `touchAllOnMount` opt-in). ✅
      Previously it marked _every_ field touched, so an empty form with validateOnMount flashed all
      errors on load. Now it validates (so `canSubmit` is correct) but only touches fields that have
      values — prefilled/loaded data shows its errors; empty fields stay quiet until touched. Set
      `touchAllOnMount` to restore the old reveal-everything behavior. Added `isEmptyValue` util.
      Tests + FORM-API.md updated.
- [x] **`initialServerErrors` prop.** ✅ Server errors could previously only be set via the API
      (`setServerErrors`/`setServerError`, or `onSubmit` helpers). Added a declarative prop to seed
      them at mount — useful for SSR hydrating a record the server already flagged. Normalized to
      `source: 'server'`, touch-independent, merges as the baseline for later API calls, cleared by
      `reset()`. Seeds reducer state + `errorsRef` + `serverErrorsRef`. Prefilled demo gained a 4th
      sub-tab ("Server errors at mount") with a root + two field errors. Tests + FORM-API.md updated.

## 11. Release

- [ ] Bump root `package.json` to `2.0.0` (single source of truth; everything syncs from it).
- [ ] CHANGELOG / release notes covering the Zod 4 break + the new APIs (§3).
- [ ] `bun run build:lib` and verify `dist_module/`.
- [ ] Publish.
