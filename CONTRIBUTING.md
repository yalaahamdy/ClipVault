# Contributing to ClipVault

Thank you for your interest in contributing to **ClipVault**! We welcome contributions from developers of all skill levels. Whether you are fixing a bug, improving documentation, or proposing new features, your help is greatly appreciated.

---

## 📋 Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please treat all community members with respect and courtesy.

---

## 🛠️ Development Setup

ClipVault is built using **Tauri v2**, **Rust**, and **React 18 + TypeScript**.

### Prerequisites
- [Node.js](https://nodejs.org/) (v20 or higher)
- [Rust & Cargo](https://rustup.rs/) (latest stable)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) (with "Desktop development with C++")
- Windows 10/11 (with Microsoft Edge WebView2)

### Getting Started

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/<your-username>/ClipVault.git
   cd ClipVault
   ```

2. **Install frontend dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run tauri dev
   ```

4. **Build production binary:**
   ```bash
   npm run tauri build
   ```

---

## 🌿 Branching Strategy & Commits

- Always create a new branch from `main` for your feature or bug fix:
  ```bash
  git checkout -b feature/my-cool-feature
  # or
  git checkout -b fix/issue-description
  ```
- Use **Conventional Commits**:
  - `feat: add markdown alert callouts`
  - `fix: resolve taskbar clipping in multi-monitor setups`
  - `docs: update shortcuts table in README`
  - `style: refine button 3d shadow styles`
  - `perf: optimize sqlite query pruning`

---

## 🚀 Submitting a Pull Request

1. Ensure the code compiles cleanly:
   ```bash
   npm run build
   ```
2. Open a Pull Request against the `main` branch.
3. Describe your changes clearly using the PR template.
4. Ensure all GitHub Actions CI checks pass.
