//! Process start-up serialization for the single-instance guarantee (F-3 / E-1).
//!
//! `tauri-plugin-single-instance` hands a second launch over to the running instance, but only
//! if that instance has already created the plugin's mutex *and* its event window. When two
//! processes start at almost the same moment, the second can see the mutex without the window
//! and keep running. Tauri also creates the configured windows before the application's own setup
//! hook runs, so leaving that decision to the setup hook means a losing process has already
//! started a WebView2 window when it exits.
//!
//! The fix is to let DVCC processes pass the plugin's registration one at a time: every process
//! waits for the session-wide start-up mutex before building the app and releases it once the
//! build (which runs the plugin set-up) is complete. A later process therefore always finds a
//! fully registered instance and hands over to it inside the plugin set-up, before any window of
//! its own exists.

use std::time::Duration;

/// Session-wide start-up mutex name shared by all DVCC builds for this app identifier.
pub const STARTUP_MUTEX_NAME: &str = "Local\\com.devvault.controlcenter.startup";

/// Upper bound for waiting on another process's start-up. Building the app normally takes well
/// under a second; after the timeout the process continues and the data-folder lock remains the
/// last line of defence.
pub const STARTUP_WAIT: Duration = Duration::from_secs(15);

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
        pub fn WaitForSingleObject(handle: *mut c_void, milliseconds: u32) -> u32;
        pub fn ReleaseMutex(handle: *mut c_void) -> i32;
        pub fn CloseHandle(handle: *mut c_void) -> i32;
    }

    pub const WAIT_OBJECT_0: u32 = 0x0000_0000;
    pub const WAIT_ABANDONED: u32 = 0x0000_0080;
}

/// How the start-up lock was obtained.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StartupLockState {
    /// This thread owns the lock.
    Owned,
    /// A previous owner ended without releasing it (e.g. a process that handed over and exited);
    /// this thread owns it now.
    OwnedAfterAbandon,
    /// Not obtained within the wait bound (or the mutex could not be created).
    NotOwned,
}

/// Start-up lock. Released when dropped, which must happen on the thread that acquired it.
pub struct StartupLock {
    #[cfg(windows)]
    handle: *mut std::ffi::c_void,
    state: StartupLockState,
}

impl StartupLock {
    #[cfg(windows)]
    pub fn acquire(name: &str, wait: Duration) -> Self {
        let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        let millis = u32::try_from(wait.as_millis()).unwrap_or(u32::MAX - 1);
        // SAFETY: `wide` is a NUL-terminated UTF-16 string that outlives the call; a null security
        // descriptor and no initial ownership are valid arguments; the handle is checked for null
        // before it is waited on and is closed exactly once in `drop`.
        unsafe {
            let handle = ffi::CreateMutexW(std::ptr::null(), 0, wide.as_ptr());
            if handle.is_null() {
                return Self {
                    handle,
                    state: StartupLockState::NotOwned,
                };
            }
            let state = match ffi::WaitForSingleObject(handle, millis) {
                ffi::WAIT_OBJECT_0 => StartupLockState::Owned,
                ffi::WAIT_ABANDONED => StartupLockState::OwnedAfterAbandon,
                _ => StartupLockState::NotOwned,
            };
            Self { handle, state }
        }
    }

    #[cfg(not(windows))]
    pub fn acquire(_name: &str, _wait: Duration) -> Self {
        Self {
            state: StartupLockState::NotOwned,
        }
    }

    #[cfg(test)]
    pub fn state(&self) -> StartupLockState {
        self.state
    }
}

impl Drop for StartupLock {
    fn drop(&mut self) {
        #[cfg(windows)]
        // SAFETY: the handle came from CreateMutexW in `acquire`; it is released only when this
        // thread owns it, and closed once.
        unsafe {
            if self.handle.is_null() {
                return;
            }
            if self.state != StartupLockState::NotOwned {
                ffi::ReleaseMutex(self.handle);
            }
            ffi::CloseHandle(self.handle);
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::thread;

    fn unique_name() -> String {
        format!(
            "Local\\dvcc-test-startup-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        )
    }

    #[test]
    fn a_second_starter_waits_until_the_first_releases() {
        let name = unique_name();
        let (acquired_tx, acquired_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel::<()>();
        let holder_name = name.clone();
        let holder = thread::spawn(move || {
            let lock = StartupLock::acquire(&holder_name, Duration::from_secs(5));
            acquired_tx.send(lock.state()).unwrap();
            release_rx.recv().unwrap();
            let releasing_at = std::time::Instant::now();
            drop(lock);
            releasing_at
        });
        assert_eq!(acquired_rx.recv().unwrap(), StartupLockState::Owned);

        let blocked_name = name.clone();
        let blocked = thread::spawn(move || {
            StartupLock::acquire(&blocked_name, Duration::from_millis(200)).state()
        });
        assert_eq!(
            blocked.join().unwrap(),
            StartupLockState::NotOwned,
            "while the first starter holds the lock, a second one cannot pass"
        );

        let waiter_name = name.clone();
        let waiter = thread::spawn(move || {
            let lock = StartupLock::acquire(&waiter_name, Duration::from_secs(5));
            (lock.state(), std::time::Instant::now())
        });
        thread::sleep(Duration::from_millis(300));
        release_tx.send(()).unwrap();
        let releasing_at = holder.join().unwrap();
        let (state, passed_at) = waiter.join().unwrap();
        assert_eq!(state, StartupLockState::Owned);
        assert!(
            passed_at >= releasing_at,
            "the second starter passed only after the first released"
        );
    }

    #[test]
    fn a_lock_left_by_an_ended_owner_is_taken_over() {
        let name = unique_name();
        let holder_name = name.clone();
        // The owning thread ends without releasing (like a process that exits during start-up).
        thread::spawn(move || {
            std::mem::forget(StartupLock::acquire(&holder_name, Duration::from_secs(5)));
        })
        .join()
        .unwrap();
        let lock = StartupLock::acquire(&name, Duration::from_secs(5));
        assert_eq!(lock.state(), StartupLockState::OwnedAfterAbandon);
    }
}
