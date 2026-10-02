//! Synthetic stand-in for `codex.exe` used only by DVCC's Phase 4b-2b tests and smoke
//! (LRP-20261002-DVCC-010). It contains no provider behavior: it records how it was started and
//! exits. Built on demand with `rustc` (it is not a Cargo target and never ships).
//!
//! Record: `<this exe's folder>/launch-record.txt`, `key=value` lines, written in one go and ending
//! with `end=1`: argc / argN, cwd, stdout_type (char|pipe|disk|unknown|none), console_process_count,
//! parent_pid, parent_image.

use std::ffi::c_void;
use std::fmt::Write as _;

#[link(name = "kernel32")]
extern "system" {
    fn GetStdHandle(which: u32) -> *mut c_void;
    fn GetFileType(handle: *mut c_void) -> u32;
    fn GetConsoleProcessList(list: *mut u32, count: u32) -> u32;
    fn CreateToolhelp32Snapshot(flags: u32, pid: u32) -> *mut c_void;
    fn Process32FirstW(snapshot: *mut c_void, entry: *mut ProcessEntry) -> i32;
    fn Process32NextW(snapshot: *mut c_void, entry: *mut ProcessEntry) -> i32;
    fn CloseHandle(handle: *mut c_void) -> i32;
}

#[repr(C)]
struct ProcessEntry {
    size: u32,
    usage: u32,
    pid: u32,
    heap_id: usize,
    module_id: u32,
    threads: u32,
    parent_pid: u32,
    priority: i32,
    flags: u32,
    exe_file: [u16; 260],
}

fn stdout_type() -> &'static str {
    // SAFETY: plain Win32 queries on this process's own standard output handle.
    unsafe {
        let handle = GetStdHandle(-11i32 as u32);
        if handle.is_null() || handle as isize == -1 {
            return "none";
        }
        match GetFileType(handle) {
            1 => "disk",
            2 => "char",
            3 => "pipe",
            _ => "unknown",
        }
    }
}

fn console_process_count() -> u32 {
    let mut list = [0u32; 16];
    // SAFETY: the buffer is valid for 16 entries.
    unsafe { GetConsoleProcessList(list.as_mut_ptr(), list.len() as u32) }
}

/// `(parent pid, parent image name)` from a Toolhelp snapshot of process metadata only.
fn parent() -> (u32, String) {
    let me = std::process::id();
    let mut entries: Vec<(u32, u32, String)> = Vec::new();
    // SAFETY: standard Toolhelp iteration; the entry size is set before each call.
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(0x2, 0);
        if snapshot.is_null() || snapshot as isize == -1 {
            return (0, String::new());
        }
        let mut entry: ProcessEntry = std::mem::zeroed();
        entry.size = std::mem::size_of::<ProcessEntry>() as u32;
        let mut ok = Process32FirstW(snapshot, &mut entry);
        while ok != 0 {
            let len = entry.exe_file.iter().position(|&c| c == 0).unwrap_or(260);
            entries.push((entry.pid, entry.parent_pid, String::from_utf16_lossy(&entry.exe_file[..len])));
            ok = Process32NextW(snapshot, &mut entry);
        }
        CloseHandle(snapshot);
    }
    let parent_pid = entries.iter().find(|(pid, _, _)| *pid == me).map(|(_, ppid, _)| *ppid).unwrap_or(0);
    let parent_image = entries.iter().find(|(pid, _, _)| *pid == parent_pid).map(|(_, _, name)| name.clone()).unwrap_or_default();
    (parent_pid, parent_image)
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut record = String::new();
    let _ = writeln!(record, "argc={}", args.len());
    for (index, arg) in args.iter().enumerate() {
        let _ = writeln!(record, "arg{}={}", index + 1, arg);
    }
    let cwd = std::env::current_dir().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
    let _ = writeln!(record, "cwd={}", cwd.strip_prefix(r"\\?\").unwrap_or(&cwd));
    let _ = writeln!(record, "stdout_type={}", stdout_type());
    let _ = writeln!(record, "console_process_count={}", console_process_count());
    let (parent_pid, parent_image) = parent();
    let _ = writeln!(record, "parent_pid={parent_pid}");
    let _ = writeln!(record, "parent_image={parent_image}");
    let _ = writeln!(record, "end=1");
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::fs::write(exe.with_file_name("launch-record.txt"), record);
        // Smoke-only lifetime probe: when `linger-ms.txt` sits next to the fixture, wait that long
        // and then write `survived.txt`, so a run can show the child outlives a killed DVCC.
        if let Some(ms) = std::fs::read_to_string(exe.with_file_name("linger-ms.txt")).ok().and_then(|s| s.trim().parse::<u64>().ok()) {
            std::thread::sleep(std::time::Duration::from_millis(ms.min(30_000)));
            let _ = std::fs::write(exe.with_file_name("survived.txt"), "survived=1\n");
        }
    }
}
