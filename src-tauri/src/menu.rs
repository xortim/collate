use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Runtime,
};

/// Build the application menu.
///
/// Menu event IDs used by the on_menu_event handler in lib.rs:
///   "open"           — File → Open…
///   "print"          — File → Print…
///   "undo"           — Edit → Undo
///   "redo"           — Edit → Redo
///   "find"           — Edit → Find
///   "zoom-in"        — View → Zoom In
///   "zoom-out"       — View → Zoom Out
///   "zoom-fit-width" — View → Fit Width
///   "theme-system"   — View → Appearance → System
///   "theme-light"    — View → Appearance → Light
///   "theme-dark"     — View → Appearance → Dark
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // ── App menu (macOS: first submenu becomes the app-name menu) ──────────
    let about = PredefinedMenuItem::about(app, Some("About Collate"), None)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_app = PredefinedMenuItem::quit(app, Some("Quit Collate"))?;
    let app_menu = Submenu::with_items(app, "Collate", true, &[&about, &sep, &quit_app])?;

    // ── File ───────────────────────────────────────────────────────────────
    let open  = MenuItem::with_id(app, "open",  "Open…",  true, Some("CmdOrCtrl+O"))?;
    let print = MenuItem::with_id(app, "print", "Print…", false, Some("CmdOrCtrl+P"))?;
    let sep_file = PredefinedMenuItem::separator(app)?;
    let quit_file = PredefinedMenuItem::quit(app, None)?;
    let file_menu =
        Submenu::with_items(app, "File", true, &[&open, &print, &sep_file, &quit_file])?;

    // ── Edit ───────────────────────────────────────────────────────────────
    let undo = MenuItem::with_id(app, "undo", "Undo", false, Some("CmdOrCtrl+Z"))?;
    let redo = MenuItem::with_id(app, "redo", "Redo", false, Some("Shift+CmdOrCtrl+Z"))?;
    let sep_edit = PredefinedMenuItem::separator(app)?;
    let find = MenuItem::with_id(app, "find", "Find…", false, Some("CmdOrCtrl+F"))?;
    let edit_menu =
        Submenu::with_items(app, "Edit", true, &[&undo, &redo, &sep_edit, &find])?;

    // ── View → Zoom ────────────────────────────────────────────────────────
    let zoom_in   = MenuItem::with_id(app, "zoom-in",       "Zoom In",   false, Some("CmdOrCtrl+="))?;
    let zoom_out  = MenuItem::with_id(app, "zoom-out",      "Zoom Out",  false, Some("CmdOrCtrl+-"))?;
    let zoom_fit  = MenuItem::with_id(app, "zoom-fit-width","Fit Width", false, Some("CmdOrCtrl+0"))?;
    let zoom_menu = Submenu::with_items(app, "Zoom", true, &[&zoom_in, &zoom_out, &zoom_fit])?;
    let sep_zoom  = PredefinedMenuItem::separator(app)?;

    // ── View → Appearance ─────────────────────────────────────────────────
    let theme_system = CheckMenuItem::with_id(app, "theme-system", "System", true, true,  None::<&str>)?;
    let theme_light  = CheckMenuItem::with_id(app, "theme-light",  "Light",  true, false, None::<&str>)?;
    let theme_dark   = CheckMenuItem::with_id(app, "theme-dark",   "Dark",   true, false, None::<&str>)?;
    let appearance   = Submenu::with_items(app, "Appearance", true, &[&theme_system, &theme_light, &theme_dark])?;
    let view_menu    = Submenu::with_items(app, "View", true, &[&zoom_menu, &sep_zoom, &appearance])?;

    // ── Help (required by macOS HIG) ───────────────────────────────────────
    let help_menu = Submenu::with_items(app, "Help", true, &[])?;

    Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &view_menu, &help_menu])
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
