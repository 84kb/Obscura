#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager, Window};

#[derive(Serialize)]
struct BasicResult {
    success: bool,
    message: Option<String>,
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
fn read_client_config(app: AppHandle) -> Result<String, String> {
    let path = client_config_path(&app)?;
    if !path.exists() {
        return Ok("{}".to_string());
    }

    fs::read_to_string(path).map_err(|e| format!("read config failed: {e}"))
}

#[tauri::command]
fn write_client_config(app: AppHandle, content: String) -> Result<BasicResult, String> {
    let path = client_config_path(&app)?;
    fs::write(path, content).map_err(|e| format!("write config failed: {e}"))?;

    Ok(BasicResult {
        success: true,
        message: None,
    })
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
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
