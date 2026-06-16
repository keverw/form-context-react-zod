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
      from root. A public `VERSION` export would just be dead weight. - ✅ `scripts/update-docs.ts` — stamps the version into the README's **H1 title**
      (`# Form Context React Zod vX.Y.Z`), Unirend-style, from root version. The same README
      is copied into `dist_module` during `build:lib`, so repo and package docs share one
      source. Verified both branches (corrects stale, stamps bare title).
      (markdown-toc-gen TOC not added — README is short.)
- [x] **README drift.** Updated decision: root `README.md` is now the single source of truth.
      `build-lib` copies it into `dist_module/README.md` instead of generating a separate
      published README, and the native demo README points back to the consolidated root docs.
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
- [x] **`validateField(path)` (manual per-field validate / "trigger").** Marks the field touched and
      runs the full schema (Zod can't validate one field in isolation — refinements span fields), but
      **reconciles only that field's `client` error** (drop stale, re-add fresh if still invalid;
      server/manual at the path untouched), then returns whether the field is now error-free (any
      source). Went beyond the bare `setFieldTouched + validateFunction` sketch because
      `validateFunction` skips rewriting `errorsRef` when the whole form is valid, which would leave a
      now-valid field's stale error — the per-field reconcile handles that. **Not** gated on
      `validateOnBlur`/`validateOnChange` (unlike `handleBlur`) and returns a boolean. Context-only (not
      an onSubmit helper). FORM-API entry + `validateField` vs `handleBlur` note + 2 tests.
- [x] **Per-field subscriptions (re-render isolation).** Was the biggest scale gap: React context
      re-renders every consumer on any change, so all fields re-rendered on every keystroke (fine at 5
      fields, felt at 100+). Fixed by adding a stable companion `FormFieldContext` (methods via an
      effect-refreshed ref + stable `useMemo`, so its identity never changes) with `subscribeField` +
      a per-path-cached `getFieldSnapshot`; `useField` and `useArrayField` now read their own slice via
      `useSyncExternalStore`, so editing one field re-renders only that field. A 50-field form drops from
      ~50 field re-renders per keystroke to 1. Reactive `FormContext` untouched (whole-form consumers
      unchanged) — internal only, just a docs blurb. Covered by a dedicated subscription suite (every
      mutation path + unmount cleanup) and bisected isolation tests. _Skipped:_ a real-browser benchmark
      (render-count test already quantifies it). _Deprioritized: typed field paths_ — `(string|number)[]`
      is fine for dogfooding our own SaaS; the autocomplete/refactor payoff is mostly for external users.
- [x] **Cross-field revalidation on change.** `setValue` used to recompute the full schema but only
      write back the **edited field's** Zod error, so a `.refine()` landing on a _sibling_ (classic
      "passwords must match") didn't update until that sibling was blurred/submitted. Now `setValue`
      replaces **all** Zod ('client') errors form-wide from the fresh result (server/manual preserved,
      except stale ones under the edited subtree), so cross-field errors update live. Display stays
      touch-gated (untouched siblings stay quiet), and it pairs with the subscription work so only the
      affected sibling re-renders. +2 bisected tests (live update on a touched sibling; stays hidden when
      untouched).
- [x] **`AbortSignal` on the `onSubmit` helpers.** Added **`helpers.signal`** — a per-submit
      `AbortController`'s signal, aborted when the submission is force-reset (`reset(true)` /
      `resetWithValues(_, true)`) or the provider unmounts, so users pass it to `fetch(url, { signal })`
      for real cancellation. A normal completion doesn't abort; the controller is cleared in `submit`'s
      `finally` so a later force-reset can't abort a finished request. FORM-API "Resetting mid-submit"
      updated with the recipe; +3 tests (abort on force-reset, abort on unmount, no abort on normal
      submit).
- [x] **`isDirty` + `dirtyFields` + `markPristine`.** Both derived (never force-flipped) by comparing
      current values against a **dirty baseline** held in reactive state (`useState`, starts =
      `initialValues`). `isDirty` = any leaf differs; `dirtyFields` = `Record<serializedPath, true>`
      (same shape as `touched`). New `deepEqual` + `flattenLeaves` utils back the diff. `reset()` /
      `resetWithValues(x)` move the baseline back to their target (clean after reset); they stay separate
      from the dirty baseline so the two can drift — `reset()` = "back to load", `markPristine()` =
      "new saved-clean reference." **Decisions made while implementing:** - **Objects key-precise, arrays cascade** (`diffDirtyFields`). Plain objects compare key by key
      (editing `meta.a` leaves `meta.b` clean). A dirty array marks its own path AND **every field under
      it recursively** — any edit/add/remove/**reorder** dirties the whole subtree up to the outermost
      changed array. Chosen so a generic field component can always check its own path and get a sensible
      answer even inside arrays; tradeoff is no per-item attribution (indices aren't stable identities —
      a prepend would falsely flag every row). Per-item-by-id is left to the stable `arrayFieldIDs` and
      the sub-form composition pattern. Reference-equality short-circuit keeps it O(path depth) per edit.
      Decided with the user after weighing per-index/per-id alternatives. - **Batch shape = nested partial** mirroring the values shape (the friendlier API), applied at the
      **leaf** level so unmentioned sibling baselines survive (a clean field stays clean). - **`markPristine` overloads:** `()` whole form, `(path)` field→current value, `(path, value)`
      field→explicit persisted value, `(serverResult)` batch. Named function expression so it can read
      `arguments.length` to distinguish `(path)` from `(path, undefined)`. - **Exposed on `FormHelpers`** too (`helpers.markPristine`) — the primary flow is re-baselining to
      the server's returned record inside `onSubmit`. Forwarded via `...args` to preserve arg count.
      +14 tests (`useDirty.test.tsx`: derive/per-field/array-leaf/reset/all 4 overloads/batch-leaf-granularity/
      helpers-forwarding) + util tests; FormState debug panel shows a Dirty/Pristine chip + Dirty Fields
      section. Baseline-only: never touches values/errors/touched (bisected).

- [x] **`setFocus(path)` / `focusFirstError()`.** Field-ref registry built RN-first: - `Focusable = { focus?(): void }` (NOT `HTMLElement`) — DOM `<input>`, RN `TextInput`, or any
      node with `focus()` all satisfy it; the core imports no DOM types. - Registry is a `Map<serializedPath, Focusable>` in a provider ref. `FormFieldContext` gains a
      stable `registerFieldRef(path, node|null)`; `useField` exposes an `inputRef` callback the
      consumer attaches (`<input ref={inputRef} />` / `<TextInput ref={inputRef} />`). - `setFocus(path)` → `node.focus()` (+ feature-detected `scrollIntoView()` for web). Returns
      whether a focusable was found. `focusFirstError()` scans the registry in **registration order**
      (≈ mount/source order, NOT DOM position — identical on RN) and focuses the first path with an
      error; returns the path or `null`. Both also on `FormHelpers` (guarded) for use in `onSubmit`. - Named `inputRef`, not `ref`: the react-hooks `refs` lint rule taints a `.ref` member access in
      render; destructuring (`const { inputRef } = useField(...)`) keeps consumer code lint-clean.
      +14 tests (`useFocus.test.tsx`: focus by path, unregistered→false, unmount unregister, first-error
      ordering, skip-valid, none→null, helpers after a server error) — registry cleanup bisected. Docs:
      "Focus management" section. Note: when code-splitting (§4), `setFocus`'s `scrollIntoView` stays
      feature-detected so the core entry remains DOM-free.

> **Non-goal: typed paths.** Sticking with string/array paths. Type-safe `Path<T>`/`PathValue<T,P>`
> would be **type-only** (no runtime change, so fully additive later if ever wanted) — but **not easy**:
> the recursive path types are gnarly, can slow `tsc`, and give ugly errors. Type-only ≠ trivial. Not planned.

## 4. Code splitting (Unirend-style multi-entry exports)

Unirend uses conditional exports with separate entries, each emitting types/import/require.
Apply the same so the core is DOM-free and RN-friendly; debug tooling is opt-in.

- [x] Define entry points: - `.` — core (`FormProvider`, hooks, zod-helpers) — **no DOM imports**. - `./devtools` — web `FormState` debug component (DOM). - `./devtools/native` — React Native debug component equivalent (see the React Native track). _Shipped: `.` (DOM-free core) + `./web` (adds `<form>`/`useFormTag`, exports `WebFormProvider`) + symmetric `./devtools/web` & `./devtools/native` debug panels + internal `./context`. (Renamed the web debug entry from bare `./devtools` → `./devtools/web` for symmetry with `/native`.)_
- [x] Update tsup config for multiple entries; update generated `package.json` `exports`/`files`. _Object `entry` (index/devtools/context), `splitting: false`; generated `exports`/`files` updated (incl. a glob for the hashed shared dts chunk)._
- [x] Move `FormState` out of the root `index.ts` barrel into the `devtools` entry. _New `src/lib/devtools.ts` barrel; now `import { FormState } from 'form-context-react-zod/devtools'`._
- [x] ⚠️ **Singleton concern: the contexts must be ONE instance across entries.** NOTE: there are
      now **TWO** contexts — `FormContext` (reactive, whole-form) **and** `FormFieldContext` (stable,
      per-field subscriptions). Both must be single shared instances. If `./devtools` bundles its own
      copy of either `createContext()` call, `FormState`'s `useContext(FormContext)` (and `useField`'s
      `useContext(FormFieldContext)`) returns `null` even though the app rendered `FormProvider` from `.`.
      Fix the Unirend way ([its tsup.config.ts](https://github.com/keverw/unirend/blob/master/tsup.config.ts)):
      put **both** contexts in their **own entry** and mark it **external** so every other entry
      imports the shared instances instead of inlining a copy (Unirend uses an esbuild `onResolve`
      plugin to redirect `./context` imports to the shared subpath). The same applies to the type side —
      a duplicated context type breaks nominal identity.
      _Done the Unirend way: both contexts live in `src/lib/context.ts` (its own `./context` entry);
      an esbuild `onResolve` plugin rewrites relative `./context`/`../context` imports to the external
      `form-context-react-zod/context`, so every entry shares one instance. Verified at runtime:
      `core.FormContext === context.FormContext` (and FormFieldContext), `createContext` appears only in
      `context.js`. Type side stays structural per Unirend's note — a runtime-JS concern, not a dts one._
- [x] `react-refresh/only-export-components` (3 warnings) — re-evaluate / resolve here, since
      splitting components out of barrels into dedicated entries naturally addresses it.
      _The two lib warnings (the `createContext` calls in `form-context.tsx`) are resolved by moving the
      contexts into `context.ts`. The remaining 2 are in the demo's `src/components/Toast.tsx` (app, not
      the published lib) — out of scope for the library build._

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
- [x] `react-refresh/only-export-components` (3) — resolved in the code-splitting track. The 2 lib
      warnings cleared when the contexts moved to `src/lib/context.ts`; the 2 demo `Toast.tsx` warnings
      cleared by moving the non-component exports (`useToastContext`, `showToast`, types, global decl)
      into a JSX-free `src/components/ToastContext.ts`. Lint is now **0 warnings**.

## 6. React Native support

Feasible — field binding is via hooks (render-agnostic). Only DOM hard-deps:

1. the optional `<form>` wrapper ([form-context.tsx:1412](src/lib/form-context.tsx#L1412)) —
   confirm it can be fully disabled (RN has no `<form>`).
2. `FormState` debug component (web-only) — replaced by a native equivalent via code splitting.

- [x] Confirm `FormProvider` works with no `<form>` wrapper. _Refactored: the `<form>` is gone
      from the core entirely. The DOM-free base `FormProvider` lives in [form-context.tsx](src/lib/form-context.tsx)
      (renders only the context providers + children); the `<form>`/`useFormTag`/`formProps` moved to a
      **web** `FormProvider` in [form-provider-web.tsx](src/lib/form-provider-web.tsx), shipped from the
      new `./web` entry. `.` is now truly DOM-free (verified: no `"form"` host element in the core bundle).
      Web users who want the tag import from `form-context-react-zod/web`._
- [x] Build a **React Native debug component** (the RN equivalent of `FormState`),
      shipped under `./devtools/native`. _[FormStateNative.tsx](src/lib/components/FormStateNative.tsx)
      (View/Text/ScrollView), barrel [devtools/native.ts](src/lib/devtools/native.ts), 5th tsup entry
      → `dist_module/devtools/native` (sibling of `devtools/web`). `react-native` added as a devDep + optional peer, marked external
      in the build. Verified: native bundle `require("react-native")`, shares the context singleton, dts
      references RN types. The Expo demo consumes the **published** entry (dogfooded), not a local copy._
- [x] **Ship an Expo example.** _[examples/native](examples/native) — a runnable Expo app (SDK 54,
      RN 0.81, React 19.1) that depends on the **built** package via `file:../../dist_module`, so it
      exercises the real published entries (incl. `./devtools/native` + the `./context` singleton). Two
      screens (Basic, Array), a TextInput adapter ([RNFormInput](examples/native/src/RNFormInput.tsx)),
      and the published native `FormState`. **Verified by actually bundling** — `npx expo export --platform
ios` succeeds (660 modules) and the demo type-checks. Pinned to SDK 54 (not the latest 56) so the
      dev build runs on Xcode 16.x — SDK 56/RN 0.85 needs Swift 6.2 / Xcode 26. SDK 54's older Metro needs
      a small [metro.config.js](examples/native/metro.config.js) (watchFolders + `exports` + peer pinning)
      to consume the `file:`-linked package. Run: `bun run build:lib` then `cd examples/native &&
npm install && npm start`._
- [x] Decide `react-native` export condition if RN needs a distinct core build. _Not needed: the core
      (`.`) is DOM-free and works as-is on RN, so no `react-native` condition / distinct build. `react-dom`
      is an optional peer. (A `react-native` condition would only come into play for `./devtools` web-vs-native.)_

## 7. Test coverage

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

## 8. Hydration safety

No hydration _mismatch_ hazards (values are deterministic):

- `useReducer` initial state is deterministic ([form-context.tsx:174](src/lib/form-context.tsx#L174)).
- `generateID()` (`Date.now()+Math.random()`) only runs at submit time
  ([form-context.tsx:1168](src/lib/form-context.tsx#L1168)), never during render.
- No `useId` / `window` / `document` reads during render.

- [x] **SSR crash fix (`getServerSnapshot`).** The earlier "no hazards" scan looked for value
      mismatches but MISSED that `useField`/`useArrayField` called `useSyncExternalStore` with only two
      args. React **throws** `Missing getServerSnapshot, which is required for server-rendered content`
      on any server render (Unirend uses `renderToString`) — so the lib could not SSR at all, not just
      mismatch. The 3rd arg is an internal hook detail — consumers pass NOTHING extra; they just need to
      hand the same `initialValues` to server and client (already required). Fixed by passing the same
      ref-backed snapshot reader as the 3rd arg; on the server the refs already hold `initialValues`, so
      SSR output == client hydration. +3 `renderToString` tests (`useSSR.test.tsx`: useField,
      useArrayField, schema+validateOnMount); bisect reproduced the exact React error with the arg removed.
- [x] Added a short README "SSR/Hydration" note: server-render safe (`renderToString` + streaming),
      hydration-safe as long as the caller passes identical `initialValues` (and `initialServerErrors`)
      on server and client.

## 9. Features (emerged while dogfooding the demo)

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

## 10. Release

- [ ] Reconsidering merging the reads me and moving the other docs to a separate doc folder
- [ ] Then should do a overall code review/docs review - I have a prompt I like to use for this..... and readme consinstsity tasks
- [ ] Bump root `package.json` to `2.0.0` (single source of truth; everything syncs from it).
- [ ] CHANGELOG / release notes covering the Zod 4 break + the new APIs (§3).
- [ ] `bun run build:lib` and verify `dist_module/`.
- [ ] Delete the old plan so less noise
- [ ] Publish both package and updated github pages (bun run deploy)?
