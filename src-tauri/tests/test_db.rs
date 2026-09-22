use std::sync::Arc;
use tokio_rusqlite::Connection;
use devutils_lib::db::DbState;

#[tokio::test]
async fn test_database_lifecycle_and_triggers() {
    let conn = Connection::open_in_memory().await.unwrap();

    // 执行全量迁移
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();
    let state = DbState(Arc::new(conn));

    // 验证版本记录
    let version: i32 = state
        .0
        .call(|c| {
            let mut stmt = c.prepare("SELECT MAX(version) FROM schema_migrations")?;
            let v = stmt.query_row([], |r| r.get(0))?;
            Ok(v)
        })
        .await
        .unwrap();
    assert_eq!(version, 1);

    // 验证 http_history 500 条触发器 (插入 505 条，自动修剪至 500 条)
    state
        .0
        .call(|c| {
            for i in 1..=505 {
                c.execute(
                    "INSERT INTO http_history (id, method, url, executed_at) VALUES (?1, 'GET', 'http://test', ?2)",
                    rusqlite::params![format!("id_{}", i), i],
                )?;
            }
            let count: i64 = c.query_row("SELECT COUNT(*) FROM http_history", [], |r| r.get(0))?;
            assert_eq!(count, 500);
            Ok(())
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn test_app_recents_prune_trigger() {
    let conn = Connection::open_in_memory().await.unwrap();
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();
    let state = DbState(Arc::new(conn));

    // 插入 55 条 tool_a 记录，10 条 tool_b 记录
    state
        .0
        .call(|c| {
            for i in 1..=55 {
                c.execute(
                    "INSERT INTO app_recents (id, tool_id, summary, payload_json, accessed_at) VALUES (?1, 'tool_a', 'summary', '{}', ?2)",
                    rusqlite::params![format!("recent_a_{}", i), i],
                )?;
            }
            for i in 1..=10 {
                c.execute(
                    "INSERT INTO app_recents (id, tool_id, summary, payload_json, accessed_at) VALUES (?1, 'tool_b', 'summary', '{}', ?2)",
                    rusqlite::params![format!("recent_b_{}", i), i],
                )?;
            }

            let count_a: i64 = c.query_row("SELECT COUNT(*) FROM app_recents WHERE tool_id = 'tool_a'", [], |r| r.get(0))?;
            let count_b: i64 = c.query_row("SELECT COUNT(*) FROM app_recents WHERE tool_id = 'tool_b'", [], |r| r.get(0))?;

            assert_eq!(count_a, 50, "tool_a 记录应修剪至 50 条");
            assert_eq!(count_b, 10, "tool_b 记录应保持 10 条");

            // 验证保留的是最新的 50 条 (即 accessed_at 从 6 到 55)
            let min_accessed: i64 = c.query_row("SELECT MIN(accessed_at) FROM app_recents WHERE tool_id = 'tool_a'", [], |r| r.get(0))?;
            assert_eq!(min_accessed, 6, "最老的前 5 条数据应该已被删除");

            Ok(())
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn test_all_tables_exist() {
    let conn = Connection::open_in_memory().await.unwrap();
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();
    let state = DbState(Arc::new(conn));

    let required_tables = vec![
        "schema_migrations",
        "sys_settings",
        "tool_state_snapshots",
        "app_favorites",
        "app_recents",
        "http_environments",
        "http_collections",
        "http_requests",
        "http_history",
    ];

    state
        .0
        .call(move |c| {
            for table in required_tables {
                let count: i64 = c.query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    rusqlite::params![table],
                    |r| r.get(0),
                )?;
                assert_eq!(count, 1, "表 {} 应当存在", table);
            }
            Ok(())
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn test_migration_idempotency() {
    let conn = Connection::open_in_memory().await.unwrap();
    // 首次迁移
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();
    // 二次迁移，应当幂等且不报错
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();

    let version: i32 = conn
        .call(|c| {
            let v: i32 = c.query_row("SELECT MAX(version) FROM schema_migrations", [], |r| r.get(0))?;
            Ok(v)
        })
        .await
        .unwrap();
    assert_eq!(version, 1);
}
