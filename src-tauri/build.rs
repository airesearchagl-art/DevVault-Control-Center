fn main() {
    // Default tauri-build manifest (asInvoker). DVCC runs with normal user privileges and
    // intentionally embeds no custom Windows manifest.
    tauri_build::build()
}
