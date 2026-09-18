import { writeText } from "@tauri-apps/plugin-clipboard-manager";

/**
 * Write-only clipboard access (capability `clipboard-manager:allow-write-text`).
 * DVCC never reads the clipboard; review results are pasted by the Human into a textarea.
 */
export async function copyText(text: string): Promise<void> {
  await writeText(text);
}
