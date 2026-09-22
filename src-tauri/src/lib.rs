pub mod db;
pub mod commands;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_title_bar_style(tauri::TitleBarStyle::Overlay);
                }
            }

            let handle = app.handle().clone();
            let db_state = tauri::async_runtime::block_on(async move {
                db::init_db(&handle).await
            })?;
            app.manage(db_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::db_execute,
            db::db_query,
        ])
        .run(tauri::generate_context!())
        .expect("运行 DevUtils 发生异常");
}
