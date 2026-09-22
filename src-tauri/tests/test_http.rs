use std::sync::Arc;
use tauri::Manager;
use tokio_rusqlite::Connection;
use devutils_lib::db::DbState;
use devutils_lib::commands::http::{http_execute, HttpRequestPayload, KeyValueItem};
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[tokio::test]
async fn test_http_execute_and_history_logging() {
    // 1. 启动本地纯离线微型 HTTP 服务
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            tokio::spawn(async move {
                let mut buf = [0u8; 1024];
                let _ = socket.read(&mut buf).await;
                let body = "{\"success\":true}";
                let response = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
                let _ = socket.write_all(response.as_bytes()).await;
                let _ = socket.flush().await;
            });
        }
    });

    // 2. 初始化数据库与状态
    let conn = Connection::open_in_memory().await.unwrap();
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();
    let state = DbState(Arc::new(conn));

    let app = tauri::test::mock_app();
    app.manage(state);
    let tauri_state = app.state::<DbState>();

    // 3. 构造请求
    let req = HttpRequestPayload {
        method: "POST".to_string(),
        url: format!("http://127.0.0.1:{}", port),
        headers: vec![
            KeyValueItem {
                key: "X-Test-Header".to_string(),
                value: "devutils-test".to_string(),
                enabled: true,
                item_type: None,
            },
        ],
        params: vec![
            KeyValueItem {
                key: "query_k".to_string(),
                value: "query_v".to_string(),
                enabled: true,
                item_type: None,
            },
        ],
        body_type: "raw".to_string(),
        body_raw: Some("{\"hello\":\"world\"}".to_string()),
        form_data: vec![],
        urlencoded_data: vec![],
        binary_file_path: None,
        timeout_ms: Some(5000),
        ignore_ssl: Some(true),
        follow_redirects: Some(true),
        proxy: None,
    };

    // 4. 执行请求
    let resp = http_execute(req, tauri_state.clone()).await.expect("Request should succeed");
    assert_eq!(resp.status, 200);
    assert_eq!(resp.body, "{\"success\":true}");
    assert!(resp.duration_ms < 5000);

    // 5. 验证 http_history 表中自动记录了请求与响应日志
    let history_rows = devutils_lib::db::db_query(
        "SELECT method, url, status_code, request_data_json, response_summary_json FROM http_history".to_string(),
        None,
        tauri_state.clone(),
    )
    .await
    .expect("Query history");

    assert_eq!(history_rows.len(), 1);
    assert_eq!(history_rows[0]["method"], "POST");
    assert_eq!(history_rows[0]["status_code"], 200);
    assert!(history_rows[0]["url"].as_str().unwrap().contains(&port.to_string()));
}

#[tokio::test]
async fn test_http_execute_file_not_found_errors() {
    let conn = Connection::open_in_memory().await.unwrap();
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();
    let state = DbState(Arc::new(conn));

    let app = tauri::test::mock_app();
    app.manage(state);
    let tauri_state = app.state::<DbState>();

    // 1. 测试不存在的二进制文件直传
    let req = HttpRequestPayload {
        method: "POST".to_string(),
        url: "http://127.0.0.1:9999".to_string(),
        headers: vec![],
        params: vec![],
        body_type: "binary".to_string(),
        body_raw: None,
        form_data: vec![],
        urlencoded_data: vec![],
        binary_file_path: Some("/path/to/non_existent_file_123.bin".to_string()),
        timeout_ms: Some(1000),
        ignore_ssl: None,
        follow_redirects: None,
        proxy: None,
    };

    let result = http_execute(req, tauri_state.clone()).await;
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("二进制文件不存在"));
}
