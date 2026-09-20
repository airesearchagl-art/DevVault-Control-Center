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
//!
//! The gate fails closed (P1-1): a process that does not own the mutex — the wait timed out, the
//! mutex could not be created, or the wait returned anything unexpected — never builds the app.
//! [`with_startup_gate`] runs the build only for `Owned` / `OwnedAfterAbandon`, and the build
//! receives a [`StartupGate`] token that no other code can create.

use std::time::Duration;

/// Session-wide start-up mutex name shared by all DVCC builds for this app identifier.
pub const STARTUP_MUTEX_NAME: &str = "Local\\com.devvault.controlcenter.startup";

/// Upper bound for waiting on another process's start-up. Building the app normally takes well
/// under a second; after the timeout the process exits without building the app (fail closed).
pub const STARTUP_WAIT: Duration = Duration::from_secs(15);

/// Exit code of a process that did not obtain the start-up gate and therefore exited without
/// building the app (distinct from the plugin hand-over, which exits with 0).
pub const STARTUP_GATE_REFUSED_EXIT_CODE: i32 = 75;

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
    /// Not obtained: the wait timed out, the mutex could not be created, or the wait returned an
    /// unexpected result.
    NotOwned,
}

impl StartupLockState {
    /// Whether a process in this state may build the app. Only an owner of the gate may.
    pub fn permits_build(self) -> bool {
        match self {
            Self::Owned | Self::OwnedAfterAbandon => true,
            Self::NotOwned => false,
        }
    }
}

/// Proof that this thread owns the start-up gate. Only [`with_startup_gate`] creates it, so code
/// that requires it (the app build) cannot run in a process without the gate.
pub struct StartupGate(());

/// Acquires the start-up gate and runs `build` while holding it; the gate is released right after
/// `build` returns, on this thread. Without the gate (`NotOwned`) `build` is never called and the
/// state is returned as the error.
pub fn with_startup_gate<T>(
    name: &str,
    wait: Duration,
    build: impl FnOnce(&StartupGate) -> T,
) -> Result<T, StartupLockState> {
    run_gated(StartupLock::acquire(name, wait), build)
}

fn run_gated<T>(
    lock: StartupLock,
    build: impl FnOnce(&StartupGate) -> T,
) -> Result<T, StartupLockState> {
    if !lock.state.permits_build() {
        return Err(lock.state);
    }
    let built = build(&StartupGate(()));
    drop(lock);
    Ok(built)
}

/// Maps a `WaitForSingleObject` result: anything other than signalled or abandoned (timeout,
/// `WAIT_FAILED`, unknown values) is `NotOwned`.
#[cfg(windows)]
fn state_after_wait(result: u32) -> StartupLockState {
    match result {
        ffi::WAIT_OBJECT_0 => StartupLockState::Owned,
        ffi::WAIT_ABANDONED => StartupLockState::OwnedAfterAbandon,
        _ => StartupLockState::NotOwned,
    }
}

/// Start-up lock. Released when dropped, which must happen on the thread that acquired it.
struct StartupLock {
    #[cfg(windows)]
    handle: *mut std::ffi::c_void,
    state: StartupLockState,
}

impl StartupLock {
    #[cfg(windows)]
    fn acquire(name: &str, wait: Duration) -> Self {
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
            let state = state_after_wait(ffi::WaitForSingleObject(handle, millis));
            Self { handle, state }
        }
    }

    /// No start-up mutex exists on other platforms (v0.1 is Windows-only), so the gate is never
    /// owned there and the app is not built (fail closed).
    #[cfg(not(windows))]
    fn acquire(_name: &str, _wait: Duration) -> Self {
        Self {
            state: StartupLockState::NotOwned,
        }
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

#[cfg(test)]
mod contract_tests {
    use super::*;

    /// A lock in the given state that owns no OS handle.
    fn detached(state: StartupLockState) -> StartupLock {
        StartupLock {
            #[cfg(windows)]
            handle: std::ptr::null_mut(),
            state,
        }
    }

    /// The F-3 contract, stated independently of the implementation: only an owner of the start-up
    /// gate may build the app.
    const CONTRACT: [(StartupLockState, bool); 3] = [
        (StartupLockState::Owned, true),
        (StartupLockState::OwnedAfterAbandon, true),
        (StartupLockState::NotOwned, false),
    ];

    #[test]
    fn only_an_owner_of_the_start_up_gate_is_permitted_to_build() {
        for (state, permitted) in CONTRACT {
            assert_eq!(state.permits_build(), permitted, "{state:?}");
        }
    }

    #[test]
    fn the_build_runs_exactly_when_the_contract_permits_it() {
        for (state, permitted) in CONTRACT {
            let mut builds = 0;
            let result = run_gated(detached(state), |_gate| {
                builds += 1;
                "app"
            });
            if permitted {
                assert_eq!(builds, 1, "{state:?} must build the app once");
                assert_eq!(result, Ok("app"));
            } else {
                assert_eq!(builds, 0, "{state:?} must never reach the build");
                assert_eq!(result, Err(StartupLockState::NotOwned));
            }
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::thread;
    use std::time::Instant;

    #[link(name = "kernel32")]
    extern "system" {
        fn CreateEventW(
            attributes: *const std::ffi::c_void,
            manual_reset: i32,
            initial_state: i32,
            name: *const u16,
        ) -> *mut std::ffi::c_void;
    }

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

    /// Holds the named lock on its own thread until the returned sender is used or dropped.
    fn hold_on_another_thread(name: &str) -> (mpsc::Sender<()>, thread::JoinHandle<()>) {
        let (acquired_tx, acquired_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel::<()>();
        let holder_name = name.to_owned();
        let holder = thread::spawn(move || {
            let lock = StartupLock::acquire(&holder_name, Duration::from_secs(5));
            acquired_tx.send(lock.state).unwrap();
            let _ = release_rx.recv();
            drop(lock);
        });
        assert_eq!(acquired_rx.recv().unwrap(), StartupLockState::Owned);
        (release_tx, holder)
    }

    #[test]
    fn a_second_starter_waits_until_the_first_releases() {
        let name = unique_name();
        let (acquired_tx, acquired_rx) = mpsc::channel();
        let (release_tx, release_rx) = mpsc::channel::<()>();
        let holder_name = name.clone();
        let holder = thread::spawn(move || {
            let lock = StartupLock::acquire(&holder_name, Duration::from_secs(5));
            acquired_tx.send(lock.state).unwrap();
            release_rx.recv().unwrap();
            let releasing_at = Instant::now();
            drop(lock);
            releasing_at
        });
        assert_eq!(acquired_rx.recv().unwrap(), StartupLockState::Owned);

        let blocked_name = name.clone();
        let blocked = thread::spawn(move || {
            StartupLock::acquire(&blocked_name, Duration::from_millis(200)).state
        });
        assert_eq!(
            blocked.join().unwrap(),
            StartupLockState::NotOwned,
            "while the first starter holds the lock, a second one cannot pass"
        );

        let waiter_name = name.clone();
        let waiter = thread::spawn(move || {
            let lock = StartupLock::acquire(&waiter_name, Duration::from_secs(5));
            (lock.state, Instant::now())
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
    fn a_lock_left_by_an_ended_owner_is_taken_over_and_permits_the_build() {
        let name = unique_name();
        let holder_name = name.clone();
        // The owning thread ends without releasing (like a process that exits during start-up).
        thread::spawn(move || {
            std::mem::forget(StartupLock::acquire(&holder_name, Duration::from_secs(5)));
        })
        .join()
        .unwrap();
        let lock = StartupLock::acquire(&name, Duration::from_secs(5));
        assert_eq!(lock.state, StartupLockState::OwnedAfterAbandon);
        assert_eq!(run_gated(lock, |_gate| "app"), Ok("app"));
    }

    #[test]
    fn a_start_up_that_times_out_never_reaches_the_build() {
        let name = unique_name();
        let (release, holder) = hold_on_another_thread(&name);

        let started = Instant::now();
        let mut built = false;
        let result = with_startup_gate(&name, Duration::from_millis(200), |_gate| built = true);
        assert_eq!(result, Err(StartupLockState::NotOwned));
        assert!(!built, "a process without the gate must not build the app");
        assert!(started.elapsed() >= Duration::from_millis(200));

        release.send(()).unwrap();
        holder.join().unwrap();
    }

    #[test]
    fn a_mutex_that_cannot_be_created_never_reaches_the_build() {
        // A named event under the same name makes CreateMutexW fail (ERROR_INVALID_HANDLE).
        let name = unique_name();
        let wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        // SAFETY: `wide` is NUL-terminated and outlives the call; the handle is closed below.
        let event = unsafe { CreateEventW(std::ptr::null(), 1, 0, wide.as_ptr()) };
        assert!(!event.is_null());
        // SAFETY: same NUL-terminated name; the returned handle (expected null) is not used.
        assert!(unsafe { ffi::CreateMutexW(std::ptr::null(), 0, wide.as_ptr()) }.is_null());

        let started = Instant::now();
        let mut built = false;
        let result = with_startup_gate(&name, Duration::from_secs(5), |_gate| built = true);
        assert_eq!(result, Err(StartupLockState::NotOwned));
        assert!(!built, "a process without the gate must not build the app");
        assert!(
            started.elapsed() < Duration::from_secs(5),
            "a creation failure is refused at once"
        );

        // SAFETY: `event` came from CreateEventW above and is closed once.
        unsafe { ffi::CloseHandle(event) };
    }

    #[test]
    fn only_signalled_or_abandoned_waits_own_the_lock() {
        const WAIT_TIMEOUT: u32 = 0x0000_0102;
        const WAIT_FAILED: u32 = 0xFFFF_FFFF;
        assert_eq!(state_after_wait(0x0000_0000), StartupLockState::Owned);
        assert_eq!(
            state_after_wait(0x0000_0080),
            StartupLockState::OwnedAfterAbandon
        );
        for unexpected in [WAIT_TIMEOUT, WAIT_FAILED, 0x0000_0001, 0x0000_00C0] {
            assert_eq!(
                state_after_wait(unexpected),
                StartupLockState::NotOwned,
                "{unexpected:#x}"
            );
        }
    }

    #[test]
    fn the_gate_is_held_during_the_build_and_released_after_it() {
        let name = unique_name();
        let result = with_startup_gate(&name, Duration::from_secs(5), |_gate| {
            let contender = name.clone();
            thread::spawn(move || {
                StartupLock::acquire(&contender, Duration::from_millis(100)).state
            })
            .join()
            .unwrap()
        });
        assert_eq!(
            result,
            Ok(StartupLockState::NotOwned),
            "another starter cannot pass while the app is being built"
        );

        let after =
            thread::spawn(move || StartupLock::acquire(&name, Duration::from_millis(500)).state)
                .join()
                .unwrap();
        assert_eq!(
            after,
            StartupLockState::Owned,
            "released once the build returned"
        );
    }
}
