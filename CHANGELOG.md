# Changelog

All notable changes to **ClipVault** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

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
