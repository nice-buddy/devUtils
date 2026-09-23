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
        raw_type: Some("json".to_string()),
        body_raw: Some("{\"hello\":\"world\"}".to_string()),
        form_data: vec![],
        urlencoded_data: vec![],
        binary_file_path: None,
        timeout_ms: Some(5000),
        ignore_ssl: Some(true),
        follow_redirects: Some(true),
        proxy: None,
        auth: None,
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
        raw_type: None,
        body_raw: None,
        form_data: vec![],
        urlencoded_data: vec![],
        binary_file_path: Some("/path/to/non_existent_file_123.bin".to_string()),
        timeout_ms: Some(1000),
        ignore_ssl: None,
        follow_redirects: None,
        proxy: None,
        auth: None,
    };

    let result = http_execute(req, tauri_state.clone()).await;
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("二进制文件不存在"));
}

#[tokio::test]
async fn test_http_execute_query_params_and_content_type_autoinject() {
    // 启动接收并回显请求路径及请求头的本地微服务
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            tokio::spawn(async move {
                let mut buf = [0u8; 2048];
                let n = socket.read(&mut buf).await.unwrap_or(0);
                let req_text = String::from_utf8_lossy(&buf[..n]);
                // 回显请求的第一行及全部内容
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    req_text.len(),
                    req_text
                );
                let _ = socket.write_all(response.as_bytes()).await;
                let _ = socket.flush().await;
            });
        }
    });

    let conn = Connection::open_in_memory().await.unwrap();
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();
    let state = DbState(Arc::new(conn));

    let app = tauri::test::mock_app();
    app.manage(state);
    let tauri_state = app.state::<DbState>();

    // 构造已有 ?existing=1 的 URL，并追加 params
    let req = HttpRequestPayload {
        method: "POST".to_string(),
        url: format!("http://127.0.0.1:{}/api?existing=1", port),
        headers: vec![], // 不传入 Content-Type
        params: vec![
            KeyValueItem {
                key: "extra".to_string(),
                value: "val2".to_string(),
                enabled: true,
                item_type: None,
            },
        ],
        body_type: "raw".to_string(),
        raw_type: Some("json".to_string()),
        body_raw: Some("{\"auto\":\"inject\"}".to_string()),
        form_data: vec![],
        urlencoded_data: vec![],
        binary_file_path: None,
        timeout_ms: Some(5000),
        ignore_ssl: Some(true),
        follow_redirects: Some(true),
        proxy: None,
        auth: None,
    };

    let resp = http_execute(req, tauri_state).await.expect("Request should succeed");
    assert_eq!(resp.status, 200);
    // 验证请求行保留了 existing=1 且正确追加了 extra=val2
    assert!(resp.body.contains("existing=1"));
    assert!(resp.body.contains("extra=val2"));
    // 验证自动补全了 Content-Type: application/json
    assert!(resp.body.to_lowercase().contains("content-type: application/json"));
}

#[tokio::test]
async fn test_http_execute_multipart_form_data_file_streaming() {
    use std::io::Write;
    let mut temp = tempfile::NamedTempFile::new().unwrap();
    let file_content = "DevUtils Multipart Stream Content 123456";
    temp.write_all(file_content.as_bytes()).unwrap();

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            tokio::spawn(async move {
                let mut buf = vec![0u8; 16384];
                let mut total_read = 0;
                while total_read < buf.len() {
                    let n = socket.read(&mut buf[total_read..]).await.unwrap_or(0);
                    if n == 0 { break; }
                    total_read += n;
                    if String::from_utf8_lossy(&buf[..total_read]).contains("DevUtils Multipart Stream Content 123456") {
                        break;
                    }
                }
                let req_text = String::from_utf8_lossy(&buf[..total_read]);
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    req_text.len(),
                    req_text
                );
                let _ = socket.write_all(response.as_bytes()).await;
                let _ = socket.flush().await;
            });
        }
    });

    let conn = Connection::open_in_memory().await.unwrap();
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();
    let state = DbState(Arc::new(conn));

    let app = tauri::test::mock_app();
    app.manage(state);
    let tauri_state = app.state::<DbState>();

    let json_req = serde_json::json!({
        "method": "POST",
        "url": format!("http://127.0.0.1:{}", port),
        "headers": [],
        "params": [],
        "bodyType": "form-data",
        "formData": [
            {
                "key": "textField",
                "value": "textValue",
                "enabled": true,
                "itemType": "text"
            },
            {
                "key": "fileUpload",
                "value": temp.path().to_str().unwrap(),
                "enabled": true,
                "itemType": "file"
            }
        ]
    });

    let req: HttpRequestPayload = serde_json::from_value(json_req).expect("Deserialize payload with itemType");
    assert_eq!(req.form_data[1].item_type.as_deref(), Some("file"));

    let resp = http_execute(req, tauri_state).await.expect("Multipart request should succeed");
    assert_eq!(resp.status, 200);
    assert!(resp.body.contains("multipart/form-data"));
    assert!(resp.body.contains("DevUtils Multipart Stream Content 123456"));
    assert!(resp.body.contains("textValue"));
}

#[tokio::test]
async fn test_temp_file_cleanup_and_chinese_utf8_preview() {
    let temp_dir = std::env::temp_dir();
    let test_file = temp_dir.join("devutils_resp_test_cleanup_1.bin");
    std::fs::write(&test_file, b"temp-data").unwrap();
    assert!(test_file.exists());

    // 1. 测试全部临时文件扫描清理
    devutils_lib::commands::http::clean_all_temp_response_files();
    assert!(!test_file.exists());

    // 2. 测试指定临时文件删除 IPC 命令
    let test_file2 = temp_dir.join("devutils_resp_test_cleanup_2.bin");
    std::fs::write(&test_file2, b"temp-data-2").unwrap();
    assert!(test_file2.exists());

    let res = devutils_lib::commands::http::http_clean_temp_file(test_file2.to_string_lossy().to_string()).await;
    assert!(res.is_ok());
    assert!(!test_file2.exists());

    // 3. 测试中文字符切片边界回退逻辑（防跨字节截断引发解码崩溃）
    let chinese_bytes = "你好，世界！这是一段超长中文响应测试数据".as_bytes();
    // 取第 4 字节（落在“好”的第 2 个字节中间，UTF-8 延续字节 0b10xxxxxx）
    let mut cut_idx = 4;
    while cut_idx > 0 && (chinese_bytes[cut_idx] & 0b1100_0000) == 0b1000_0000 {
        cut_idx -= 1;
    }
    // 回退到字符边界后，必须能够安全解码为合法 UTF-8 字符串
    let valid_slice = std::str::from_utf8(&chinese_bytes[..cut_idx]);
    assert!(valid_slice.is_ok());
    assert_eq!(valid_slice.unwrap(), "你");
}

#[tokio::test]
async fn test_large_response_keeps_text_preview_and_spills_to_temp_file() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        if let Ok((mut socket, _)) = listener.accept().await {
            let mut buf = [0u8; 1024];
            let _ = socket.read(&mut buf).await;

            // 6MB 文本响应，开头写入可识别标记用于校验预览来源
            let mut body = String::from("PREVIEW_HEAD_MARKER\n");
            while body.len() < 6 * 1024 * 1024 {
                body.push_str("0123456789abcdef\n");
            }
            let header = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = socket.write_all(header.as_bytes()).await;
            let _ = socket.write_all(body.as_bytes()).await;
            let _ = socket.flush().await;
        }
    });

    let conn = Connection::open_in_memory().await.unwrap();
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();
    let state = DbState(Arc::new(conn));

    let app = tauri::test::mock_app();
    app.manage(state);
    let tauri_state = app.state::<DbState>();

    let req = HttpRequestPayload {
        method: "GET".to_string(),
        url: format!("http://127.0.0.1:{}", port),
        headers: vec![],
        params: vec![],
        body_type: "none".to_string(),
        raw_type: None,
        body_raw: None,
        form_data: vec![],
        urlencoded_data: vec![],
        binary_file_path: None,
        timeout_ms: Some(30000),
        ignore_ssl: Some(true),
        follow_redirects: Some(true),
        proxy: None,
        auth: None,
    };

    let resp = http_execute(req, tauri_state)
        .await
        .expect("Large response request should succeed");

    assert!(resp.is_large, "超过 5MB 的响应必须标记为大响应");
    assert!(resp.size_bytes > 5 * 1024 * 1024);
    assert!(!resp.is_binary, "JSON 文本大响应不应被判定为二进制");
    assert!(resp.temp_file_path.is_some(), "大响应应写入临时缓存文件");
    assert!(
        resp.body.starts_with("PREVIEW_HEAD_MARKER"),
        "大响应预览必须来自正文开头，实际以 {:?} 开头",
        resp.body.chars().take(32).collect::<String>()
    );
    assert!(resp.body.contains("仅展示前 1MB 预览"));

    if let Some(path) = resp.temp_file_path {
        let _ = std::fs::remove_file(path);
    }
}

