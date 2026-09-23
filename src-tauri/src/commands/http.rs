use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::time::{Duration, Instant};
use crate::db::DbState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValueItem {
    pub key: String,
    pub value: String,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default, alias = "item_type", alias = "itemType")]
    pub item_type: Option<String>, // "text" or "file"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequestPayload {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<KeyValueItem>,
    #[serde(default)]
    pub params: Vec<KeyValueItem>,
    #[serde(default, alias = "body_type", alias = "bodyType")]
    pub body_type: String, // "none" | "raw" | "x-www-form-urlencoded" | "form-data" | "binary"
    #[serde(default, alias = "raw_type", alias = "rawType")]
    pub raw_type: Option<String>,
    #[serde(default, alias = "body_raw", alias = "bodyRaw")]
    pub body_raw: Option<String>,
    #[serde(default, alias = "form_data", alias = "formData")]
    pub form_data: Vec<KeyValueItem>,
    #[serde(default, alias = "urlencoded_data", alias = "urlencodedData")]
    pub urlencoded_data: Vec<KeyValueItem>,
    #[serde(default, alias = "binary_file_path", alias = "binaryFilePath")]
    pub binary_file_path: Option<String>,
    #[serde(default, alias = "timeout_ms", alias = "timeoutMs")]
    pub timeout_ms: Option<u64>,
    #[serde(default, alias = "ignore_ssl", alias = "ignoreSsl")]
    pub ignore_ssl: Option<bool>,
    #[serde(default, alias = "follow_redirects", alias = "followRedirects")]
    pub follow_redirects: Option<bool>,
    #[serde(default)]
    pub proxy: Option<String>,
    #[serde(default)]
    pub auth: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub body_base64: Option<String>,
    pub is_binary: bool,
    pub is_large: bool,
    pub temp_file_path: Option<String>,
    pub duration_ms: u64,
    pub size_bytes: usize,
}

#[tauri::command]
pub async fn http_execute(
    req: HttpRequestPayload,
    db: tauri::State<'_, DbState>,
) -> Result<HttpResponsePayload, String> {
    let mut client_builder = reqwest::Client::builder();

    // 1. SSL 自签名证书忽略配置
    if req.ignore_ssl.unwrap_or(false) {
        client_builder = client_builder.danger_accept_invalid_certs(true);
    }

    // 2. 超时配置（默认 30 秒）
    let timeout = req.timeout_ms.unwrap_or(30_000);
    client_builder = client_builder.timeout(Duration::from_millis(timeout));

    // 3. 重定向策略
    if req.follow_redirects.unwrap_or(true) {
        client_builder = client_builder.redirect(reqwest::redirect::Policy::limited(10));
    } else {
        client_builder = client_builder.redirect(reqwest::redirect::Policy::none());
    }

    // 4. HTTP / SOCKS 代理支持
    if let Some(proxy_str) = &req.proxy {
        let trimmed = proxy_str.trim();
        if !trimmed.is_empty() {
            let proxy = reqwest::Proxy::all(trimmed).map_err(|e| format!("无效代理地址: {}", e))?;
            client_builder = client_builder.proxy(proxy);
        }
    }

    let client = client_builder.build().map_err(|e| format!("初始化网络客户端失败: {}", e))?;

    // 5. URL 处理与校验及 Query 参数拼接
    let mut final_url = req.url.trim().to_string();
    if !final_url.starts_with("http://") && !final_url.starts_with("https://") {
        final_url = format!("http://{}", final_url);
    }

    let mut url_obj = reqwest::Url::parse(&final_url)
        .map_err(|e| format!("无效 URL 地址 '{}': {}", final_url, e))?;

    for p in &req.params {
        if p.enabled && !p.key.trim().is_empty() {
            url_obj.query_pairs_mut().append_pair(p.key.trim(), p.value.trim());
        }
    }
    final_url = url_obj.to_string();

    // 6. HTTP 方法
    let method = match req.method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "PATCH" => reqwest::Method::PATCH,
        "HEAD" => reqwest::Method::HEAD,
        "OPTIONS" => reqwest::Method::OPTIONS,
        other => reqwest::Method::from_bytes(other.as_bytes())
            .map_err(|e| format!("不支持的请求方法 '{}': {}", other, e))?,
    };

    let mut req_builder = client.request(method, &final_url);

    // 7. 自定义请求头注入
    let mut has_content_type = false;
    for h in &req.headers {
        if h.enabled && !h.key.trim().is_empty() {
            if h.key.trim().eq_ignore_ascii_case("content-type") {
                has_content_type = true;
            }
            let header_name = reqwest::header::HeaderName::from_bytes(h.key.trim().as_bytes())
                .map_err(|e| format!("非法请求头名称 '{}': {}", h.key, e))?;
            let header_value = reqwest::header::HeaderValue::from_str(&h.value)
                .map_err(|e| format!("非法请求头数值 '{}': {}", h.value, e))?;
            req_builder = req_builder.header(header_name, header_value);
        }
    }

    // 若未显式设置 Content-Type 且为 Raw JSON 请求，自动补全 application/json
    if !has_content_type && req.body_type == "raw" {
        let is_json = req.raw_type.as_deref() == Some("json")
            || req.body_raw.as_ref().map(|b| {
                let trimmed = b.trim();
                (trimmed.starts_with('{') && trimmed.ends_with('}'))
                    || (trimmed.starts_with('[') && trimmed.ends_with(']'))
            }).unwrap_or(false);

        if is_json {
            req_builder = req_builder.header(reqwest::header::CONTENT_TYPE, "application/json");
        }
    }

    // 8. 请求体装配 (Raw, URL-encoded, Multipart Form-Data, Binary Stream)
    match req.body_type.as_str() {
        "raw" => {
            if let Some(raw) = &req.body_raw {
                req_builder = req_builder.body(raw.clone());
            }
        }
        "x-www-form-urlencoded" => {
            let mut pairs = Vec::new();
            for item in &req.urlencoded_data {
                if item.enabled && !item.key.trim().is_empty() {
                    pairs.push((item.key.clone(), item.value.clone()));
                }
            }
            req_builder = req_builder.form(&pairs);
        }
        "form-data" => {
            let mut form = reqwest::multipart::Form::new();
            for item in &req.form_data {
                if item.enabled && !item.key.trim().is_empty() {
                    if item.item_type.as_deref() == Some("file") {
                        let path = Path::new(&item.value);
                        if !path.exists() {
                            return Err(format!("待上传的文件不存在: {}", item.value));
                        }
                        let file_name = path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("file")
                            .to_string();
                        let file = tokio::fs::File::open(path)
                            .await
                            .map_err(|e| format!("打开上传文件失败 '{}': {}", item.value, e))?;
                        let stream = tokio_util::io::ReaderStream::new(file);
                        let part = reqwest::multipart::Part::stream(reqwest::Body::wrap_stream(stream))
                            .file_name(file_name);
                        form = form.part(item.key.clone(), part);
                    } else {
                        form = form.text(item.key.clone(), item.value.clone());
                    }
                }
            }
            req_builder = req_builder.multipart(form);
        }
        "binary" => {
            if let Some(path_str) = &req.binary_file_path {
                let path = Path::new(path_str);
                if !path.exists() {
                    return Err(format!("二进制文件不存在: {}", path_str));
                }
                let file = tokio::fs::File::open(path)
                    .await
                    .map_err(|e| format!("打开二进制文件失败: {}", e))?;
                let stream = tokio_util::io::ReaderStream::new(file);
                req_builder = req_builder.body(reqwest::Body::wrap_stream(stream));
            }
        }
        _ => {
            // "none" 或无 Body
        }
    }

    // 9. 发送请求并统计全流程耗时（包含完整响应体下载）
    let start_time = Instant::now();
    let response = req_builder.send().await.map_err(|e| {
        if e.is_timeout() {
            "请求超时 (Request Timeout)".to_string()
        } else if e.is_connect() {
            format!("连接失败或目标主机不可达: {}", e)
        } else {
            format!("网络请求错误: {}", e)
        }
    })?;

    let status = response.status().as_u16();
    let status_text = response.status().canonical_reason().unwrap_or("").to_string();

    let mut resp_headers = HashMap::new();
    let mut content_type = String::new();
    for (key, val) in response.headers().iter() {
        if let Ok(v) = val.to_str() {
            if key.as_str().eq_ignore_ascii_case("content-type") {
                content_type = v.to_lowercase();
            }
            resp_headers.insert(key.as_str().to_string(), v.to_string());
        }
    }

    use tokio::io::AsyncWriteExt;

    let mut response = response;
    let mut bytes_acc = Vec::new();
    let mut total_size: usize = 0;
    let mut temp_file: Option<tokio::fs::File> = None;
    let mut temp_file_path: Option<String> = None;

    while let Some(chunk) = response.chunk().await.map_err(|e| format!("接收响应数据流失败: {}", e))? {
        total_size += chunk.len();
        if total_size > 5 * 1024 * 1024 && temp_file.is_none() {
            let temp_path = std::env::temp_dir().join(format!("devutils_resp_{}.bin", uuid::Uuid::new_v4()));
            let mut file = tokio::fs::File::create(&temp_path).await.map_err(|e| format!("创建临时缓存文件失败: {}", e))?;
            file.write_all(&bytes_acc).await.map_err(|e| format!("写入临时缓存文件失败: {}", e))?;
            temp_file_path = Some(temp_path.to_string_lossy().to_string());
            temp_file = Some(file);
        }

        if let Some(file) = &mut temp_file {
            file.write_all(&chunk).await.map_err(|e| format!("写入临时缓存文件失败: {}", e))?;
        } else {
            bytes_acc.extend_from_slice(&chunk);
        }
    }

    if let Some(mut file) = temp_file {
        file.flush().await.map_err(|e| format!("刷新临时缓存文件失败: {}", e))?;
    }

    let duration_ms = start_time.elapsed().as_millis() as u64;
    let size_bytes = total_size;
    let is_large = size_bytes > 5 * 1024 * 1024;

    let is_image = content_type.starts_with("image/");
    let is_binary_mime = is_image
        || content_type.starts_with("audio/")
        || content_type.starts_with("video/")
        || content_type.contains("octet-stream")
        || content_type.contains("pdf")
        || content_type.contains("zip")
        || content_type.contains("tar")
        || content_type.contains("gzip");

    use base64::Engine;
    let (is_binary, body, body_base64) = if is_large {
        if is_binary_mime {
            (true, String::new(), None)
        } else {
            let mut preview_len = (1024 * 1024).min(bytes_acc.len());
            // 如果截断处落在多字节 UTF-8 字符序列中间，向左回退到字符起始边界
            if preview_len < bytes_acc.len() {
                while preview_len > 0 && (bytes_acc[preview_len] & 0b1100_0000) == 0b1000_0000 {
                    preview_len -= 1;
                }
            }

            // 检查前 4096 字节是否包含空字节以判定是否为二进制流
            let has_nul = bytes_acc[..preview_len.min(4096)].contains(&0u8);
            if has_nul {
                (true, String::new(), None)
            } else {
                let preview_text = match std::str::from_utf8(&bytes_acc[..preview_len]) {
                    Ok(utf8_str) => utf8_str.to_string(),
                    Err(_) => String::from_utf8_lossy(&bytes_acc[..preview_len]).into_owned(),
                };
                let mut preview = preview_text;
                preview.push_str("\n\n... [已自动开启大文本保护：响应体大于 5MB，仅展示前 1MB 预览。完整内容已保存至临时缓存文件] ...");
                (false, preview, None)
            }
        }
    } else if is_binary_mime {
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes_acc);
        (true, String::new(), Some(b64))
    } else {
        match std::str::from_utf8(&bytes_acc) {
            Ok(utf8_str) => (false, utf8_str.to_string(), None),
            Err(_) => {
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes_acc);
                (true, String::new(), Some(b64))
            }
        }
    };

    let resp_payload = HttpResponsePayload {
        status,
        status_text,
        headers: resp_headers,
        body,
        body_base64,
        is_binary,
        is_large,
        temp_file_path,
        duration_ms,
        size_bytes,
    };

    // 10. 记录到 SQLite `http_history` 表中（由触发器自动保留最新 500 条）
    let history_id = uuid::Uuid::new_v4().to_string();
    let executed_at = chrono::Utc::now().timestamp_millis();
    let req_data_json = serde_json::to_string(&req).unwrap_or_default();
    let resp_summary = serde_json::json!({
        "status": status,
        "duration_ms": duration_ms,
        "size_bytes": size_bytes
    });
    let resp_summary_json = serde_json::to_string(&resp_summary).unwrap_or_default();
    let method_record = req.method.clone();
    let url_record = final_url.clone();

    let db_conn = db.0.clone();
    let _ = db_conn
        .call(move |conn| {
            let mut stmt = conn.prepare(
                "INSERT INTO http_history (id, method, url, status_code, duration_ms, request_data_json, response_summary_json, executed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);"
            )?;
            stmt.execute(rusqlite::params![
                history_id,
                method_record,
                url_record,
                status as i64,
                duration_ms as i64,
                req_data_json,
                resp_summary_json,
                executed_at
            ])?;
            Ok(())
        })
        .await;

    Ok(resp_payload)
}

/// 清理系统临时目录中遗留的 devutils_resp_*.bin 大响应缓存文件
pub fn clean_all_temp_response_files() {
    let temp_dir = std::env::temp_dir();
    if let Ok(entries) = std::fs::read_dir(temp_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.starts_with("devutils_resp_") && file_name.ends_with(".bin") {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
    }
}

/// 前端调用清理指定临时大响应缓存文件
#[tauri::command]
pub async fn http_clean_temp_file(file_path: String) -> Result<(), String> {
    let path = std::path::PathBuf::from(&file_path);
    // 安全校验：只允许删除临时目录下以 devutils_resp_ 开头的文件，防止任意路径文件删除
    let temp_dir = std::env::temp_dir();
    if path.starts_with(&temp_dir) {
        if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
            if file_name.starts_with("devutils_resp_") && file_name.ends_with(".bin") {
                let _ = tokio::fs::remove_file(&path).await;
            }
        }
    }
    Ok(())
}
