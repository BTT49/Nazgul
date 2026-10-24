#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::process::Command;
use std::time::Instant;

#[derive(Serialize)]
struct RunResult {
    stdout: String,
    stderr: String,
    code: Option<i32>,
    ms: u128,
}

/// wsl.exe prints its own messages as UTF-16LE; normal program output is UTF-8.
fn decode(bytes: &[u8]) -> String {
    let zeros_at_odd = bytes.iter().skip(1).step_by(2).filter(|b| **b == 0).count();
    if bytes.len() >= 4 && zeros_at_odd > bytes.len() / 4 {
        let u16s: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16_lossy(&u16s);
    }
    String::from_utf8_lossy(bytes).to_string()
}

fn clean(s: Option<String>) -> Option<String> {
    s.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

/// Runs a command string through a shell and returns its output.
/// shell: "default" (cmd on Windows, sh elsewhere) or "wsl" (bash inside WSL, Windows only).
#[tauri::command]
async fn run_command(
    command: String,
    cwd: Option<String>,
    shell: Option<String>,
    distro: Option<String>,
) -> Result<RunResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let start = Instant::now();
        let cwd = clean(cwd);
        let distro = clean(distro);
        let use_wsl = shell.as_deref() == Some("wsl");

        let mut cmd = if use_wsl {
            if !cfg!(target_os = "windows") {
                return Err("WSL is only available on Windows.".to_string());
            }
            let mut c = Command::new("wsl.exe");
            if let Some(d) = &distro {
                c.args(["-d", d]);
            }
            if let Some(dir) = &cwd {
                c.args(["--cd", dir]);
            }
            c.args(["-e", "bash", "-lc", &command]);
            c
        } else {
            let mut c = if cfg!(target_os = "windows") {
                let mut c = Command::new("cmd");
                c.args(["/C", &command]);
                c
            } else {
                let mut c = Command::new("sh");
                c.args(["-c", &command]);
                c
            };
            if let Some(dir) = &cwd {
                c.current_dir(dir);
            }
            c
        };

        let out = cmd
            .output()
            .map_err(|e| format!("Could not start command: {e}"))?;

        Ok(RunResult {
            stdout: decode(&out.stdout),
            stderr: decode(&out.stderr),
            code: out.status.code(),
            ms: start.elapsed().as_millis(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![run_command])
        .run(tauri::generate_context!())
        .expect("error while running CmdDeck");
}
