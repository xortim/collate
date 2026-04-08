use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Runtime,
};

/// Build the application menu.
///
/// Menu event IDs used by the on_menu_event handler in lib.rs:
///   "open"         — File → Open…
///   "theme-system" — View → Appearance → System
///   "theme-light"  — View → Appearance → Light
///   "theme-dark"   — View → Appearance → Dark
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // ── App menu (macOS: first submenu becomes the app-name menu) ──────────
    let about = PredefinedMenuItem::about(app, Some("About Collate"), None)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_app = PredefinedMenuItem::quit(app, Some("Quit Collate"))?;
    let app_menu = Submenu::with_items(app, "Collate", true, &[&about, &sep, &quit_app])?;

    // ── File ───────────────────────────────────────────────────────────────
    let open = MenuItem::with_id(app, "open", "Open…", true, Some("CmdOrCtrl+O"))?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit_file = PredefinedMenuItem::quit(app, None)?;
    let file_menu = Submenu::with_items(app, "File", true, &[&open, &sep2, &quit_file])?;

    // ── View → Appearance ─────────────────────────────────────────────────
    let theme_system = CheckMenuItem::with_id(app, "theme-system", "System", true, true,  None::<&str>)?;
    let theme_light  = CheckMenuItem::with_id(app, "theme-light",  "Light",  true, false, None::<&str>)?;
    let theme_dark   = CheckMenuItem::with_id(app, "theme-dark",   "Dark",   true, false, None::<&str>)?;
    let appearance =
        Submenu::with_items(app, "Appearance", true, &[&theme_system, &theme_light, &theme_dark])?;
    let view_menu = Submenu::with_items(app, "View", true, &[&appearance])?;

    // ── Help (required by macOS HIG) ───────────────────────────────────────
    let help_menu = Submenu::with_items(app, "Help", true, &[])?;

    Menu::with_items(app, &[&app_menu, &file_menu, &view_menu, &help_menu])
}

#[cfg(test)]
mod tests {
    use super::*;

    // Smoke test: menu builder doesn't panic when called in a real Tauri context.
    // Full integration tested manually via `cargo tauri dev`.
    //
    // Unit-testing Tauri menus requires an AppHandle, which needs a running
    // event loop — not feasible in pure unit tests. The build_menu function is
    // thin wiring; correctness is verified at runtime.
    #[test]
    fn build_menu_fn_exists() {
        // Verify the function signature compiles with the expected generic bound.
        // The function itself is not called here (no AppHandle available).
        let _: fn(&AppHandle<tauri::Wry>) -> tauri::Result<Menu<tauri::Wry>> = build_menu;
    }
}
