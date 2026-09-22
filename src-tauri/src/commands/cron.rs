use std::str::FromStr;
use chrono::{Duration, Utc};
use chrono_tz::{OffsetComponents, Tz};
use croner::Cron;
use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CronRunItem {
    pub time_str: String,
    pub timestamp_ms: i64,
    pub is_dst: bool,
    pub timezone_abbr: String,
}

#[tauri::command]
pub fn predict_cron_runs(
    pattern: String,
    timezone_str: String,
    count: usize,
) -> Result<Vec<CronRunItem>, String> {
    let cron = Cron::new(&pattern)
        .with_seconds_optional()
        .parse()
        .map_err(|e| format!("Cron 表达式解析失败: {}", e))?;

    let tz = Tz::from_str(&timezone_str)
        .map_err(|e| format!("无效的时区 '{}': {}", timezone_str, e))?;

    let count = count.min(100);
    let now = Utc::now().with_timezone(&tz);
    let mut results = Vec::with_capacity(count);

    for time in cron.iter_after(now).take(count) {
        let is_dst = time.offset().dst_offset() != Duration::zero();
        let timezone_abbr = time.format("%Z").to_string();
        let time_str = time.format("%Y-%m-%d %H:%M:%S").to_string();
        let timestamp_ms = time.timestamp_millis();

        results.push(CronRunItem {
            time_str,
            timestamp_ms,
            is_dst,
            timezone_abbr,
        });
    }

    Ok(results)
}
