use base64::Engine;

/// 把 base64 内容写到指定路径，返回写入字节数。
/// 目标目录不存在时自动创建；路径由用户输入，属「另存为」语义。
#[tauri::command]
pub fn save_binary_file(path: String, base64: String) -> Result<u64, String> {
    let trimmed = base64.trim();
    if trimmed.is_empty() {
        return Err("内容为空".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(trimmed)
        .map_err(|err| format!("Base64 解码失败：{err}"))?;

    let target = std::path::PathBuf::from(path.trim());
    if target.as_os_str().is_empty() {
        return Err("路径为空".into());
    }
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|err| format!("创建目录失败：{err}"))?;
        }
    }
    std::fs::write(&target, &bytes).map_err(|err| format!("写入失败：{err}"))?;
    Ok(bytes.len() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_decoded_bytes_and_creates_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested/out.bin");
        let written = save_binary_file(path.to_string_lossy().into_owned(), "AQID".into()).unwrap();
        assert_eq!(written, 3);
        assert_eq!(std::fs::read(&path).unwrap(), vec![1, 2, 3]);
    }

    #[test]
    fn rejects_invalid_input() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bad.bin");
        assert!(save_binary_file(path.to_string_lossy().into_owned(), "!!!".into()).is_err());
        assert!(save_binary_file(path.to_string_lossy().into_owned(), "   ".into()).is_err());
        assert!(save_binary_file("   ".into(), "AQID".into()).is_err());
    }
}
