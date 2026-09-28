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
            app.manage(commands::hash::HashCancelManager::new());
            app.manage(commands::metrics::MetricsState::new());

            // 启动时清理残留的临时大响应缓存文件
            commands::http::clean_all_temp_response_files();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::db_execute,
            db::db_query,
            commands::diff::diff_text,
            commands::http::http_execute,
            commands::http::http_clean_temp_file,
            commands::hash::compute_file_hash,
            commands::hash::cancel_file_hash,
            commands::hash::compute_text_hash,
            commands::cron::predict_cron_runs,
            commands::file::save_binary_file,
            commands::x509::parse_certificate,
            commands::metrics::get_process_metrics,
            commands::github::fetch_latest_release,
            commands::opener::open_external_url,
        ])
        .run(tauri::generate_context!())
        .expect("运行 DevUtils 发生异常");
}
