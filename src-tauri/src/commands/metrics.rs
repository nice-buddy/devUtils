use std::sync::Mutex;

use serde::Serialize;
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMetrics {
    /// 相对单个 CPU 核心的占用百分比（多核机器上可能超过 100）。
    pub cpu_percent: f32,
    /// 常驻内存（RSS），单位字节。
    pub memory_bytes: u64,
}

struct MetricsInner {
    system: System,
    pid: Pid,
    primed: bool,
}

/// 进程指标采样器：`System` 需要跨调用保留，才能算出两次刷新之间的 CPU 增量。
pub struct MetricsState {
    inner: Mutex<MetricsInner>,
}

impl MetricsState {
    pub fn new() -> Self {
        let pid = sysinfo::get_current_pid()
            .unwrap_or_else(|_| Pid::from_u32(std::process::id()));
        Self {
            inner: Mutex::new(MetricsInner {
                system: System::new_with_specifics(
                    RefreshKind::nothing().with_processes(
                        ProcessRefreshKind::nothing().with_cpu().with_memory(),
                    ),
                ),
                pid,
                primed: false,
            }),
        }
    }

    pub fn sample(&self) -> Result<ProcessMetrics, String> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "进程指标状态不可用".to_string())?;
        let pid = inner.pid;
        refresh(&mut inner.system, pid);

        // 进程 CPU 占用是两次刷新之间的增量，首次采样必然为 0；
        // 这里补一次短间隔采样，避免界面首帧固定显示 0%。
        if !inner.primed {
            std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
            refresh(&mut inner.system, pid);
            inner.primed = true;
        }

        let process = inner
            .system
            .process(pid)
            .ok_or_else(|| "读取进程指标失败".to_string())?;
        Ok(ProcessMetrics {
            cpu_percent: process.cpu_usage(),
            memory_bytes: process.memory(),
        })
    }
}

impl Default for MetricsState {
    fn default() -> Self {
        Self::new()
    }
}

fn refresh(system: &mut System, pid: Pid) {
    system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
}

#[tauri::command]
pub fn get_process_metrics(state: tauri::State<'_, MetricsState>) -> Result<ProcessMetrics, String> {
    state.sample()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn samples_current_process() {
        let state = MetricsState::new();
        let first = state.sample().unwrap();
        assert!(first.memory_bytes > 0, "内存占用应为正数");
        assert!(first.cpu_percent >= 0.0, "CPU 占用不应为负");

        // 第二次采样走的是增量路径，同样要有有效数值。
        let second = state.sample().unwrap();
        assert!(second.memory_bytes > 0);
        assert!(second.cpu_percent >= 0.0);
    }
}
