pub mod migrations;

use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio_rusqlite::Connection;

#[derive(Clone)]
pub struct DbState(pub Arc<Connection>);

pub async fn init_db(app: &AppHandle) -> Result<DbState, Box<dyn std::error::Error>> {
    let app_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_dir)?;
    let db_path = app_dir.join("devutils.db");

    let conn = Connection::open(db_path).await?;
    migrations::run_migrations(&conn).await?;

    Ok(DbState(Arc::new(conn)))
}

fn json_to_sqlite_val(v: serde_json::Value) -> rusqlite::types::Value {
    match v {
        serde_json::Value::Null => rusqlite::types::Value::Null,
        serde_json::Value::Bool(b) => rusqlite::types::Value::Integer(if b { 1 } else { 0 }),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                rusqlite::types::Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                rusqlite::types::Value::Real(f)
            } else {
                rusqlite::types::Value::Text(n.to_string())
            }
        }
        serde_json::Value::String(s) => rusqlite::types::Value::Text(s),
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
            rusqlite::types::Value::Text(v.to_string())
        }
    }
}

#[tauri::command]
pub async fn db_execute(
    query: String,
    params: Option<Vec<serde_json::Value>>,
    state: tauri::State<'_, DbState>,
) -> Result<usize, String> {
    let params = params.unwrap_or_default();
    let sqlite_params: Vec<rusqlite::types::Value> = params.into_iter().map(json_to_sqlite_val).collect();

    state
        .0
        .call(move |conn| {
            let mut stmt = conn.prepare(&query)?;
            let affected = stmt.execute(rusqlite::params_from_iter(sqlite_params.iter()))?;
            Ok(affected)
        })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn db_query(
    query: String,
    params: Option<Vec<serde_json::Value>>,
    state: tauri::State<'_, DbState>,
) -> Result<Vec<serde_json::Value>, String> {
    let params = params.unwrap_or_default();
    let sqlite_params: Vec<rusqlite::types::Value> = params.into_iter().map(json_to_sqlite_val).collect();

    state
        .0
        .call(move |conn| {
            let mut stmt = conn.prepare(&query)?;
            let col_names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();
            let rows = stmt.query_map(rusqlite::params_from_iter(sqlite_params.iter()), |row| {
                let mut map = serde_json::Map::new();
                for (idx, name) in col_names.iter().enumerate() {
                    let val_ref = row.get_ref(idx)?;
                    let json_val = match val_ref {
                        rusqlite::types::ValueRef::Null => serde_json::Value::Null,
                        rusqlite::types::ValueRef::Integer(i) => serde_json::Value::Number(i.into()),
                        rusqlite::types::ValueRef::Real(f) => serde_json::Number::from_f64(f)
                            .map(serde_json::Value::Number)
                            .unwrap_or(serde_json::Value::Null),
                        rusqlite::types::ValueRef::Text(t) => {
                            serde_json::Value::String(String::from_utf8_lossy(t).into_owned())
                        }
                        rusqlite::types::ValueRef::Blob(b) => {
                            serde_json::Value::Array(b.iter().map(|&byte| serde_json::Value::Number(byte.into())).collect())
                        }
                    };
                    map.insert(name.clone(), json_val);
                }
                Ok(serde_json::Value::Object(map))
            })?;

            let mut results = Vec::new();
            for r in rows {
                results.push(r?);
            }
            Ok(results)
        })
        .await
        .map_err(|e| e.to_string())
}
