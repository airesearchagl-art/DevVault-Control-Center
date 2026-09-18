import { invokeCommand } from "./storage";

/**
 * Launch requests go to validated Rust commands only. The webview holds no opener permission,
 * so these are the only ways the UI can open URLs or folders.
 */
export interface Launcher {
  openExternalUrl(url: string): Promise<void>;
  openProjectFolder(path: string): Promise<void>;
  openDataDir(): Promise<void>;
}

export const tauriLauncher: Launcher = {
  openExternalUrl: (url) => invokeCommand<void>("open_external_url", { url }),
  openProjectFolder: (path) => invokeCommand<void>("open_project_folder", { path }),
  openDataDir: () => invokeCommand<void>("open_data_dir"),
};
