//! Process-level single instance guard (F-3 / E-1).
//!
//! `tauri-plugin-single-instance` hands a second launch over to the running window, but when two
//! processes start at almost the same moment the second one can find the plugin's mutex without a
//! window yet and keep running. This guard closes that race: every DVCC process creates the same
//! session-wide named mutex first, and only the process that created it may continue.

/// Session-wide mutex name shared by all DVCC builds for this app identifier.
pub const INSTANCE_MUTEX_NAME: &str = "Local\\com.devvault.controlcenter.instance";

#[cfg(windows)]
mod ffi {
    use std::ffi::c_void;

    #[link(name = "kernel32")]
    extern "system" {
        pub fn CreateMutexW(
            attributes: *const c_void,
            initial_owner: i32,
            name: *const u16,
        ) -> *mut c_void;
        pub fn GetLastError() -> u32;
    }

    pub const ERROR_ALREADY_EXISTS: u32 = 183;
}

/// Creates (or opens) the named mutex and keeps the handle for the rest of the process, so the
/// operating system releases it only when this process exits. Returns `true` when another
/// process had already created it.
#[cfg(windows)]
pub fn another_instance_running(name: &str) -> bool {
    let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY: `wide` is a NUL-terminated UTF-16 string that outlives the call; a null security
    // descriptor and no initial ownership are valid arguments. GetLastError is read immediately.
    let (handle, last_error) = unsafe {
        let handle = ffi::CreateMutexW(std::ptr::null(), 0, wide.as_ptr());
        (handle, ffi::GetLastError())
    };
    // The handle is intentionally never closed (released by the OS on process exit).
    !handle.is_null() && last_error == ffi::ERROR_ALREADY_EXISTS
}

#[cfg(not(windows))]
pub fn another_instance_running(_name: &str) -> bool {
    false
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn second_creation_of_the_same_mutex_reports_a_running_instance() {
        let name = format!(
            "Local\\dvcc-test-instance-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        assert!(
            !another_instance_running(&name),
            "first creator owns the name"
        );
        assert!(
            another_instance_running(&name),
            "any later creator sees the running instance"
        );
    }
}
