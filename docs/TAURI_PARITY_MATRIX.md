# Electron to Tauri Parity Matrix

Legend:
- Native: implemented directly as Tauri command/plugin.
- Sidecar: delegated to Node sidecar for Phase A.
- Defer: postponed until after first Tauri parity build.

## Core App APIs
| Area | Current Source | Target | Phase | Status | Notes |
|---|---|---|---|---|---|
| Window controls | preload + main IPC | Native | A | TODO | minimize/maximize/close/focus |
| Dialog open/select | preload + main IPC | Native | A | TODO | file/folder pickers |
| Shell/open external | preload + main IPC | Native | A | TODO | URL/open path/reveal |
| Clipboard text/file | preload + main IPC | Native | A | TODO | file clipboard may need custom logic |
| Notifications | preload + main IPC | Native | A | TODO | OS notification bridge |

## Library/Data
| Area | Current Source | Target | Phase | Status | Notes |
|---|---|---|---|---|---|
| Library CRUD | database.legacy.ts | Sidecar | A | TODO | preserve existing file layout |
| Media query/filter/paging | database.legacy.ts | Sidecar | A | TODO | keep current behavior |
| Tags/Folders/Comments | database.legacy.ts | Sidecar | A | TODO | full parity required |
| Duplicate detection | database.legacy.ts | Sidecar | A | TODO | heavy I/O path |
| Audit logs | database.legacy.ts | Sidecar | A | TODO | unchanged schema |

## Media Processing
| Area | Current Source | Target | Phase | Status | Notes |
|---|---|---|---|---|---|
| ffprobe metadata | ffmpeg.ts | Sidecar | A | TODO | keep current parser |
| Thumbnail generation | ffmpeg.ts | Sidecar | A | TODO | preserve mode options |
| Frame extraction/previews | ffmpeg.ts | Sidecar | A | TODO | required by player/inspector |
| Dominant color extraction | ffmpeg.ts | Sidecar | A | TODO | keep optional behavior |

## Playback/Audio
| Area | Current Source | Target | Phase | Status | Notes |
|---|---|---|---|---|---|
| HTML5 video/audio playback | renderer | Native | A | TODO | no backend dependency |
| MPV controller | electron/mpv | Sidecar | A | TODO | validate pipe/socket behavior |
| Audio device/exclusive mode | audio-ipc.ts | Sidecar | A | TODO | Windows-specific |

## Networking/Remote
| Area | Current Source | Target | Phase | Status | Notes |
|---|---|---|---|---|---|
| Shared server lifecycle | server.ts | Sidecar | A | TODO | process lifecycle critical |
| Auth token checks | crypto-utils + shared-library | Sidecar | A | TODO | preserve security checks |
| Socket events | Socket.IO | Sidecar | A | TODO | transport remains same |
| Remote sync/download/upload | main + server | Sidecar | A | TODO | incremental validation |

## Plugin System
| Area | Current Source | Target | Phase | Status | Notes |
|---|---|---|---|---|---|
| Plugin file discovery/install | plugin-api.ts | Sidecar | A | TODO | preserve plugin format |
| Plugin fetch bridge | plugin-api.ts | Sidecar | A | TODO | keep CORS bypass behavior |
| Plugin media data store | plugin-api.ts | Sidecar | A | TODO | extension data compatibility |
| Renderer plugin runtime | plugin-system.ts | Native | A | TODO | keep `window.ObscuraAPI` contract |

## Packaging/Update
| Area | Current Source | Target | Phase | Status | Notes |
|---|---|---|---|---|---|
| App packaging | electron-builder | Native (Tauri bundle) | A | TODO | parallel release until cutover |
| Auto update | electron-updater | Defer | B | TODO | redesign with Tauri updater |
| FFmpeg bundle path | electron extraResources | Native/Sidecar | A | TODO | define deterministic runtime path |
