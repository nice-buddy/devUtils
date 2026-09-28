/// 只允许打开 GitHub 的 https 链接，避免把任意字符串交给系统去打开
fn is_allowed_external_url(url: &str) -> bool {
    url.starts_with("https://github.com/") || url.starts_with("https://api.github.com/")
}

/// 用系统默认浏览器打开外部链接。
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !is_allowed_external_url(trimmed) {
        return Err("仅支持打开 GitHub 的 https 链接".into());
    }

    #[cfg(target_os = "macos")]
    let spawned = std::process::Command::new("open").arg(trimmed).spawn();
    #[cfg(target_os = "windows")]
    let spawned = std::process::Command::new("cmd")
        .args(["/C", "start", "", trimmed])
        .spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let spawned = std::process::Command::new("xdg-open").arg(trimmed).spawn();

    spawned
        .map(|_| ())
        .map_err(|err| format!("打开浏览器失败：{err}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_github_https_urls() {
        assert!(is_allowed_external_url("https://github.com/nice-buddy/devUtils"));
        assert!(is_allowed_external_url(
            "https://github.com/nice-buddy/devUtils/releases/tag/v0.1.0"
        ));
    }

    #[test]
    fn rejects_other_schemes_and_hosts() {
        assert!(!is_allowed_external_url("http://github.com/nice-buddy/devUtils"));
        assert!(!is_allowed_external_url("https://evil.example.com/github.com/"));
        assert!(!is_allowed_external_url("file:///etc/passwd"));
        assert!(!is_allowed_external_url(""));
    }
}
