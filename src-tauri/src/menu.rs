use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Runtime,
};

/// Build the application menu.
///
/// Menu event IDs used by the on_menu_event handler in lib.rs:
///   "open"               — File → Open…
///   "save"               — File → Save
///   "save-as"            — File → Save As…
///   "close"              — File → Close
///   "print"              — File → Print…
///   "undo"               — Edit → Undo
///   "redo"               — Edit → Redo
///   "select-all"         — Edit → Select All
///   "find"               — Edit → Find
///   "rotate-cw"          — Document → Rotation → Rotate Page Clockwise
///   "rotate-cw-all"      — Document → Rotation → Rotate All Pages Clockwise
///   "rotate-ccw"         — Document → Rotation → Rotate Page Counter-Clockwise
///   "rotate-ccw-all"     — Document → Rotation → Rotate All Pages Counter-Clockwise
///   "split"              — Document → Split Document…
///   "merge"              — Document → Merge Document…
///   "import-pages"       — Document → Import Pages…
///   "display-continuous" — View → Page Display → Continuous Scroll
///   "display-single"     — View → Page Display → Single Page
///   "display-spread"     — View → Page Display → Two-Page Spread
///   "zoom-in"            — View → Zoom In
///   "zoom-out"           — View → Zoom Out
///   "zoom-fit-width"     — View → Fit Width
///   "theme-system"       — View → Appearance → System
///   "theme-light"        — View → Appearance → Light
///   "theme-dark"         — View → Appearance → Dark
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    // ── App menu (macOS: first submenu becomes the app-name menu) ──────────
    let about = PredefinedMenuItem::about(app, Some("About Collate"), None)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit_app = PredefinedMenuItem::quit(app, Some("Quit Collate"))?;
    let app_menu = Submenu::with_items(app, "Collate", true, &[&about, &sep, &quit_app])?;

    // ── File ───────────────────────────────────────────────────────────────
    let open    = MenuItem::with_id(app, "open",    "Open…",    true,  Some("CmdOrCtrl+O"))?;
    let save    = MenuItem::with_id(app, "save",    "Save",     false, Some("CmdOrCtrl+S"))?;
    let save_as = MenuItem::with_id(app, "save-as", "Save As…", false, Some("Shift+CmdOrCtrl+S"))?;
    let close   = MenuItem::with_id(app, "close",   "Close",    false, Some("CmdOrCtrl+W"))?;
    let print   = MenuItem::with_id(app, "print",   "Print…",   false, Some("CmdOrCtrl+P"))?;
    let sep_file  = PredefinedMenuItem::separator(app)?;
    let quit_file = PredefinedMenuItem::quit(app, None)?;
    let file_menu = Submenu::with_items(
        app, "File", true,
        &[&open, &save, &save_as, &close, &print, &sep_file, &quit_file],
    )?;

    // ── Edit ───────────────────────────────────────────────────────────────
    let undo       = MenuItem::with_id(app, "undo",       "Undo",       false, Some("CmdOrCtrl+Z"))?;
    let redo       = MenuItem::with_id(app, "redo",       "Redo",       false, Some("Shift+CmdOrCtrl+Z"))?;
    let sep_edit1  = PredefinedMenuItem::separator(app)?;
    let select_all = MenuItem::with_id(app, "select-all", "Select All", false, Some("CmdOrCtrl+A"))?;
    let sep_edit2  = PredefinedMenuItem::separator(app)?;
    let find       = MenuItem::with_id(app, "find",       "Find…",      false, Some("CmdOrCtrl+F"))?;
    let edit_menu  = Submenu::with_items(
        app, "Edit", true,
        &[&undo, &redo, &sep_edit1, &select_all, &sep_edit2, &find],
    )?;

    // ── Document → Rotation ────────────────────────────────────────────────
    let rotate_cw      = MenuItem::with_id(app, "rotate-cw",      "Rotate Page Clockwise",              false, Some("CmdOrCtrl+]"))?;
    let rotate_ccw     = MenuItem::with_id(app, "rotate-ccw",     "Rotate Page Counter-Clockwise",      false, Some("CmdOrCtrl+["))?;
    let sep_rot        = PredefinedMenuItem::separator(app)?;
    let rotate_cw_all  = MenuItem::with_id(app, "rotate-cw-all",  "Rotate All Pages Clockwise",         false, None::<&str>)?;
    let rotate_ccw_all = MenuItem::with_id(app, "rotate-ccw-all", "Rotate All Pages Counter-Clockwise", false, None::<&str>)?;
    let rotation_menu  = Submenu::with_items(
        app, "Rotation", true,
        &[&rotate_cw, &rotate_ccw, &sep_rot, &rotate_cw_all, &rotate_ccw_all],
    )?;

    // ── Document ───────────────────────────────────────────────────────────
    let sep_doc1     = PredefinedMenuItem::separator(app)?;
    let split        = MenuItem::with_id(app, "split",        "Split Document…", false, None::<&str>)?;
    let sep_doc2     = PredefinedMenuItem::separator(app)?;
    let merge        = MenuItem::with_id(app, "merge",        "Merge Document…", false, None::<&str>)?;
    let import_pages = MenuItem::with_id(app, "import-pages", "Import Pages…",   false, None::<&str>)?;
    let document_menu = Submenu::with_items(
        app,
        "Document",
        true,
        &[
            &rotation_menu,
            &sep_doc1,
            &split,
            &sep_doc2,
            &merge, &import_pages,
        ],
    )?;

    // ── View → Page Display ────────────────────────────────────────────────
    let display_continuous = CheckMenuItem::with_id(app, "display-continuous", "Continuous Scroll", false, true,  None::<&str>)?;
    let display_single     = CheckMenuItem::with_id(app, "display-single",     "Single Page",       false, false, None::<&str>)?;
    let display_spread     = CheckMenuItem::with_id(app, "display-spread",     "Two-Page Spread",   false, false, None::<&str>)?;
    let display_menu       = Submenu::with_items(app, "Page Display", true, &[&display_continuous, &display_single, &display_spread])?;
    let sep_display        = PredefinedMenuItem::separator(app)?;

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
    let view_menu    = Submenu::with_items(
        app,
        "View",
        true,
        &[&display_menu, &sep_display, &zoom_menu, &sep_zoom, &appearance],
    )?;

    // ── Help (required by macOS HIG) ───────────────────────────────────────
    let report_bug = MenuItem::with_id(app, "report-bug", "Report a Bug…", true, None::<&str>)?;
    let help_menu = Submenu::with_items(app, "Help", true, &[&report_bug])?;

    Menu::with_items(app, &[&app_menu, &file_menu, &edit_menu, &document_menu, &view_menu, &help_menu])
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
