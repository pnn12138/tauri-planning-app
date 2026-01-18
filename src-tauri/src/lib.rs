mod bootstrap;
mod commands;
mod domain;
mod ipc;
mod paths;
mod repo;
mod security;
mod services;
mod state;
mod webview_bridge;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing logging system
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .init();
    
    tauri::Builder::default()
        .setup(|app| {
            let state = bootstrap::init_vault_state(app)?;
            app.manage(state);
            Ok(())
        })
        .plugin(webview_bridge::init_webview_bridge())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::vault::select_vault,
            commands::vault::scan_vault,
            commands::vault::read_markdown,
            commands::vault::write_markdown,
            commands::vault::rename_markdown,
            commands::vault::delete_entry,
            commands::vault::create_entry,
            commands::plugins::plugins_list,
            commands::plugins::plugins_read_manifest,
            commands::plugins::plugins_read_entry,
            commands::plugins::plugins_set_enabled,
            commands::plugins::vault_read_text,
            commands::plugins::vault_write_text,
            commands::planning_cmd::planning_list_today,
            commands::planning_cmd::planning_create_task,
            commands::planning_cmd::planning_update_task,
            commands::planning_cmd::planning_mark_done,
            commands::planning_cmd::planning_reopen_task,
            commands::planning_cmd::planning_start_task,
            commands::planning_cmd::planning_stop_task,
            commands::planning_cmd::planning_open_daily,
            commands::planning_cmd::planning_open_task_note,
            commands::planning_cmd::planning_reorder_tasks,
            commands::planning_cmd::planning_get_ui_state,
            commands::planning_cmd::planning_set_ui_state,
            commands::planning_cmd::planning_delete_task
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
