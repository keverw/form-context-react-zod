# form-context-react-zod — React Native demo

A small [Expo](https://expo.dev) app that runs **the same library** the web demo
uses, to prove it works on React Native. It depends on the built package via a
`file:` link (`form-context-react-zod: file:../../dist_module`), so the app
exercises the real published entry points — including `./devtools/native` and the
shared `./context` singleton — exactly as a published consumer would.

## Why this works with (almost) no library changes

The core is already platform-agnostic:

- `FormProvider` (the core entry) renders no host elements — no `<form>` — so it's
  React-Native-safe as-is. (The web `<form>` lives in `form-context-react-zod/web`.)
- `useField(...).props.onChange` is **value-based** — it receives the new value,
  not a DOM event — which maps 1:1 onto `<TextInput onChangeText>`. So only the
  input _adapter_ differs between web and native, not the hook.

See [`src/RNFormInput.tsx`](src/RNFormInput.tsx) for the ~15-line adapter. The
debug panel is the **published** `FormState` from `form-context-react-zod/devtools/native`.

## Run it

```bash
# 1. Build the library (the demo links the built package, not the source):
cd ../..            # repo root
bun run build:lib

# 2. Install + build/run the app:
cd examples/native
npm install            # links file:../../dist_module + pulls Expo / React Native
npx expo run:ios       # or: npx expo run:android
```

This demo defaults to a **development build** (it depends on `expo-dev-client`),
which mirrors how a real shipped Expo app runs — Expo Go is only a dev shortcut.

- **Dev build (default)** — `npx expo run:ios` / `run:android` compiles a native
  app and launches it. Needs **Xcode** (iOS) or **Android Studio** (Android); a
  free Apple ID signs iOS for ~7 days. Because it's a real native build, `app.json`
  sets `ios.bundleIdentifier` / `android.package` (both `com.keverw.formcontextdemo`)
  — without those it errors with _"Required property 'ios.bundleIdentifier' is not
  found"_. After the first build, `npm start` then `i` / `a` opens the installed
  dev build.
- **Expo Go (fallback)** — no native toolchain: `npm start`, press `s` to switch
  to Expo Go, then `i` / `a` or scan the QR. Requires an Expo Go that supports
  **SDK 54** (update the app if it complains about a version mismatch).

> Rebuilt the library? Re-run `bun run build:lib` (the `file:` link points at
> `dist_module`, so a rebuild is picked up; restart Metro with `npm start -c` to
> clear its cache).

## Building a dev build (iOS / Android)

New to Expo? A dev build is **your own** native app (vs the shared Expo Go shell).
`npx expo run:*` compiles it once, installs it on the simulator/device, and starts
Metro; after that, JS edits hot-reload over `npm start` — you only rebuild when
native code or native deps change. The first build is slow (CocoaPods / Gradle);
later launches are fast. `expo run` also generates `ios/` and `android/` native
folders — they're git-ignored here; delete them anytime to regenerate.

### iOS (macOS only)

- **Prereqs:** [Xcode](https://apps.apple.com/app/xcode/id497799835) + its Command
  Line Tools (`xcode-select --install`), and CocoaPods (`brew install cocoapods`).
  This demo pins **Expo SDK 54** (RN 0.81), which builds on **Xcode 16.x** — no
  macOS upgrade needed. (Newer SDKs jumped to the Swift 6.2 toolchain / Xcode 26;
  SDK 54 deliberately avoids that so the dev build works on older setups. No Xcode
  at all? Use the Expo Go fallback above — it needs no native toolchain.)
- **Simulator:** `npx expo run:ios`
- **Real iPhone:** plug it in via USB, then `npx expo run:ios --device` (pick your
  phone). A **free Apple ID** signs it for ~7 days — set your signing team once in
  Xcode: open `ios/native.xcworkspace` → target → _Signing & Capabilities_ → select
  your team. On first launch, trust the cert on the phone under _Settings → General
  → VPN & Device Management_.

### Android

- **Prereqs:** [Android Studio](https://developer.android.com/studio) → install an
  SDK + create an emulator (AVD); install **JDK 17**; set `ANDROID_HOME` and
  `JAVA_HOME`.
- **Emulator:** launch an AVD (or let the CLI boot one), then `npx expo run:android`
- **Real device:** enable _Developer Options → USB debugging_, plug in, then
  `npx expo run:android`

### Requirements / gotchas

- **Node LTS** (20 or 22) is the safe choice for the Expo/Metro toolchain.
- [`metro.config.js`](./metro.config.js) has a few lines so SDK 54's Metro can
  consume the `file:`-linked package: watch `dist_module`, enable
  `exports`-map resolution, and pin `react` / `react-native` / `zod` (and the
  package's own name) to this app's copies. Newer Metro does this automatically;
  here it's explicit. No `babel.config.js` is needed.

## What's in it

| Tab   | Shows                                                           |
| ----- | --------------------------------------------------------------- |
| Basic | name + email, Zod validation, validate-on-blur, submit          |
| Array | `useArrayField` — add / remove / reorder items, per-item errors |

Each tab renders a live `FormState` panel (values, validity, dirty, errors).
