# Releasing ClipVault (v1.6+)

This document describes how to cut a release **with a working auto-updater**.
Since v1.6, ClipVault ships a signed auto-updater channel backed by GitHub
Releases: installed apps check `latest.json` on startup (and via
Settings → Updates) and can download + install + relaunch without any user
tooling.

## 1. One-time setup — the signing key

The updater verifies update packages with a minisign keypair. The **public
key is already embedded** in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).

The **private key** must be kept secret and used at build time:

- File: `clipvault.key` (generated for v1.6, passwordless).
- Store it somewhere safe (password manager / encrypted drive). If it is
  lost you can no longer sign updates — you would have to ship a new pubkey
  in an app release first.

## 2. Build a signed release

```bash
# version bump first (all four places):
#   package.json · src-tauri/tauri.conf.json · src-tauri/Cargo.toml · src/version.ts

npm install
npm run tauri build

# Sign with the updater key (PowerShell):
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "C:\path\to\clipvault.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""      # key has no password
npm run tauri build
```

Tauri produces, under `src-tauri/target/release/bundle/`:

| Artifact | Purpose |
|---|---|
| `nsis/ClipVault_<v>_x64-setup.exe` | full installer (also the updater package on Windows) |
| `nsis/ClipVault_<v>_x64-setup.exe.sig` | minisign signature — required by the updater |

## 3. Publish `latest.json`

Create a GitHub release tagged `v<version>` and attach **both** the
`-setup.exe` and its `.sig` file. Then attach a `latest.json` that points at
the exe (the URL must be reachable, so use the release download URL):

```json
{
  "version": "1.6.0",
  "notes": "Backup export/import, auto-updater, duplicate cleaner, screenshot annotation editor.",
  "pub_date": "2026-09-20T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<contents of the .sig file, one line>",
      "url": "https://github.com/yalaahamdy/ClipVault/releases/download/v1.6.0/ClipVault_1.6.0_x64-setup.exe"
    }
  }
}
```

Because the app fetches
`https://github.com/yalaahamdy/ClipVault/releases/latest/download/latest.json`,
the file must be attached to **every** future release. That endpoint always
resolves to the newest release, so no app-side change is ever needed.

## 4. Verify the channel

1. Install the previous version (e.g. 1.6.0).
2. Publish a newer release (e.g. 1.6.1) with its `latest.json`.
3. Start the old app → within ~10 s a toast appears
   ("يتوفر تحديث جديد … / New update … available").
4. Settings → Updates shows the release-notes card; **Download & install**
   downloads, verifies the signature, installs and relaunches.

## Notes

- The updater uses `installMode: passive` on Windows (silent with progress).
- Update checks respect the user setting (`autoUpdate`); failure to reach
  GitHub is always silent in the UI.
- The signing key never lives in the repository.
