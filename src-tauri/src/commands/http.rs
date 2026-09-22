use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::time::{Duration, Instant};
use crate::db::DbState;

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KeyValueItem {
    pub key: String,
    pub value: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub item_type: Option<String>, // "text" | "file"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HttpRequestPayload {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<KeyValueItem>,
    #[serde(default)]
    pub params: Vec<KeyValueItem>,
    #[serde(default)]
    pub body_type: String, // "none" | "raw" | "x-www-form-urlencoded" | "form-data" | "binary"
    #[serde(default)]
    pub body_raw: Option<String>,
    #[serde(default)]
    pub form_data: Vec<KeyValueItem>,
    #[serde(default)]
    pub urlencoded_data: Vec<KeyValueItem>,
    #[serde(default)]
    pub binary_file_path: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub ignore_ssl: Option<bool>,
    #[serde(default)]
    pub follow_redirects: Option<bool>,
    #[serde(default)]
    pub proxy: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HttpResponsePayload {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
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

    // 5. URL 处理与校验
    let mut final_url = req.url.trim().to_string();
    if !final_url.starts_with("http://") && !final_url.starts_with("https://") {
        final_url = format!("http://{}", final_url);
    }

    // 若 URL 不含 Query 参数且 params 存在有效键值对，则拼接 Query 参数
    if !final_url.contains('?') && !req.params.is_empty() {
        let mut query_pairs = Vec::new();
        for p in &req.params {
            if p.enabled && !p.key.trim().is_empty() {
                query_pairs.push((p.key.trim(), p.value.trim()));
            }
        }
        if !query_pairs.is_empty() {
            if let Ok(mut url_obj) = reqwest::Url::parse(&final_url) {
                for (k, v) in query_pairs {
                    url_obj.query_pairs_mut().append_pair(k, v);
                }
                final_url = url_obj.to_string();
            }
        }
    }

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
    for h in &req.headers {
        if h.enabled && !h.key.trim().is_empty() {
            let header_name = reqwest::header::HeaderName::from_bytes(h.key.trim().as_bytes())
                .map_err(|e| format!("非法请求头名称 '{}': {}", h.key, e))?;
            let header_value = reqwest::header::HeaderValue::from_str(&h.value)
                .map_err(|e| format!("非法请求头数值 '{}': {}", h.value, e))?;
            req_builder = req_builder.header(header_name, header_value);
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
                        let bytes = tokio::fs::read(path)
                            .await
                            .map_err(|e| format!("读取上传文件失败 '{}': {}", item.value, e))?;
                        let part = reqwest::multipart::Part::bytes(bytes).file_name(file_name);
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
                let bytes = tokio::fs::read(path)
                    .await
                    .map_err(|e| format!("读取二进制文件失败: {}", e))?;
                req_builder = req_builder.body(bytes);
            }
        }
        _ => {
            // "none" 或无 Body
        }
    }

    // 9. 发送请求并统计耗时
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

    let duration_ms = start_time.elapsed().as_millis() as u64;
    let status = response.status().as_u16();
    let status_text = response.status().canonical_reason().unwrap_or("").to_string();

    let mut resp_headers = HashMap::new();
    for (key, val) in response.headers().iter() {
        if let Ok(v) = val.to_str() {
            resp_headers.insert(key.as_str().to_string(), v.to_string());
        }
    }

    let bytes = response.bytes().await.map_err(|e| format!("接收响应数据流失败: {}", e))?;
    let size_bytes = bytes.len();
    let body = String::from_utf8_lossy(&bytes).to_string();

    let resp_payload = HttpResponsePayload {
        status,
        status_text,
        headers: resp_headers,
        body,
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
