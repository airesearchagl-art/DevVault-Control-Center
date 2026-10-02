import { invokeCommand } from "./storage";

/**
 * Phase 4b-2b: the frontend's only path to starting a Codex process. Three dedicated Rust commands
 * — two read-only checks and the one launch — each taking only the configured executable path, the
 * full session ID and the Project root. There is no argument list, command string or environment
 * parameter anywhere, and the native side re-validates every value itself.
 */
export interface ResumePreflight {
  /** Show "Codex may ask which workspace to use." in the confirmation. */
  workspaceWarning: boolean;
}

export interface CodexLauncher {
  validateExecutable(path: string): Promise<void>;
  preflight(executablePath: string, sessionId: string, projectRoot: string): Promise<ResumePreflight>;
  launch(executablePath: string, sessionId: string, projectRoot: string, workspaceWarningAcknowledged: boolean): Promise<void>;
}

export const tauriCodexLauncher: CodexLauncher = {
  validateExecutable: (path) => invokeCommand<void>("validate_codex_executable_path", { path }),
  preflight: (executablePath, sessionId, projectRoot) =>
    invokeCommand<ResumePreflight>("preflight_codex_resume", { executablePath, sessionId, projectRoot }),
  launch: (executablePath, sessionId, projectRoot, workspaceWarningAcknowledged) =>
    invokeCommand<void>("launch_codex_resume", { executablePath, sessionId, projectRoot, workspaceWarningAcknowledged }),
};

/** Stable native refusal / failure codes (Task Packet §22). Anything else is shown as a launch failure. */
export const LAUNCH_ERROR_CODES = [
  "STALE_DISCOVERY",
  "NOT_MATCHED",
  "ARCHIVED",
  "INVALID_SESSION_ID",
  "NO_LOCAL_ROOT",
  "UNSAFE_PROJECT_ROOT",
  "CODEX_EXECUTABLE_NOT_CONFIGURED",
  "CODEX_EXECUTABLE_UNTRUSTED",
  "UNSUPPORTED_CODEX_LAUNCHER",
  "SESSION_NOT_FOUND",
  "CWD_MISMATCH",
  "INTERACTIVE_CONSOLE_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "PROCESS_LAUNCH_FAILED",
] as const;
export type LaunchErrorCode = (typeof LAUNCH_ERROR_CODES)[number];

export function launchErrorCode(error: unknown): LaunchErrorCode {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return (LAUNCH_ERROR_CODES as readonly unknown[]).includes(code) ? (code as LaunchErrorCode) : "PROCESS_LAUNCH_FAILED";
}
