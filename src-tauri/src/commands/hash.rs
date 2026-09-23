use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use hmac::{Hmac, Mac};
use sha2::Digest;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashProgress {
    pub read_bytes: u64,
    pub total_bytes: u64,
}

#[derive(Clone, Default)]
pub struct HashCancelManager {
    pub tasks: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl HashCancelManager {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn register(&self, task_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        let mut tasks = self.tasks.lock().unwrap();
        tasks.insert(task_id.to_string(), flag.clone());
        flag
    }

    pub fn cancel(&self, task_id: &str) {
        let tasks = self.tasks.lock().unwrap();
        if let Some(flag) = tasks.get(task_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    pub fn remove(&self, task_id: &str) {
        let mut tasks = self.tasks.lock().unwrap();
        tasks.remove(task_id);
    }
}

struct CancelCleanupGuard {
    manager: HashCancelManager,
    task_id: String,
}

impl Drop for CancelCleanupGuard {
    fn drop(&mut self) {
        self.manager.remove(&self.task_id);
    }
}

pub enum HasherEngine {
    Md5 { inner: md5::Md5, is_16: bool },
    Sha1(sha1::Sha1),
    Sha256(sha2::Sha256),
    Sha512(sha2::Sha512),
    Sha3_256(sha3::Sha3_256),
    Sha3_512(sha3::Sha3_512),
}

impl HasherEngine {
    pub fn try_new(algo: &str) -> Result<Self, String> {
        let norm = algo.trim().to_lowercase().replace(['-', '_'], "");
        match norm.as_str() {
            "md5" | "md532" => Ok(HasherEngine::Md5 {
                inner: md5::Md5::new(),
                is_16: false,
            }),
            "md516" => Ok(HasherEngine::Md5 {
                inner: md5::Md5::new(),
                is_16: true,
            }),
            "sha1" => Ok(HasherEngine::Sha1(sha1::Sha1::new())),
            "sha256" => Ok(HasherEngine::Sha256(sha2::Sha256::new())),
            "sha512" => Ok(HasherEngine::Sha512(sha2::Sha512::new())),
            "sha3256" => Ok(HasherEngine::Sha3_256(sha3::Sha3_256::new())),
            "sha3512" => Ok(HasherEngine::Sha3_512(sha3::Sha3_512::new())),
            _ => Err(format!("不支持的哈希算法: {}", algo)),
        }
    }

    pub fn update(&mut self, data: &[u8]) {
        match self {
            HasherEngine::Md5 { inner, .. } => Digest::update(inner, data),
            HasherEngine::Sha1(h) => Digest::update(h, data),
            HasherEngine::Sha256(h) => Digest::update(h, data),
            HasherEngine::Sha512(h) => Digest::update(h, data),
            HasherEngine::Sha3_256(h) => Digest::update(h, data),
            HasherEngine::Sha3_512(h) => Digest::update(h, data),
        }
    }

    pub fn finalize(self) -> String {
        match self {
            HasherEngine::Md5 { inner, is_16 } => {
                let full = hex::encode(Digest::finalize(inner));
                if is_16 {
                    full[8..24].to_string()
                } else {
                    full
                }
            }
            HasherEngine::Sha1(h) => hex::encode(Digest::finalize(h)),
            HasherEngine::Sha256(h) => hex::encode(Digest::finalize(h)),
            HasherEngine::Sha512(h) => hex::encode(Digest::finalize(h)),
            HasherEngine::Sha3_256(h) => hex::encode(Digest::finalize(h)),
            HasherEngine::Sha3_512(h) => hex::encode(Digest::finalize(h)),
        }
    }
}

fn compute_hmac(text: &[u8], key: &[u8], algo: &str) -> Result<String, String> {
    let norm = algo.trim().to_lowercase().replace(['-', '_'], "");
    match norm.as_str() {
        "md5" | "md532" => {
            let mut mac = Hmac::<md5::Md5>::new_from_slice(key)
                .map_err(|e| format!("HMAC 密钥初始化失败: {}", e))?;
            mac.update(text);
            Ok(hex::encode(mac.finalize().into_bytes()))
        }
        "md516" => {
            let mut mac = Hmac::<md5::Md5>::new_from_slice(key)
                .map_err(|e| format!("HMAC 密钥初始化失败: {}", e))?;
            mac.update(text);
            let full = hex::encode(mac.finalize().into_bytes());
            Ok(full[8..24].to_string())
        }
        "sha1" => {
            let mut mac = Hmac::<sha1::Sha1>::new_from_slice(key)
                .map_err(|e| format!("HMAC 密钥初始化失败: {}", e))?;
            mac.update(text);
            Ok(hex::encode(mac.finalize().into_bytes()))
        }
        "sha256" => {
            let mut mac = Hmac::<sha2::Sha256>::new_from_slice(key)
                .map_err(|e| format!("HMAC 密钥初始化失败: {}", e))?;
            mac.update(text);
            Ok(hex::encode(mac.finalize().into_bytes()))
        }
        "sha512" => {
            let mut mac = Hmac::<sha2::Sha512>::new_from_slice(key)
                .map_err(|e| format!("HMAC 密钥初始化失败: {}", e))?;
            mac.update(text);
            Ok(hex::encode(mac.finalize().into_bytes()))
        }
        "sha3256" => {
            let mut mac = Hmac::<sha3::Sha3_256>::new_from_slice(key)
                .map_err(|e| format!("HMAC 密钥初始化失败: {}", e))?;
            mac.update(text);
            Ok(hex::encode(mac.finalize().into_bytes()))
        }
        "sha3512" => {
            let mut mac = Hmac::<sha3::Sha3_512>::new_from_slice(key)
                .map_err(|e| format!("HMAC 密钥初始化失败: {}", e))?;
            mac.update(text);
            Ok(hex::encode(mac.finalize().into_bytes()))
        }
        _ => Err(format!("不支持的 HMAC 哈希算法: {}", algo)),
    }
}

pub fn compute_file_hash_core<F>(
    file_path: &Path,
    algorithm: &str,
    cancel_flag: &AtomicBool,
    mut on_progress: F,
) -> Result<String, String>
where
    F: FnMut(HashProgress) -> bool,
{
    let mut file = File::open(file_path)
        .map_err(|e| format!("打开文件失败 '{}': {}", file_path.display(), e))?;

    let total_bytes = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mut hasher = HasherEngine::try_new(algorithm)?;

    // 2MB 固定缓冲区，避免超大文件造成物理内存激增（内存恒定 < 30MB）
    let mut buffer = vec![0u8; 2 * 1024 * 1024];
    let mut read_bytes: u64 = 0;

    if total_bytes == 0 {
        let _ = on_progress(HashProgress {
            read_bytes: 0,
            total_bytes: 0,
        });
        return Ok(hasher.finalize());
    }

    loop {
        if cancel_flag.load(Ordering::Relaxed) {
            return Err("Cancelled".to_string());
        }

        let n = file
            .read(&mut buffer)
            .map_err(|e| format!("读取文件块失败: {}", e))?;

        if n == 0 {
            break;
        }

        hasher.update(&buffer[..n]);
        read_bytes += n as u64;

        let alive = on_progress(HashProgress {
            read_bytes,
            total_bytes,
        });
        if !alive {
            return Err("Cancelled".to_string());
        }

        if cancel_flag.load(Ordering::Relaxed) {
            return Err("Cancelled".to_string());
        }
    }

    Ok(hasher.finalize())
}

#[tauri::command]
pub fn compute_text_hash(
    text: String,
    algorithm: String,
    key: Option<String>,
) -> Result<String, String> {
    if let Some(k) = key.filter(|s| !s.is_empty()) {
        compute_hmac(text.as_bytes(), k.as_bytes(), &algorithm)
    } else {
        let mut hasher = HasherEngine::try_new(&algorithm)?;
        hasher.update(text.as_bytes());
        Ok(hasher.finalize())
    }
}

#[tauri::command]
pub async fn compute_file_hash(
    task_id: String,
    file_path: String,
    algorithm: String,
    on_progress: tauri::ipc::Channel<HashProgress>,
    cancel_manager: tauri::State<'_, HashCancelManager>,
) -> Result<String, String> {
    let flag = cancel_manager.register(&task_id);
    let path = PathBuf::from(file_path);
    let algo = algorithm;
    let flag_clone = Arc::clone(&flag);

    let _cleanup_guard = CancelCleanupGuard {
        manager: cancel_manager.inner().clone(),
        task_id: task_id.clone(),
    };

    tokio::task::spawn_blocking(move || {
        compute_file_hash_core(&path, &algo, &flag_clone, |p| {
            on_progress.send(p).is_ok()
        })
    })
    .await
    .map_err(|e| format!("流式哈希任务执行失败: {}", e))?
}

#[tauri::command]
pub fn cancel_file_hash(
    task_id: String,
    cancel_manager: tauri::State<'_, HashCancelManager>,
) -> Result<(), String> {
    cancel_manager.cancel(&task_id);
    Ok(())
}
