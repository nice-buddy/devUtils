use devutils_lib::commands::cron::predict_cron_runs;

#[test]
fn test_predict_cron_runs_5_parts() {
    let pattern = "30 9 * * 1-5".to_string();
    let tz = "Asia/Shanghai".to_string();
    let result = predict_cron_runs(pattern, tz, 5);

    assert!(result.is_ok(), "Should successfully parse 5-part cron: {:?}", result.err());
    let runs = result.unwrap();
    assert_eq!(runs.len(), 5);

    for run in &runs {
        assert!(!run.time_str.is_empty());
        assert!(run.timestamp_ms > 0);
        assert!(!run.is_dst); // Asia/Shanghai does not observe DST
        assert_eq!(run.timezone_abbr, "CST");
    }
}

#[test]
fn test_predict_cron_runs_6_parts_with_seconds() {
    let pattern = "0 30 9 * * 1-5".to_string();
    let tz = "Asia/Shanghai".to_string();
    let result = predict_cron_runs(pattern, tz, 10);

    assert!(result.is_ok());
    let runs = result.unwrap();
    assert_eq!(runs.len(), 10);
}

#[test]
fn test_predict_cron_runs_dst_timezone() {
    // Every month at 02:00
    let pattern = "0 2 1 * *".to_string();
    let tz = "America/New_York".to_string();
    let result = predict_cron_runs(pattern, tz, 12);

    assert!(result.is_ok());
    let runs = result.unwrap();
    assert_eq!(runs.len(), 12);

    // America/New_York has DST in summer (EDT, is_dst=true) and standard time in winter (EST, is_dst=false)
    let has_dst = runs.iter().any(|r| r.is_dst);
    let has_standard = runs.iter().any(|r| !r.is_dst);
    assert!(has_dst, "Should have runs during daylight saving time (EDT)");
    assert!(has_standard, "Should have runs during standard time (EST)");
}

#[test]
fn test_predict_cron_runs_invalid_cron() {
    let pattern = "invalid cron pattern".to_string();
    let tz = "UTC".to_string();
    let result = predict_cron_runs(pattern, tz, 5);
    assert!(result.is_err());
}

#[test]
fn test_predict_cron_runs_invalid_timezone() {
    let pattern = "* * * * *".to_string();
    let tz = "Invalid/Timezone".to_string();
    let result = predict_cron_runs(pattern, tz, 5);
    assert!(result.is_err());
}
