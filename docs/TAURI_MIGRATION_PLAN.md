# Obscura Tauri 2 Migration Plan

Status: Draft v1
Owner: Codex (implementation) / User (verification)
Scope: Electron desktop app -> Tauri 2 desktop app on Windows, preserving behavior first.

## Principles
- Preserve user-visible behavior before refactoring internals.
- Keep risk low by using a staged migration.
- Ship an intermediate Tauri build with partial parity early.
- Replace Electron APIs behind a compatibility adapter.

## Milestones

### M0 Baseline Freeze (1-2 days)
- [ ] Capture current Electron baseline behavior and known issues.
- [ ] Record smoke scenarios used for every regression pass.
- [ ] Freeze scope for Phase A parity target.

Exit criteria:
- Baseline checklist exists and can be run manually by user.

### M1 Tauri Shell + React Runtime (2-3 days)
- [ ] Add `src-tauri` scaffold (Rust app, tauri config, capability policy).
- [ ] Wire Tauri dev flow to existing Vite frontend.
- [ ] Ensure app boots on Windows in dev mode.
- [ ] Add release build command for Tauri.

Exit criteria:
- `tauri dev` launches Obscura UI window successfully.

### M2 Compatibility Adapter (4-7 days)
- [ ] Introduce runtime adapter mode: Electron vs Tauri.
- [ ] Implement minimal Tauri commands for app startup-critical APIs:
  - [ ] window controls
  - [ ] dialog open/save
  - [ ] open external URL / reveal in explorer
  - [ ] clipboard text
  - [ ] notification
  - [ ] config file read/write
- [ ] Keep signatures aligned with existing `electronAPI` patterns where possible.

Exit criteria:
- App can start and perform basic navigation/settings actions under Tauri.

### M3 Heavy Feature Bridge via Sidecar (1-2 weeks)
- [ ] Create sidecar process boundary for existing Node-heavy features.
- [ ] Move existing Electron-main logic behind sidecar RPC facade:
  - [ ] media library operations
  - [ ] ffmpeg workflows
  - [ ] remote sharing server (Express + Socket.IO)
  - [ ] plugin script I/O and fetch bridge
- [ ] Add structured request/response and event stream protocol.
- [ ] Add reconnect and crash recovery handling.

Exit criteria:
- Core media workflows function in Tauri using sidecar backend.

### M4 Parity Hardening (1-2 weeks)
- [ ] Validate full smoke matrix (library, import, playback, remote, plugins).
- [ ] Fix behavior deltas and performance regressions.
- [ ] Add logging and diagnostics for Tauri + sidecar failures.
- [ ] Prepare user-facing migration notes.

Exit criteria:
- User confirms daily-use readiness on Tauri build.

### M5 De-Electronization (incremental)
- [ ] Remove Electron build and runtime dependencies after parity acceptance.
- [ ] Optional: replace sidecar features with Rust commands by priority.
- [ ] Finalize Tauri updater/distribution flow.

Exit criteria:
- Production package no longer depends on Electron runtime.

## Workstreams

### WS1 Build and Tooling
- [ ] Scripts: `tauri:dev`, `tauri:build`.
- [ ] CI job for Tauri Windows build.
- [ ] Artifact naming and release path updates.

### WS2 Runtime API Surface
- [ ] Catalog current IPC handlers from `apps/desktop/electron/main.ts` and `preload.cjs`.
- [ ] Mark each API as `native-tauri`, `sidecar`, or `defer`.
- [ ] Implement a typed transport facade on frontend.

### WS3 Data/Storage Compatibility
- [ ] Keep current library file layout and config layout unchanged for Phase A.
- [ ] Verify path handling and permissions in Tauri context.
- [ ] Ensure migration does not alter existing `.library` data.

### WS4 Playback and Media Tooling
- [ ] Validate ffmpeg/ffprobe discovery in Tauri bundle context.
- [ ] Validate mpv strategy under Tauri (keep or defer).
- [ ] Ensure thumbnail + metadata generation parity.

### WS5 Networking and Security
- [ ] Validate local server auth flow in sidecar mode.
- [ ] Re-check token handling boundaries after process split.
- [ ] Verify firewall/UAC behavior for Windows package.

### WS6 Plugin System
- [ ] Maintain plugin loading contract during migration.
- [ ] Preserve plugin fetch/data persistence behavior.
- [ ] Document any temporary plugin restrictions.

## Risk Register
- Plugin/runtime compatibility drift.
- Playback behavior differences (audio routing, mpv integration).
- Sidecar process lifecycle complexity.
- Build/signing/update pipeline changes.

Mitigation:
- Keep strict smoke regression cycles.
- Ship intermediate builds early and iterate on user validation.
- Use compatibility facade instead of direct rewrites.

## Validation Matrix (manual)
- [ ] App starts, window controls work.
- [ ] Open/create/switch library.
- [ ] Import media, metadata extracted, thumbnails generated.
- [ ] Play video/audio, seek, pause/resume, loop.
- [ ] Tag/folder/comment operations persist.
- [ ] Duplicate scan and cleanup actions work.
- [ ] Remote library connect and browse.
- [ ] Plugin load and data fetch path works.
- [ ] Update check path does not crash app.

## Immediate Next Actions
1. Scaffold `src-tauri` and add package scripts.
2. Add frontend runtime detection and Tauri adapter shell.
3. Implement first Tauri commands for boot-critical UI actions.
4. Deliver first runnable Tauri build for verification.
