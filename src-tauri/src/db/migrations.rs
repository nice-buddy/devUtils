use tokio_rusqlite::Connection;

const V1_SCHEMA_SQL: &str = r#"
-- 1. 系统与用户偏好表
CREATE TABLE IF NOT EXISTS sys_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 2. 标签页与工具快照表
CREATE TABLE IF NOT EXISTS tool_state_snapshots (
    tab_id TEXT PRIMARY KEY,
    tool_id TEXT NOT NULL,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    snapshot_data_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_updated ON tool_state_snapshots(updated_at);

-- 3. 通用收藏夹表
CREATE TABLE IF NOT EXISTS app_favorites (
    id TEXT PRIMARY KEY,
    tool_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    content_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    sort_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_favorites_tool ON app_favorites(tool_id);

-- 4. 通用最近使用记录表
CREATE TABLE IF NOT EXISTS app_recents (
    id TEXT PRIMARY KEY,
    tool_id TEXT NOT NULL,
    summary TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    accessed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recents_tool_accessed ON app_recents(tool_id, accessed_at DESC);

-- 触发器：app_recents 每个工具超过 50 条时自动修剪老数据
CREATE TRIGGER IF NOT EXISTS trg_prune_app_recents
AFTER INSERT ON app_recents
BEGIN
    DELETE FROM app_recents
    WHERE tool_id = NEW.tool_id
      AND id NOT IN (
          SELECT id FROM app_recents
          WHERE tool_id = NEW.tool_id
          ORDER BY accessed_at DESC LIMIT 50
      );
END;

-- 5. Postman 环境变量表
CREATE TABLE IF NOT EXISTS http_environments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    variables_json TEXT NOT NULL,
    is_active INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

-- 6. Postman 请求集合目录树表
CREATE TABLE IF NOT EXISTS http_collections (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
);

-- 7. Postman 收藏请求详情表
CREATE TABLE IF NOT EXISTS http_requests (
    id TEXT PRIMARY KEY,
    collection_id TEXT,
    name TEXT NOT NULL,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    headers_json TEXT,
    params_json TEXT,
    body_type TEXT,
    body_content TEXT,
    auth_json TEXT,
    settings_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(collection_id) REFERENCES http_collections(id) ON DELETE CASCADE
);

-- 8. Postman 请求历史日志表（限制保留最新 500 条）
CREATE TABLE IF NOT EXISTS http_history (
    id TEXT PRIMARY KEY,
    method TEXT NOT NULL,
    url TEXT NOT NULL,
    status_code INTEGER,
    duration_ms INTEGER,
    request_data_json TEXT,
    response_summary_json TEXT,
    executed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_executed ON http_history(executed_at DESC);

-- 触发器：http_history 超过 500 条时自动修剪老数据
CREATE TRIGGER IF NOT EXISTS trg_prune_http_history
AFTER INSERT ON http_history
BEGIN
    DELETE FROM http_history
    WHERE id NOT IN (
        SELECT id FROM http_history ORDER BY executed_at DESC LIMIT 500
    );
END;
"#;

pub async fn run_migrations(conn: &Connection) -> Result<(), tokio_rusqlite::Error> {
    conn.call(|c| {
        // 在事务外启用外键约束支持
        c.execute_batch("PRAGMA foreign_keys = ON;")?;

        // 创建迁移版本记录表
        c.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at INTEGER NOT NULL,
                description TEXT NOT NULL
            );",
        )?;

        // 查询当前已应用的最新版本
        let current_version: i32 = c.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |r| r.get(0),
        )?;

        // 版本 1 迁移
        if current_version < 1 {
            let tx = c.transaction()?;
            tx.execute_batch(V1_SCHEMA_SQL)?;
            let now = chrono::Utc::now().timestamp();
            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at, description) VALUES (1, ?1, ?2)",
                rusqlite::params![now, "initial schema: base tables and pruning triggers"],
            )?;
            tx.commit()?;
        }

        Ok(())
    })
    .await
}
