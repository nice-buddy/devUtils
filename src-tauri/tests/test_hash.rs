use std::io::Write;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tempfile::NamedTempFile;

use devutils_lib::commands::hash::{
    compute_file_hash_core, compute_text_hash, HashCancelManager, HashProgress,
};

#[test]
fn test_text_hash_standard_vectors() {
    // Empty string MD5
    let md5_empty = compute_text_hash("".to_string(), "md5".to_string(), None).unwrap();
    assert_eq!(md5_empty, "d41d8cd98f00b204e9800998ecf8427e");

    // "hello world" SHA-1
    let sha1_hw =
        compute_text_hash("hello world".to_string(), "sha1".to_string(), None).unwrap();
    assert_eq!(sha1_hw, "2aae6c35c94fcfb415dbe95f408b9ce91ee846ed");

    // "hello world" SHA-256
    let sha256_hw =
        compute_text_hash("hello world".to_string(), "sha-256".to_string(), None).unwrap();
    assert_eq!(
        sha256_hw,
        "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    );

    // "hello world" SHA-512
    let sha512_hw =
        compute_text_hash("hello world".to_string(), "sha512".to_string(), None).unwrap();
    assert_eq!(
        sha512_hw,
        "309ecc489c12d6eb4cc40f50c902f2b4d0ed77ee511a7c7a9bcd3ca86d4cd86f989dd35bc5ff499670da34255b45b0cfd830e81f605dcf7dc5542e93ae9cd76f"
    );

    // "hello world" SHA3-256
    let sha3_256_hw =
        compute_text_hash("hello world".to_string(), "sha3-256".to_string(), None).unwrap();
    assert_eq!(
        sha3_256_hw,
        "644bcc7e564373040999aac89e7622f3ca71fba1d972fd94a31c3bfbf24e3938"
    );

    // "hello world" SHA3-512
    let sha3_512_hw =
        compute_text_hash("hello world".to_string(), "sha3-512".to_string(), None).unwrap();
    assert_eq!(
        sha3_512_hw,
        "840006653e9ac9e95117a15c915caab81662918e925de9e004f774ff82d7079a40d4d27b1b372657c61d46d470304c88c788b3a4527ad074d1dccbee5dbaa99a"
    );

    // MD5 16-bit
    let md5_16 = compute_text_hash("".to_string(), "md5-16".to_string(), None).unwrap();
    assert_eq!(md5_16, "8f00b204e9800998");
}

#[test]
fn test_text_hash_hmac() {
    let text = "The quick brown fox jumps over the lazy dog".to_string();
    let key = Some("key".to_string());

    // HMAC-SHA256
    let hmac_sha256 = compute_text_hash(text.clone(), "sha-256".to_string(), key.clone()).unwrap();
    assert_eq!(
        hmac_sha256,
        "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
    );

    // HMAC-MD5
    let hmac_md5 = compute_text_hash(text, "md5".to_string(), key).unwrap();
    assert_eq!(hmac_md5, "80070713463e7749b90c2dc24911e275");
}

#[test]
fn test_cancel_manager_lifecycle() {
    let manager = HashCancelManager::new();
    let task_id = "test-task-123";

    let flag = manager.register(task_id);
    assert!(!flag.load(Ordering::Relaxed));

    manager.cancel(task_id);
    assert!(flag.load(Ordering::Relaxed));

    manager.remove(task_id);
    let tasks = manager.tasks.lock().unwrap();
    assert!(!tasks.contains_key(task_id));
}

#[test]
fn test_file_hash_streaming_and_progress() {
    // Create a 5MB temporary file
    let mut temp = NamedTempFile::new().expect("创建临时文件失败");
    let chunk = vec![b'A'; 1024 * 1024]; // 1MB chunk
    for _ in 0..5 {
        temp.write_all(&chunk).expect("写入临时数据失败");
    }
    temp.flush().expect("刷新临时文件失败");

    let manager = HashCancelManager::new();
    let flag = manager.register("stream-test");

    let mut progress_records: Vec<HashProgress> = Vec::new();
    let file_path = temp.path();

    let hash_result = compute_file_hash_core(
        file_path,
        "sha-256",
        &flag,
        |p| {
            progress_records.push(p);
            true
        },
    )
    .expect("流式哈希计算失败");

    assert!(!hash_result.is_empty());
    // 5MB file with 2MB buffer should report progress 3 times: 2MB, 4MB, 5MB
    assert_eq!(progress_records.len(), 3);
    assert_eq!(progress_records[0].read_bytes, 2 * 1024 * 1024);
    assert_eq!(progress_records[1].read_bytes, 4 * 1024 * 1024);
    assert_eq!(progress_records[2].read_bytes, 5 * 1024 * 1024);
    assert_eq!(progress_records[2].total_bytes, 5 * 1024 * 1024);
}

#[test]
fn test_file_hash_cancellation() {
    // Create a 6MB temporary file
    let mut temp = NamedTempFile::new().expect("创建临时文件失败");
    let chunk = vec![b'Z'; 1024 * 1024];
    for _ in 0..6 {
        temp.write_all(&chunk).expect("写入临时数据失败");
    }
    temp.flush().expect("刷新临时文件失败");

    let manager = Arc::new(HashCancelManager::new());
    let task_id = "cancel-task-stream";
    let flag = manager.register(task_id);

    let mgr_clone = manager.clone();
    let t_id = task_id.to_string();

    let result = compute_file_hash_core(
        temp.path(),
        "sha-256",
        &flag,
        move |p| {
            if p.read_bytes >= 2 * 1024 * 1024 {
                mgr_clone.cancel(&t_id);
            }
            true
        },
    );

    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), "Cancelled");
}
