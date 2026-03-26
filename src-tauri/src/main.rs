#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

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
    let path = client_config_path(&app)?;
    if !path.exists() {
        return Ok("{}".to_string());
    }

    fs::read_to_string(path).map_err(|e| format!("read config failed: {e}"))
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
        .setup(|app| {
            let _ = sidecar_start(app.handle().clone(), app.state::<SidecarState>());
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
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
            read_client_config,
            write_client_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
