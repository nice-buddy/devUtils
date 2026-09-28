use serde::{Deserialize, Serialize};

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub tag_name: String,
    pub name: String,
    pub body: String,
    pub html_url: String,
    pub published_at: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    #[serde(default)]
    tag_name: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    body: String,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    published_at: String,
}

/// GitHub 的 owner / repo 只允许字母、数字与 `-` `_` `.`，避免被拼出越界路径
fn is_safe_repo_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment.len() <= 100
        && segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

/// 读取仓库最新的正式 Release；仓库还没有发布过时返回 None。
#[tauri::command]
pub async fn fetch_latest_release(
    owner: String,
    repo: String,
) -> Result<Option<ReleaseInfo>, String> {
    if !is_safe_repo_segment(&owner) || !is_safe_repo_segment(&repo) {
        return Err("仓库参数非法".into());
    }

    let url = format!("https://api.github.com/repos/{owner}/{repo}/releases/latest");
    let client = reqwest::Client::builder()
        .user_agent("DevUtils")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|err| format!("初始化网络客户端失败：{err}"))?;

    let response = client
        .get(&url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|err| format!("请求 GitHub 失败：{err}"))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!("GitHub 返回异常状态：{}", response.status()));
    }

    let release: GithubRelease = response
        .json()
        .await
        .map_err(|err| format!("解析 GitHub 响应失败：{err}"))?;

    Ok(Some(ReleaseInfo {
        tag_name: release.tag_name,
        name: release.name,
        body: release.body,
        html_url: release.html_url,
        published_at: release.published_at,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_normal_repo_segments() {
        assert!(is_safe_repo_segment("nice-buddy"));
        assert!(is_safe_repo_segment("devUtils"));
        assert!(is_safe_repo_segment("some.repo_name-2"));
    }

    #[test]
    fn rejects_segments_that_could_escape_the_path() {
        assert!(!is_safe_repo_segment(""));
        assert!(!is_safe_repo_segment("owner/../other"));
        assert!(!is_safe_repo_segment("owner/repo"));
        assert!(!is_safe_repo_segment("owner?x=1"));
        assert!(!is_safe_repo_segment(&"a".repeat(101)));
    }
}
