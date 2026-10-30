# HV Song Tagger desktop app

A small desktop app (Mac and Windows) built with [Tauri](https://tauri.app). Its
interface is the page in [`../app`](../app); this folder adds the native side.

## Why an app, not a web page

Planning Center's API doesn't send browsers the CORS header they need to read a
reply made with a Personal Access Token, so a web page can't use a key. In the
browser, `app/` runs only the practice mode. In the app, the native side
(`src-tauri/src/main.rs`) makes the Planning Center requests instead.

## What the native side allows

The page can call only these commands:

| Command | What it does |
|---|---|
| `set_key`, `remember_key`, `use_saved_key`, `forget_key` | Hold the key in memory, and optionally keep it in the Mac Keychain or Windows Credential Manager. A saved key is never sent back to the page. |
| `pco_request` | One `GET` or `POST` to `https://api.planningcenteronline.com/services/v2/` and nowhere else. It never follows redirects. |
| `save_file` | Shows a Save dialog and writes the file the person chose. |
| `open_url` | Opens an allowed help or Planning Center address in the default browser. |

The page itself has no network access: `build-frontend.mjs` copies `app/` into
`dist/` and narrows its Content Security Policy to the app's own channel.

## Build

You need [Node.js](https://nodejs.org) and [Rust](https://rustup.rs).

```bash
cd desktop
npm install
npm run build        # the app lands in src-tauri/target/release/bundle/
```

`npm run dev` opens it with live reload. `cd src-tauri && cargo test` runs the
native-side tests (the second one makes a request to Planning Center with a
made-up key and expects a 401).

## Not done yet

- **Signing.** Unsigned builds downloaded from GitHub get macOS's Privacy &
  Security warnings and Windows SmartScreen. A signed and notarized Mac build
  needs an Apple Developer ID; Tauri reads it from `APPLE_SIGNING_IDENTITY`,
  `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` at build time.
- **Release builds** for both platforms from GitHub Actions.
