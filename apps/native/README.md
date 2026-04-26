# @scrollect/native

Scrollect mobile app (Expo managed workflow + Expo Router + React Native + NativeWind).

## Status

M1 foundation: blank app that boots on iOS and Android simulators.
See issue [#241](https://github.com/jagoral/scrollect/issues/241) for the full mobile MVP epic.

## Stack

- Expo SDK 55 (pinned)
- React 19.2 / React Native 0.83
- Expo Router (file-based routing under `app/`)
- NativeWind v5 preview + Tailwind v4 + react-native-css

## Local development

From the repo root:

```bash
bun install
bun run dev:native
```

Then:

- Press `i` for iOS Simulator
- Press `a` for Android Emulator
- Press `w` for web

## EAS

The workspace is linked to an EAS project via `extra.eas.projectId` in `app.json`. Native builds run on EAS, not via `turbo build`.

Build profiles in `eas.json`:

- `development` - dev client builds for simulators / internal devices
- `preview` - internal distribution preview builds
- `production` - store builds with auto-incremented build numbers

Trigger a build with `eas build --profile <name> --platform <ios|android>` from this directory.
