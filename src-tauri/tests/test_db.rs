use std::sync::Arc;
use tauri::Manager;
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

#[tokio::test]
async fn test_db_ipc_commands_and_cascade_delete() {
    let conn = Connection::open_in_memory().await.unwrap();
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();
    let state = DbState(Arc::new(conn));

    let app = tauri::test::mock_app();
    app.manage(state);
    let tauri_state = app.state::<DbState>();

    // 1. 测试 db_execute 插入 http_collections (参数类型: string, null, number)
    let col_affected = devutils_lib::db::db_execute(
        "INSERT INTO http_collections (id, parent_id, name, sort_order) VALUES (?1, ?2, ?3, ?4)".into(),
        Some(vec![
            serde_json::Value::String("col_test_1".into()),
            serde_json::Value::Null,
            serde_json::Value::String("Test Collection".into()),
            serde_json::json!(10),
        ]),
        tauri_state.clone(),
    )
    .await
    .expect("Failed to insert collection");
    assert_eq!(col_affected, 1);

    // 2. 测试 db_execute 插入 http_requests (参数类型: string, json object, json array/null, number)
    let req_affected = devutils_lib::db::db_execute(
        "INSERT INTO http_requests (id, collection_id, name, method, url, headers_json, params_json, body_type, body_content, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)".into(),
        Some(vec![
            serde_json::Value::String("req_test_1".into()),
            serde_json::Value::String("col_test_1".into()),
            serde_json::Value::String("Get Users".into()),
            serde_json::Value::String("GET".into()),
            serde_json::Value::String("https://api.example.com/users".into()),
            serde_json::json!({"Authorization": "Bearer token123"}),
            serde_json::json!([{"key": "page", "value": "1"}]),
            serde_json::Value::String("json".into()),
            serde_json::Value::String("{\"query\":\"all\"}".into()),
            serde_json::json!(1710000000),
            serde_json::json!(1710000000),
        ]),
        tauri_state.clone(),
    )
    .await
    .expect("Failed to insert request");
    assert_eq!(req_affected, 1);

    // 3. 测试 db_execute 插入包含 boolean 类型的记录 (以 http_environments 为例)
    let env_affected = devutils_lib::db::db_execute(
        "INSERT INTO http_environments (id, name, variables_json, is_active, created_at) VALUES (?1, ?2, ?3, ?4, ?5)".into(),
        Some(vec![
            serde_json::Value::String("env_test_1".into()),
            serde_json::Value::String("Development".into()),
            serde_json::json!({"API_KEY": "secret"}),
            serde_json::Value::Bool(true),
            serde_json::json!(1710000000),
        ]),
        tauri_state.clone(),
    )
    .await
    .expect("Failed to insert environment");
    assert_eq!(env_affected, 1);

    // 4. 测试 db_query 查询数据回显，并验证字段类型转换
    let req_rows = devutils_lib::db::db_query(
        "SELECT id, collection_id, name, method, url, headers_json, params_json, created_at FROM http_requests WHERE id = ?1".into(),
        Some(vec![serde_json::Value::String("req_test_1".into())]),
        tauri_state.clone(),
    )
    .await
    .expect("Failed to query requests");

    assert_eq!(req_rows.len(), 1);
    let row = &req_rows[0];
    assert_eq!(row["id"], "req_test_1");
    assert_eq!(row["collection_id"], "col_test_1");
    assert_eq!(row["name"], "Get Users");
    assert_eq!(row["method"], "GET");
    assert_eq!(row["url"], "https://api.example.com/users");
    assert_eq!(row["headers_json"], "{\"Authorization\":\"Bearer token123\"}");
    assert_eq!(row["params_json"], "[{\"key\":\"page\",\"value\":\"1\"}]");
    assert_eq!(row["created_at"], 1710000000);

    let env_rows = devutils_lib::db::db_query(
        "SELECT id, name, is_active FROM http_environments WHERE id = ?1".into(),
        Some(vec![serde_json::Value::String("env_test_1".into())]),
        tauri_state.clone(),
    )
    .await
    .expect("Failed to query environment");
    assert_eq!(env_rows.len(), 1);
    assert_eq!(env_rows[0]["is_active"], 1);

    // 5. 测试外键约束阻止插入无效的 collection_id
    let invalid_foreign_key_result = devutils_lib::db::db_execute(
        "INSERT INTO http_requests (id, collection_id, name, method, url, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)".into(),
        Some(vec![
            serde_json::Value::String("req_invalid".into()),
            serde_json::Value::String("non_existent_collection".into()),
            serde_json::Value::String("Invalid FK".into()),
            serde_json::Value::String("GET".into()),
            serde_json::Value::String("https://api.example.com".into()),
            serde_json::json!(1710000000),
            serde_json::json!(1710000000),
        ]),
        tauri_state.clone(),
    )
    .await;
    assert!(
        invalid_foreign_key_result.is_err(),
        "Expected foreign key constraint violation error when collection does not exist"
    );

    // 6. 测试级联删除 (ON DELETE CASCADE): 删除 collection，关联的 request 自动被删除
    let del_affected = devutils_lib::db::db_execute(
        "DELETE FROM http_collections WHERE id = ?1".into(),
        Some(vec![serde_json::Value::String("col_test_1".into())]),
        tauri_state.clone(),
    )
    .await
    .expect("Failed to delete collection");
    assert_eq!(del_affected, 1);

    let req_after_del = devutils_lib::db::db_query(
        "SELECT id FROM http_requests WHERE id = ?1".into(),
        Some(vec![serde_json::Value::String("req_test_1".into())]),
        tauri_state.clone(),
    )
    .await
    .expect("Query failed");
    assert_eq!(
        req_after_del.len(),
        0,
        "Request should be deleted by CASCADE when parent collection is deleted"
    );
}

#[tokio::test]
async fn test_db_bigint_ipc_safety() {
    let conn = Connection::open_in_memory().await.unwrap();
    devutils_lib::db::migrations::run_migrations(&conn).await.unwrap();
    let state = DbState(Arc::new(conn));

    let app = tauri::test::mock_app();
    app.manage(state);
    let tauri_state = app.state::<DbState>();

    // 边界值:
    // JS Number.MAX_SAFE_INTEGER = 9007199254740991
    // JS Number.MIN_SAFE_INTEGER = -9007199254740991
    let safe_positive = 9_007_199_254_740_991i64;
    let overflow_positive = 9_007_199_254_740_992i64;
    let i64_max = i64::MAX; // 9223372036854775807
    let safe_negative = -9_007_199_254_740_991i64;
    let overflow_negative = -9_007_199_254_740_992i64;
    let i64_min = i64::MIN; // -9223372036854775808

    devutils_lib::db::db_execute(
        "INSERT INTO sys_settings (key, value, updated_at) VALUES \
         ('safe_pos', 'val', ?1), \
         ('overflow_pos', 'val', ?2), \
         ('max_pos', 'val', ?3), \
         ('safe_neg', 'val', ?4), \
         ('overflow_neg', 'val', ?5), \
         ('min_neg', 'val', ?6)".into(),
        Some(vec![
            serde_json::json!(safe_positive),
            serde_json::json!(overflow_positive),
            serde_json::json!(i64_max),
            serde_json::json!(safe_negative),
            serde_json::json!(overflow_negative),
            serde_json::json!(i64_min),
        ]),
        tauri_state.clone(),
    )
    .await
    .expect("Insert settings");

    let rows = devutils_lib::db::db_query(
        "SELECT key, updated_at FROM sys_settings ORDER BY key".into(),
        None,
        tauri_state.clone(),
    )
    .await
    .expect("Query settings");

    let map: std::collections::HashMap<String, serde_json::Value> = rows
        .into_iter()
        .map(|r| {
            (
                r["key"].as_str().unwrap().to_string(),
                r["updated_at"].clone(),
            )
        })
        .collect();

    // 安全范围内应保持为 JSON Number
    assert_eq!(map["safe_pos"], serde_json::Value::Number(safe_positive.into()));
    assert_eq!(map["safe_neg"], serde_json::Value::Number(safe_negative.into()));

    // 超出 JS 安全整数范围的应被序列化为 String
    assert_eq!(map["overflow_pos"], serde_json::Value::String("9007199254740992".into()));
    assert_eq!(map["max_pos"], serde_json::Value::String("9223372036854775807".into()));
    assert_eq!(map["overflow_neg"], serde_json::Value::String("-9007199254740992".into()));
    assert_eq!(map["min_neg"], serde_json::Value::String("-9223372036854775808".into()));
}

