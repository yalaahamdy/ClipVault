# Changelog

All notable changes to **ClipVault** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.6.0] - 2026-09-20

### Added
- **Full Backup Export / Import (نسخ احتياطي وتصدير/استيراد)**: one `.cvbak` envelope file carries the entire history — items, tags, collections and whitelisted settings — with optional AES-256-GCM encryption from a user password (key derived per-export with a fresh salt; the header stays inspectable without the password). Import offers **Merge** (skip existing by content hash) or **Replace** (wipe then restore) modes, restores image files, rebuilds tag/collection links, and reports a full breakdown. The password vault is intentionally excluded (it keeps its own CSV export).
- **Auto-Updater (التحديث التلقائي)**: `tauri-plugin-updater` integration pinned to the GitHub Releases channel (`latest.json`, minisign-verified with the new embedded public key). Silent check at startup (respects the new `Check automatically at startup` setting), an Updates section in Settings with manual *Check now*, a release-notes card and one-tap **Download & install** followed by an automatic relaunch. Release signing keypair generated; `latest.json` template and the signing workflow are documented in `RELEASING.md`.
- **Duplicate Cleaner (تنظيف التكرارات)**: a Settings action that merges historical duplicates created before v1.5's hash-based dedup — the survivor keeps the highest flag/usage, counters are summed, `created_at`/`last_used_at` take the min/max, tags & collections are re-pointed, and orphaned images are cleaned. Shows the live duplicate-group count before cleaning.
- **Screenshot Annotation Editor (تعليق على لقطات الشاشة)**: after dragging a snip region, a floating bar offers *Quick copy* (`Enter`, the instant v1.5 path) or *Annotate & edit* (`A`). The new full-screen canvas editor draws at the crop's native resolution (CSS only scales the view) with: freehand pen, arrows with sized heads, rectangles, ellipses, text (full Arabic shaping via the platform text engine, halo-outlined for readability), mosaic blur, 7-color palette, 3 stroke widths, and unlimited undo/redo (`Ctrl+Z` / `Ctrl+Y`). Saving routes the edited PNG through the same store → OneOCR → clipboard pipeline (`snip_commit_annotated`), with Back-to-selection and Discard actions.

### Changed
- Duplicate capture already merged rows since v1.5; the new cleaner extends this to legacy rows (Settings → Maintenance & backup).
- Backup/updater UI is bilingual (Arabic/English) and follows the app-wide i18n system.
- Version bumped to 1.6.0 across `package.json`, `tauri.conf.json`, `Cargo.toml`, `version.ts`.

## [1.5.0] - 2026-09-20

### Added
- **Region Screenshot → OCR (لقطة شاشة → نص)**: press `Ctrl+Shift+S` anywhere (or the new launchpad card / toolbar button) to freeze the screen and drag-select any region; the shot is cropped natively (GDI), stored in the history, run through OneOCR instantly, and copied to the clipboard. New dedicated frameless overlay window with live size badge, dimmed mask, and Esc-to-cancel.
- **Quick Transforms menu (تحويلات سريعة)**: right-click any text-bearing item → 18 one-tap transforms in four groups — Letter case (UPPER / lower / Title / Sentence), Lines (trim, collapse spaces, remove empty, dedupe, sort A→Z / Z→A, join lines), Data & encoding (JSON pretty / minify, URL encode / decode, Base64 encode / decode), Cleanup (strip HTML tags, remove Arabic diacritics). Every result is copied and saved as a new item automatically.
- **QR Code sharing**: generate an offline QR code for any text or link (Rust `qrcode` engine), with copy-image and download-PNG actions in a dedicated modal.
- **Multi-select, Merge & Sequential Paste**: toggle selection mode from the toolbar, select items with plain/Ctrl/Shift+click, then paste them one-by-one in order (700 ms pacing) or merge them into a single new text item with a configurable separator (newline / space / Arabic comma / comma / custom) and a live preview.
- **Full English localization (i18n)**: the entire UI — shell, clipboard, context menus, settings, vault, smart typing suite, preview, snip, dialogs — is now fully bilingual Arabic ⇄ English with instant switching (`Settings → UI language` or `Ctrl+L`), automatic RTL ⇄ LTR layout flip, locale-aware dates, relative times and source-app names, and Segoe UI typography for English. ~285 strings translated.
- **Global shortcut `Ctrl+Shift+S`** for region snip, with collision-safe registration and exact-token shortcut routing.

### Fixed
- **Syntax highlighter corruption** (pre-existing): sequential highlighting passes re-matched their own injected markup (e.g. `class` inside generated `<span>` tags), corrupting code previews — replaced with a single prioritized tokenizer pass.
- Context-menu submenus could open off-screen near window edges in RTL — now flipped and clamped inside the window.
- Code viewer inherited RTL direction, starting lines at their end — code is now always LTR.
- Selection action bar overflowed the narrow popup window — now wraps and stays centered.
- Password strength labels and vault card dates are now locale-aware.

### Changed
- Global shortcut handler routes by exact final key token (robust against "Shift" containing "s"/"x" substrings).
- Settings storage now persists the UI language (`lang` key).

## [1.0.0] - 2026-09-18

### Added
- **Core Architecture**: Ultra-lightweight Tauri v2 + Rust backend with React 18 + TypeScript frontend.
- **Ultra-Fast Clipboard Monitor**: Windows `GetClipboardSequenceNumber` sequence tracking with virtually zero CPU footprint (<0.1%).
- **Multi-Format Support**: Plain text, Rich text HTML, Images (PNG, JPEG, WebP, SVG, GIF, BMP, ICO), File lists (HDROP), and URL links.
- **Modern Luxury UI/UX**:
  - Windows 11 Acrylic translucent backdrop with frameless rounded design.
  - Native RTL (Arabic-first) typography utilizing IBM Plex Sans Arabic.
  - Interactive tactile 3D buttons with realistic press states and depth shadows.
  - Smooth dark/light theme switching with custom accent colors.
- **Pro Universal Preview Modal**:
  - Full-screen zoomable/pannable image viewer with checkerboard transparency grid and rotation.
  - Live sandbox HTML viewer with desktop & mobile viewport switching.
  - Tokyo Night & One Dark Pro syntax highlighted code viewer with automatic HTML formatting.
  - GitHub-flavored luxury Markdown renderer supporting callout alerts (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), Notion-style tables, and task checkboxes.
- **Organization & Search**:
  - Instant live search with fuzzy matching.
  - Customizable color tags and collections.
  - Pinning, Favorites, and auto-pruning.
  - App exclusion list for password managers and private windows.
- **Windows Integration**:
  - Customizable global shortcut (`Ctrl+Shift+V`).
  - System Tray menu with quick pause and settings.
  - Native NSIS Windows x64 installer with embedded high-resolution application icon.
