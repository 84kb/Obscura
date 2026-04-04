#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::Duration;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use rodio::{Decoder, OutputStream, OutputStreamBuilder, Sink, Source};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow, Window};

#[derive(Serialize)]
struct BasicResult {
    success: bool,
    message: Option<String>,
}

struct SidecarProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    stderr: BufReader<ChildStderr>,
}

#[derive(Default)]
struct SidecarState {
    process: Mutex<Option<SidecarProcess>>,
    next_id: Mutex<u64>,
}

#[derive(Serialize)]
struct SidecarStatus {
    running: bool,
    pid: Option<u32>,
}

struct NativeAudioPlayback {
    _stream: OutputStream,
    sink: Arc<Sink>,
    monitor_stop: Arc<AtomicBool>,
}

#[derive(Default)]
struct NativeAudioState {
    playback: Mutex<Option<NativeAudioPlayback>>,
    desired_volume: Mutex<f32>,
}

fn emit_audio_event<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    let _ = app.emit(event, payload);
}

fn stop_native_audio_locked(playback: &mut Option<NativeAudioPlayback>) {
    if let Some(current) = playback.take() {
        current.monitor_stop.store(true, Ordering::Relaxed);
        current.sink.stop();
    }
}

fn spawn_audio_monitor(app: AppHandle, sink: Arc<Sink>, monitor_stop: Arc<AtomicBool>) {
    thread::spawn(move || {
        let mut last_paused = sink.is_paused();
        loop {
            if monitor_stop.load(Ordering::Relaxed) {
                break;
            }

            emit_audio_event(&app, "audio:time-update", sink.get_pos().as_secs_f64());

            let paused = sink.is_paused();
            if paused != last_paused {
                emit_audio_event(&app, "audio:pause-update", paused);
                last_paused = paused;
            }

            if sink.empty() {
                emit_audio_event(&app, "audio:pause-update", true);
                emit_audio_event(&app, "audio:ended", true);
                break;
            }

            thread::sleep(Duration::from_millis(200));
        }
    });
}

#[tauri::command]
async fn native_audio_play(
    app: AppHandle,
    audio_state: State<'_, NativeAudioState>,
    file_path: Option<String>,
) -> Result<(), String> {
    let desired_volume = {
        let guard = audio_state
            .desired_volume
            .lock()
            .map_err(|_| "failed to lock audio volume state".to_string())?;
        *guard
    };

    let mut playback_guard = audio_state
        .playback
        .lock()
        .map_err(|_| "failed to lock audio playback state".to_string())?;

    if let Some(file_path) = file_path {
        let trimmed = file_path.trim();
        if trimmed.is_empty() {
            return Ok(());
        }

        stop_native_audio_locked(&mut playback_guard);

        let file = fs::File::open(trimmed)
            .map_err(|e| format!("failed to open audio file '{}': {e}", trimmed))?;
        let decoder = Decoder::try_from(file)
            .map_err(|e| format!("failed to decode audio '{}': {e}", trimmed))?;
        let duration = decoder.total_duration().unwrap_or_default().as_secs_f64();

        let stream = OutputStreamBuilder::open_default_stream()
            .map_err(|e| format!("failed to open native audio output: {e}"))?;
        let sink = Arc::new(Sink::connect_new(stream.mixer()));
        sink.set_volume(desired_volume);
        sink.append(decoder);
        sink.play();

        let monitor_stop = Arc::new(AtomicBool::new(false));
        spawn_audio_monitor(app.clone(), sink.clone(), monitor_stop.clone());

        *playback_guard = Some(NativeAudioPlayback {
            _stream: stream,
            sink: sink.clone(),
            monitor_stop,
        });

        emit_audio_event(&app, "audio:duration-update", duration);
        emit_audio_event(&app, "audio:time-update", 0.0_f64);
        emit_audio_event(&app, "audio:pause-update", false);
        return Ok(());
    }

    if let Some(playback) = playback_guard.as_ref() {
        playback.sink.play();
        emit_audio_event(&app, "audio:pause-update", false);
    }

    Ok(())
}

#[tauri::command]
async fn native_audio_pause(
    app: AppHandle,
    audio_state: State<'_, NativeAudioState>,
) -> Result<(), String> {
    let playback_guard = audio_state
        .playback
        .lock()
        .map_err(|_| "failed to lock audio playback state".to_string())?;
    if let Some(playback) = playback_guard.as_ref() {
        playback.sink.pause();
        emit_audio_event(&app, "audio:pause-update", true);
    }
    Ok(())
}

#[tauri::command]
async fn native_audio_resume(
    app: AppHandle,
    audio_state: State<'_, NativeAudioState>,
) -> Result<(), String> {
    let playback_guard = audio_state
        .playback
        .lock()
        .map_err(|_| "failed to lock audio playback state".to_string())?;
    if let Some(playback) = playback_guard.as_ref() {
        playback.sink.play();
        emit_audio_event(&app, "audio:pause-update", false);
    }
    Ok(())
}

#[tauri::command]
async fn native_audio_stop(
    app: AppHandle,
    audio_state: State<'_, NativeAudioState>,
) -> Result<(), String> {
    let mut playback_guard = audio_state
        .playback
        .lock()
        .map_err(|_| "failed to lock audio playback state".to_string())?;
    stop_native_audio_locked(&mut playback_guard);
    emit_audio_event(&app, "audio:pause-update", true);
    emit_audio_event(&app, "audio:time-update", 0.0_f64);
    Ok(())
}

#[tauri::command]
async fn native_audio_seek(
    app: AppHandle,
    audio_state: State<'_, NativeAudioState>,
    time: f64,
) -> Result<(), String> {
    let playback_guard = audio_state
        .playback
        .lock()
        .map_err(|_| "failed to lock audio playback state".to_string())?;
    if let Some(playback) = playback_guard.as_ref() {
        let target = if time.is_finite() { time.max(0.0) } else { 0.0 };
        playback
            .sink
            .try_seek(Duration::from_secs_f64(target))
            .map_err(|e| format!("failed to seek audio: {e}"))?;
        emit_audio_event(&app, "audio:time-update", target);
    }
    Ok(())
}

#[tauri::command]
async fn native_audio_set_volume(
    audio_state: State<'_, NativeAudioState>,
    volume: f64,
) -> Result<(), String> {
    let normalized = if volume.is_finite() {
        (volume / 100.0).clamp(0.0, 1.0) as f32
    } else {
        1.0
    };

    {
        let mut guard = audio_state
            .desired_volume
            .lock()
            .map_err(|_| "failed to lock audio volume state".to_string())?;
        *guard = normalized;
    }

    let playback_guard = audio_state
        .playback
        .lock()
        .map_err(|_| "failed to lock audio playback state".to_string())?;
    if let Some(playback) = playback_guard.as_ref() {
        playback.sink.set_volume(normalized);
    }
    Ok(())
}

fn client_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;

    if !base_dir.exists() {
        fs::create_dir_all(&base_dir).map_err(|e| format!("create app data dir failed: {e}"))?;
    }

    Ok(base_dir.join("client-config.json"))
}

fn legacy_client_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;

    let parent = base_dir
        .parent()
        .ok_or_else(|| "failed to resolve parent app data dir".to_string())?;

    Ok(parent.join("Obscura").join("client-config.json"))
}

fn read_json_file(path: &PathBuf) -> Option<Value> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&raw).ok()
}

fn config_has_meaningful_user_settings(config: &Value) -> bool {
    let auto_import_paths = config
        .get("autoImport")
        .and_then(|v| v.get("watchPaths"))
        .and_then(|v| v.as_array())
        .map(|items| !items.is_empty())
        .unwrap_or(false);

    let has_remote_libraries = config
        .get("remoteLibraries")
        .and_then(|v| v.as_array())
        .map(|items| !items.is_empty())
        .unwrap_or(false);

    let has_custom_themes = config
        .get("customThemes")
        .and_then(|v| v.as_array())
        .map(|items| !items.is_empty())
        .unwrap_or(false);

    let has_library_transfer = config.get("libraryTransferSettings").is_some();
    let has_nickname = config
        .get("nickname")
        .and_then(|v| v.as_str())
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let has_icon = config
        .get("iconUrl")
        .and_then(|v| v.as_str())
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let has_audio_device = config
        .get("audioDevice")
        .and_then(|v| v.as_str())
        .map(|value| !value.trim().is_empty() && value.trim() != "auto")
        .unwrap_or(false);

    auto_import_paths
        || has_remote_libraries
        || has_custom_themes
        || has_library_transfer
        || has_nickname
        || has_icon
        || has_audio_device
}

fn merge_config_values(base: &mut Value, incoming: &Value) {
    match incoming {
        Value::Object(incoming_map) => {
            let Some(base_map) = base.as_object_mut() else {
                if base.is_null() {
                    *base = incoming.clone();
                }
                return;
            };
            for (key, incoming_value) in incoming_map {
                match base_map.get_mut(key) {
                    Some(base_value) => merge_config_values(base_value, incoming_value),
                    None => {
                        base_map.insert(key.clone(), incoming_value.clone());
                    }
                }
            }
        }
        Value::Array(incoming_items) => {
            if let Some(base_items) = base.as_array_mut() {
                if base_items.is_empty() {
                    *base_items = incoming_items.clone();
                }
            } else if base.is_null() {
                *base = incoming.clone();
            }
        }
        Value::String(incoming_str) => {
            if let Some(base_str) = base.as_str() {
                if base_str.trim().is_empty() {
                    *base = Value::String(incoming_str.clone());
                }
            } else if base.is_null() {
                *base = Value::String(incoming_str.clone());
            }
        }
        _ => {
            if base.is_null() {
                *base = incoming.clone();
            }
        }
    }
}

fn load_effective_client_config(app: &AppHandle) -> Result<String, String> {
    let path = client_config_path(app)?;
    let legacy_path = legacy_client_config_path(app)?;

    let mut current_value = if path.exists() {
        read_json_file(&path).unwrap_or_else(|| json!({}))
    } else {
        json!({})
    };

    let current_has_data = config_has_meaningful_user_settings(&current_value);
    if !current_has_data && legacy_path.exists() {
        if let Some(legacy_value) = read_json_file(&legacy_path) {
            if config_has_meaningful_user_settings(&legacy_value) {
                merge_config_values(&mut current_value, &legacy_value);
                if let Ok(serialized) = serde_json::to_string_pretty(&current_value) {
                    let _ = fs::write(&path, &serialized);
                    return Ok(serialized);
                }
            }
        }
    }

    serde_json::to_string_pretty(&current_value).map_err(|e| format!("serialize config failed: {e}"))
}

fn sidecar_script_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("scripts")
        .join("tauri-sidecar.cjs");

    // In debug/dev, always prefer workspace script so code changes are reflected immediately.
    if cfg!(debug_assertions) && dev_path.exists() {
        return Ok(dev_path);
    }

    for root in sidecar_search_roots(app) {
        let bundled_candidates = [
            root.join("scripts").join("tauri-sidecar.cjs"),
            root.join("tauri-sidecar.cjs"),
            root.join("_up_").join("scripts").join("tauri-sidecar.cjs"),
        ];
        for bundled in bundled_candidates {
            if bundled.exists() {
                return Ok(bundled);
            }
        }
    }

    if dev_path.exists() {
        return Ok(dev_path);
    }

    Err("sidecar script not found".to_string())
}

fn sidecar_search_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir);
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            roots.push(exe_dir.to_path_buf());
            roots.push(exe_dir.join("resources"));
        }
    }

    roots
}

fn sidecar_plugin_dir(app: &AppHandle) -> PathBuf {
    for root in sidecar_search_roots(app) {
        let candidates = [root.join("plugins"), root.join("_up_").join("plugins")];
        for bundled in candidates {
            if bundled.exists() {
                return bundled;
            }
        }
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("plugins")
}

fn sidecar_node_binary(app: &AppHandle) -> String {
    let node_names: Vec<&str> = if cfg!(target_os = "windows") {
        vec!["obscura-node.exe", "node.exe"]
    } else {
        vec!["node"]
    };

    for root in sidecar_search_roots(app) {
        for node_name in &node_names {
            let bundled_candidates = [
                root.join("bin").join(node_name),
                root.join("build").join("bin").join(node_name),
                root.join("_up_").join("build").join("bin").join(node_name),
                root.join("_up_").join("bin").join(node_name),
                root.join("resources").join(node_name),
            ];
            for bundled in bundled_candidates {
                if bundled.exists() {
                    return bundled.to_string_lossy().to_string();
                }
            }
        }
    }
    "node".to_string()
}

fn sidecar_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir error: {e}"))?;
    let sidecar_dir = base_dir.join("sidecar-data");
    if !sidecar_dir.exists() {
        fs::create_dir_all(&sidecar_dir)
            .map_err(|e| format!("failed to create sidecar data dir: {e}"))?;
    }
    Ok(sidecar_dir)
}

fn ensure_sidecar_running(app: &AppHandle, state: &SidecarState) -> Result<(), String> {
    let mut guard = state
        .process
        .lock()
        .map_err(|_| "failed to lock sidecar state".to_string())?;

    if let Some(proc_ref) = guard.as_mut() {
        if proc_ref
            .child
            .try_wait()
            .map_err(|e| format!("sidecar wait error: {e}"))?
            .is_none()
        {
            return Ok(());
        }
        *guard = None;
    }

    let script_path = sidecar_script_path(app)?;
    let plugin_dir = sidecar_plugin_dir(app);
    let data_dir = sidecar_data_dir(app)?;

    let node_bin = sidecar_node_binary(app);

    let mut cmd = Command::new(&node_bin);
    // Robust sidecar bootstrap:
    // 1) try explicit env path (if valid file)
    // 2) fallback to common installer/dev locations relative to cwd and execPath
    // This avoids environment-specific path resolution issues (e.g. value becoming `C:`).
    cmd.arg("-e")
        .arg(
            r#"
(() => {
  const fs = require('node:fs');
  const path = require('node:path');
  const candidates = [];
  const push = (v) => { if (typeof v === 'string' && v.trim()) candidates.push(v.trim()); };
  push(process.env.OBSCURA_SIDECAR_SCRIPT);
  const cwd = process.cwd();
  const exeDir = path.dirname(process.execPath || '');
  [
    path.join(cwd, 'scripts', 'tauri-sidecar.cjs'),
    path.join(cwd, 'tauri-sidecar.cjs'),
    path.join(cwd, '_up_', 'scripts', 'tauri-sidecar.cjs'),
    path.join(cwd, 'resources', 'scripts', 'tauri-sidecar.cjs'),
    path.join(cwd, 'resources', '_up_', 'scripts', 'tauri-sidecar.cjs'),
    path.join(exeDir, 'scripts', 'tauri-sidecar.cjs'),
    path.join(exeDir, '_up_', 'scripts', 'tauri-sidecar.cjs'),
    path.join(exeDir, 'resources', 'scripts', 'tauri-sidecar.cjs'),
    path.join(exeDir, 'resources', '_up_', 'scripts', 'tauri-sidecar.cjs'),
  ].forEach(push);
  let lastErr = '';
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const st = fs.statSync(p);
      if (!st.isFile()) continue;
      require(p);
      return;
    } catch (e) {
      lastErr = (e && e.stack) ? String(e.stack) : String(e);
    }
  }
  throw new Error(`Failed to locate/load tauri-sidecar.cjs. cwd=${cwd}, execPath=${process.execPath}, envScript=${process.env.OBSCURA_SIDECAR_SCRIPT || ''}, lastErr=${lastErr}`);
})();
"#,
        )
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("OBSCURA_TAURI_SIDECAR", "1")
        .env("OBSCURA_SIDECAR_SCRIPT", script_path)
        .env("OBSCURA_PLUGIN_DIR", plugin_dir)
        .env("OBSCURA_SIDECAR_DATA_DIR", data_dir);
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            cmd.current_dir(exe_dir);
        }
    }
    #[cfg(target_os = "windows")]
    {
        // CREATE_NO_WINDOW
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to spawn sidecar with '{}': {e}", node_bin))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "failed to acquire sidecar stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to acquire sidecar stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to acquire sidecar stderr".to_string())?;

    *guard = Some(SidecarProcess {
        child,
        stdin,
        stdout: BufReader::new(stdout),
        stderr: BufReader::new(stderr),
    });

    Ok(())
}

#[tauri::command]
async fn sidecar_start(app: AppHandle, sidecar: State<'_, SidecarState>) -> Result<BasicResult, String> {
    ensure_sidecar_running(&app, &sidecar)?;

    Ok(BasicResult {
        success: true,
        message: Some("started".to_string()),
    })
}

#[tauri::command]
async fn sidecar_stop(sidecar: State<'_, SidecarState>) -> Result<BasicResult, String> {
    let mut guard = sidecar
        .process
        .lock()
        .map_err(|_| "failed to lock sidecar state".to_string())?;

    if let Some(proc_ref) = guard.as_mut() {
        proc_ref
            .child
            .kill()
            .map_err(|e| format!("failed to kill sidecar: {e}"))?;
        let _ = proc_ref.child.wait();
        *guard = None;
    }

    Ok(BasicResult {
        success: true,
        message: Some("stopped".to_string()),
    })
}

#[tauri::command]
async fn sidecar_status(sidecar: State<'_, SidecarState>) -> Result<SidecarStatus, String> {
    let mut guard = sidecar
        .process
        .lock()
        .map_err(|_| "failed to lock sidecar state".to_string())?;

    if let Some(proc_ref) = guard.as_mut() {
        if proc_ref
            .child
            .try_wait()
            .map_err(|e| e.to_string())?
            .is_none()
        {
            return Ok(SidecarStatus {
                running: true,
                pid: Some(proc_ref.child.id()),
            });
        }
        *guard = None;
    }

    Ok(SidecarStatus {
        running: false,
        pid: None,
    })
}

#[tauri::command]
async fn sidecar_request(
    app: AppHandle,
    sidecar: State<'_, SidecarState>,
    method: String,
    params: Option<Value>,
) -> Result<Value, String> {
    ensure_sidecar_running(&app, &sidecar)?;

    let id = {
        let mut id_guard = sidecar
            .next_id
            .lock()
            .map_err(|_| "failed to lock request id state".to_string())?;
        *id_guard += 1;
        *id_guard
    };

    let mut guard = sidecar
        .process
        .lock()
        .map_err(|_| "failed to lock sidecar state".to_string())?;

    let proc_ref = guard
        .as_mut()
        .ok_or_else(|| "sidecar process not available".to_string())?;

    let req = json!({
        "id": id,
        "method": method,
        "params": params.unwrap_or(Value::Null),
    });

    let req_line = format!("{}\n", req);
    proc_ref
        .stdin
        .write_all(req_line.as_bytes())
        .map_err(|e| format!("sidecar write failed: {e}"))?;
    proc_ref
        .stdin
        .flush()
        .map_err(|e| format!("sidecar flush failed: {e}"))?;

    let mut line = String::new();
    loop {
        line.clear();
        let bytes = proc_ref
            .stdout
            .read_line(&mut line)
            .map_err(|e| format!("sidecar read failed: {e}"))?;

        if bytes == 0 {
            let mut stderr_text = String::new();
            let _ = proc_ref.stderr.read_to_string(&mut stderr_text);
            let detail = stderr_text.trim();
            if detail.is_empty() {
                return Err("sidecar closed stdout".to_string());
            }
            return Err(format!("sidecar closed stdout: {}", detail));
        }

        let parsed: Value = serde_json::from_str(line.trim())
            .map_err(|e| format!("invalid sidecar json: {e}"))?;

        if let Some(event_name) = parsed.get("event").and_then(|v| v.as_str()) {
            let payload = parsed
                .get("payload")
                .cloned()
                .or_else(|| parsed.get("data").cloned())
                .unwrap_or_else(|| parsed.clone());
            let _ = app.emit(event_name, payload);
            continue;
        }

        if parsed.get("id").and_then(|v| v.as_u64()) != Some(id) {
            continue;
        }

        if parsed
            .get("ok")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            return Ok(parsed.get("result").cloned().unwrap_or(Value::Null));
        }

        let err_msg = parsed
            .get("error")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown sidecar error");
        return Err(err_msg.to_string());
    }
}

#[tauri::command]
fn window_minimize(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: Window) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn window_close(window: Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_focus(window: Window) -> Result<(), String> {
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_toggle_devtools(webview: WebviewWindow) -> Result<(), String> {
    if webview.is_devtools_open() {
        webview.close_devtools();
    } else {
        webview.open_devtools();
    }
    Ok(())
}

#[tauri::command]
async fn read_client_config(app: AppHandle) -> Result<String, String> {
    load_effective_client_config(&app)
}

#[tauri::command]
async fn write_client_config(app: AppHandle, content: String) -> Result<BasicResult, String> {
    let path = client_config_path(&app)?;
    fs::write(path, content).map_err(|e| format!("write config failed: {e}"))?;

    Ok(BasicResult {
        success: true,
        message: None,
    })
}

fn main() {
    tauri::Builder::default()
        .manage(SidecarState::default())
        .manage(NativeAudioState::default())
        .setup(|app| {
            let _ = sidecar_start(app.handle().clone(), app.state::<SidecarState>());
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .invoke_handler(tauri::generate_handler![
            sidecar_start,
            sidecar_stop,
            sidecar_status,
            sidecar_request,
            window_minimize,
            window_toggle_maximize,
            window_close,
            window_focus,
            window_toggle_devtools,
            native_audio_play,
            native_audio_pause,
            native_audio_resume,
            native_audio_stop,
            native_audio_seek,
            native_audio_set_volume,
            read_client_config,
            write_client_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
