#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State, Window};

#[derive(Serialize)]
struct BasicResult {
    success: bool,
    message: Option<String>,
}

struct SidecarProcess {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
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

    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled_candidates = [
            resource_dir.join("scripts").join("tauri-sidecar.cjs"),
            resource_dir.join("tauri-sidecar.cjs"),
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

fn sidecar_plugin_dir(app: &AppHandle) -> PathBuf {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("plugins");
        if bundled.exists() {
            return bundled;
        }
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("plugins")
}

fn sidecar_node_binary(app: &AppHandle) -> String {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let node_name = if cfg!(target_os = "windows") {
            "node.exe"
        } else {
            "node"
        };
        // Keep compatibility with both legacy and current bundle layouts.
        let bundled_candidates = [
            resource_dir.join("bin").join(node_name),
            resource_dir.join("build").join("bin").join(node_name),
        ];
        for bundled in bundled_candidates {
            if bundled.exists() {
                return bundled.to_string_lossy().to_string();
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
    cmd.arg(script_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .env("OBSCURA_TAURI_SIDECAR", "1")
        .env("OBSCURA_PLUGIN_DIR", plugin_dir)
        .env("OBSCURA_SIDECAR_DATA_DIR", data_dir);
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

    *guard = Some(SidecarProcess {
        child,
        stdin,
        stdout: BufReader::new(stdout),
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
            return Err("sidecar closed stdout".to_string());
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
            read_client_config,
            write_client_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
