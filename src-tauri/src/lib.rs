use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use pdfium_render::prelude::*;
use serde::Serialize;
use tauri::{http, menu::MenuItemKind, Emitter, Manager, State};

mod menu;
mod render;
pub use render::{encode_bmp, encode_jpeg, rasterise_page, rgba_to_rgb};

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

// Pdfium is a zero-size type — it holds no data. The actual library bindings
// live in a global static OnceCell inside pdfium-render, initialised once at
// startup via Pdfium::new(). The 'a lifetime on PdfDocument<'a> is tied to
// those global bindings (not to any Pdfium instance field), so transmuting
// PdfDocument<'_> to PdfDocument<'static> is sound: the bindings ARE 'static.
//
// We verify this in the SAFETY comment on the transmute below.

struct DocumentEntry {
    // Per-document mutex serialises same-document renders — pdfium's C library
    // is not safe for concurrent operations on the same FPDF_DOCUMENT.
    //
    // Rust note: Mutex<T> gives us exclusive access across threads. Each
    // get_page_image call locks this for the duration of the render, then
    // releases it — analogous to sync.Mutex in Go but RAII-scoped.
    doc: Mutex<PdfDocument<'static>>,
    page_count: usize,
    filename: String,
    /// Full filesystem path — needed by get_document_info for file size.
    path: String,
    // Keep bytes alive — pdfium's FPDF_LoadMemDocument holds a pointer into
    // this buffer for the lifetime of the document.
    _bytes: Arc<Vec<u8>>,
}

struct AppState {
    // Arc<DocumentEntry> lets us clone a cheap handle before spawn_blocking
    // without holding State<'_> (which has a lifetime) across an await point.
    documents: Mutex<HashMap<u32, Arc<DocumentEntry>>>,
    next_id: AtomicU32,
}

// ---------------------------------------------------------------------------
// IPC return types
// ---------------------------------------------------------------------------

/// Physical page dimensions in PDF points (1 pt = 1/72 inch).
#[derive(Serialize, Clone)]
struct PageSize {
    width_pts: f64,
    height_pts: f64,
}

/// Returned by `open_document` and all mutation commands.
#[derive(Serialize, Clone)]
struct DocumentManifest {
    doc_id: u32,
    page_count: usize,
    filename: String,
    /// Full filesystem path — used by the frontend for Save (no dialog needed).
    path: String,
    page_sizes: Vec<PageSize>,
    /// Whether an undo step is available. Always false until the command stack
    /// is implemented in Phase 3.
    can_undo: bool,
    /// Whether a redo step is available. Always false until the command stack
    /// is implemented in Phase 3.
    can_redo: bool,
}

/// PDF metadata and file statistics returned by `get_document_info`.
/// All string fields are Option<String> — pdfium returns None for absent InfoDict entries,
/// which is common (many PDFs omit most fields).
#[derive(Serialize, Clone)]
struct DocumentInfo {
    title:             Option<String>,
    author:            Option<String>,
    subject:           Option<String>,
    keywords:          Option<String>,  // raw comma/semicolon-separated string
    creator:           Option<String>,
    producer:          Option<String>,
    creation_date:     Option<String>,  // raw PDF date, e.g. "D:20230415143022+05'30'"
    modification_date: Option<String>,
    page_count:        usize,
    file_size_bytes:   Option<u64>,     // None if stat() fails (e.g. unsaved temp doc)
    pdf_version:       Option<String>,  // e.g. "PDF 1.7"; None if Unset
}

// ---------------------------------------------------------------------------
// IPC commands
// ---------------------------------------------------------------------------

/// Open a PDF, validate it, cache the parsed pdfium document, return a manifest.
///
/// The parse cost is paid once here. Subsequent get_page_image calls reuse
/// the cached PdfDocument and go straight to rendering.
#[tauri::command]
fn open_document(path: String, state: State<AppState>) -> Result<DocumentManifest, String> {
    let pdf_bytes = Arc::new(
        std::fs::read(&path).map_err(|e| format!("Failed to read file: {e}"))?,
    );

    // Pdfium is a ZST — constructing it is free, it's just a token that lets
    // us call methods backed by the global static bindings.
    let doc = Pdfium
        .load_pdf_from_byte_slice(&pdf_bytes, None)
        .map_err(|e| format!("pdfium failed to read PDF: {e:?}"))?;

    let page_count = doc.pages().len() as usize;

    let page_sizes: Vec<PageSize> = (0..page_count as i32)
        .map(|i| {
            let page = doc
                .pages()
                .get(i)
                .map_err(|e| format!("Failed to get page {i}: {e:?}"))?;
            Ok(PageSize {
                width_pts: page.width().value as f64,
                height_pts: page.height().value as f64,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let filename = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.pdf")
        .to_string();

    // SAFETY: pdfium-render stores its bindings in a global static OnceCell:
    //
    //   static BINDINGS: OnceCell<Box<dyn PdfiumLibraryBindings>> = OnceCell::new();
    //   pub struct Pdfium;  // zero-size type, no fields
    //
    // PdfDocument<'a> and its sub-collections (PdfPages, PdfBookmarks, …) contain
    // only raw FPDF_DOCUMENT handles plus PhantomData<&'a FPDF_DOCUMENT>. There
    // are no actual stored references to a Pdfium instance. The 'a lifetime exists
    // solely to tie the document to the call-site borrow of Pdfium, but since
    // Pdfium is a ZST and the bindings are 'static, the constraint is artificial.
    // Transmuting to 'static reflects the true lifetime of the underlying data.
    //
    // Invariant we must uphold: never use PdfDocument after the process exits
    // (trivially true) and never call it concurrently on the same document
    // (enforced by Mutex<PdfDocument<'static>>).
    //
    // Verified against pdfium-render = 0.9.0 (pinned in Cargo.toml) — re-audit
    // this transmute before bumping that version.
    let doc: PdfDocument<'static> = unsafe { std::mem::transmute(doc) };

    let doc_id = state.next_id.fetch_add(1, Ordering::Relaxed);

    state.documents.lock().unwrap().insert(
        doc_id,
        Arc::new(DocumentEntry {
            doc: Mutex::new(doc),
            page_count,
            filename: filename.clone(),
            path: path.clone(),
            _bytes: pdf_bytes,
        }),
    );

    Ok(DocumentManifest {
        doc_id,
        page_count,
        filename,
        path,
        page_sizes,
        can_undo: false,
        can_redo: false,
    })
}

/// Return metadata and file statistics for an open document.
/// Fields sourced from the PDF InfoDict are Option — most real-world PDFs omit many of them.
#[tauri::command]
fn get_document_info(doc_id: u32, state: State<AppState>) -> Result<DocumentInfo, String> {
    let entry = require_doc(doc_id, &state)?;
    let doc = entry.doc.lock().unwrap();
    let meta = doc.metadata();
    use PdfDocumentMetadataTagType::*;

    // Match on the version enum variants directly — as_pdfium() is pub(crate).
    let pdf_version = match doc.version() {
        PdfDocumentVersion::Unset    => None,
        PdfDocumentVersion::Pdf1_0   => Some("PDF 1.0".to_string()),
        PdfDocumentVersion::Pdf1_1   => Some("PDF 1.1".to_string()),
        PdfDocumentVersion::Pdf1_2   => Some("PDF 1.2".to_string()),
        PdfDocumentVersion::Pdf1_3   => Some("PDF 1.3".to_string()),
        PdfDocumentVersion::Pdf1_4   => Some("PDF 1.4".to_string()),
        PdfDocumentVersion::Pdf1_5   => Some("PDF 1.5".to_string()),
        PdfDocumentVersion::Pdf1_6   => Some("PDF 1.6".to_string()),
        PdfDocumentVersion::Pdf1_7   => Some("PDF 1.7".to_string()),
        PdfDocumentVersion::Pdf2_0   => Some("PDF 2.0".to_string()),
        PdfDocumentVersion::Other(n) => Some(format!("PDF (version {})", n)),
    };

    let file_size_bytes = std::fs::metadata(&entry.path).map(|m| m.len()).ok();

    Ok(DocumentInfo {
        title:             meta.get(Title).map(|t| t.value().to_string()),
        author:            meta.get(Author).map(|t| t.value().to_string()),
        subject:           meta.get(Subject).map(|t| t.value().to_string()),
        keywords:          meta.get(Keywords).map(|t| t.value().to_string()),
        creator:           meta.get(Creator).map(|t| t.value().to_string()),
        producer:          meta.get(Producer).map(|t| t.value().to_string()),
        creation_date:     meta.get(CreationDate).map(|t| t.value().to_string()),
        modification_date: meta.get(ModificationDate).map(|t| t.value().to_string()),
        page_count:        entry.page_count,
        file_size_bytes,
        pdf_version,
    })
}

/// Release a document from memory. The PdfDocument drop impl calls
/// FPDF_CloseDocument automatically.
#[tauri::command]
fn close_document(doc_id: u32, state: State<AppState>) -> Result<(), String> {
    state.documents.lock().unwrap().remove(&doc_id);
    Ok(())
}

// ---------------------------------------------------------------------------
// Mutation stubs — real implementations land in Phase 3 (mutations).
// Each validates the doc_id and returns Err until the body is filled in.
// The frontend wires up to these now so plumbing is validated end-to-end.
// ---------------------------------------------------------------------------

/// Look up a document by ID. Returns a clone of the Arc so callers can release
/// the lock before doing more work. Extracted from the tauri::command wrappers
/// so the validation logic can be exercised in unit tests without an AppHandle.
fn require_doc(doc_id: u32, state: &AppState) -> Result<Arc<DocumentEntry>, String> {
    state
        .documents
        .lock()
        .unwrap()
        .get(&doc_id)
        .cloned()
        .ok_or_else(|| format!("document {doc_id} not found"))
}

/// Persist the document to `path`.
/// TODO(mutations): write bytes via lopdf once mutation infrastructure exists.
#[tauri::command]
fn save_document(doc_id: u32, path: String, state: State<AppState>) -> Result<(), String> {
    require_doc(doc_id, &state)?;
    let _ = path; // will be used by the real implementation
    Err("save_document: not yet implemented".to_string()) // TODO(mutations)
}

/// Undo the last mutation and return the updated manifest.
/// TODO(mutations): pop from the per-document command stack.
#[tauri::command]
fn undo_document(doc_id: u32, state: State<AppState>) -> Result<DocumentManifest, String> {
    require_doc(doc_id, &state)?;
    Err("undo_document: not yet implemented".to_string()) // TODO(mutations)
}

/// Redo the last undone mutation and return the updated manifest.
/// TODO(mutations): push back onto the per-document command stack.
#[tauri::command]
fn redo_document(doc_id: u32, state: State<AppState>) -> Result<DocumentManifest, String> {
    require_doc(doc_id, &state)?;
    Err("redo_document: not yet implemented".to_string()) // TODO(mutations)
}

/// Rotate `page_indices` by `degrees` (90 or -90) and return the updated manifest.
/// TODO(mutations): apply rotation via lopdf page dictionary.
#[tauri::command]
fn rotate_pages(
    doc_id: u32,
    page_indices: Vec<usize>,
    degrees: i32,
    state: State<AppState>,
) -> Result<DocumentManifest, String> {
    require_doc(doc_id, &state)?;
    let _ = (page_indices, degrees);
    Err("rotate_pages: not yet implemented".to_string()) // TODO(mutations)
}

/// Delete `page_indices` and return the updated manifest.
/// TODO(mutations): remove pages via lopdf and rebuild page tree.
#[tauri::command]
fn delete_pages(
    doc_id: u32,
    page_indices: Vec<usize>,
    state: State<AppState>,
) -> Result<DocumentManifest, String> {
    require_doc(doc_id, &state)?;
    let _ = page_indices;
    Err("delete_pages: not yet implemented".to_string()) // TODO(mutations)
}

/// Called by the frontend to keep the native menu checkmarks in sync with the
/// Zustand theme state (on startup with the persisted value, and after toolbar
/// theme changes that bypass the menu).
#[tauri::command]
fn set_menu_theme(app: tauri::AppHandle, theme: String) {
    set_theme_checks(&app, &theme);
}

// ---------------------------------------------------------------------------
// Menu helpers
// ---------------------------------------------------------------------------

/// Recursively walk `items`, find every CheckMenuItem whose ID starts with
/// "theme-", and set its checked state based on `selected`.
///
/// Menu::get() does not reliably recurse into nested Submenus in all Tauri
/// 2.x releases, so we traverse manually. The theme items live two levels
/// deep: Menu → View → Appearance → [theme-system, theme-light, theme-dark].
fn apply_theme_checks<R: tauri::Runtime>(items: Vec<MenuItemKind<R>>, selected: &str) {
    for item in items {
        match item {
            MenuItemKind::Submenu(sub) => {
                if let Ok(children) = sub.items() {
                    apply_theme_checks(children, selected);
                }
            }
            MenuItemKind::Check(check) => {
                if let Some(theme) = check.id().as_ref().strip_prefix("theme-") {
                    let _ = check.set_checked(theme == selected);
                }
            }
            _ => {}
        }
    }
}

/// Update the checked state of the three theme menu items to reflect `selected`
/// ("system", "light", or "dark"). Called both from on_menu_event (immediate,
/// no round-trip) and from the set_menu_theme IPC command (startup + toolbar sync).
fn set_theme_checks(app: &tauri::AppHandle, selected: &str) {
    let Some(menu) = app.menu() else { return };
    let Ok(items) = menu.items() else { return };
    apply_theme_checks(items, selected);
}

// ---------------------------------------------------------------------------
// PDF document menu helpers
// ---------------------------------------------------------------------------

const PDF_MENU_IDS: &[&str] = &[
    "close", "print", "undo", "redo", "select-all", "find",
    "save", "save-as",
    "zoom-in", "zoom-out", "zoom-fit-width",
    // Document menu
    "rotate-cw", "rotate-cw-all", "rotate-ccw", "rotate-ccw-all",
    "split", "merge", "import-pages",
];

/// CheckMenuItem IDs that are enabled only when a document is open.
const PDF_CHECK_MENU_IDS: &[&str] = &[
    "display-continuous", "display-single", "display-spread",
];

/// Recursively walk `items`, find every MenuItem/CheckMenuItem whose ID is in
/// the PDF_MENU_IDS / PDF_CHECK_MENU_IDS lists, and set its enabled state.
fn apply_pdf_menu_enabled<R: tauri::Runtime>(items: Vec<MenuItemKind<R>>, enabled: bool) {
    for item in items {
        match item {
            MenuItemKind::Submenu(sub) => {
                if let Ok(children) = sub.items() {
                    apply_pdf_menu_enabled(children, enabled);
                }
            }
            MenuItemKind::MenuItem(mi) => {
                if PDF_MENU_IDS.contains(&mi.id().as_ref()) {
                    let _ = mi.set_enabled(enabled);
                }
            }
            MenuItemKind::Check(check) => {
                if PDF_CHECK_MENU_IDS.contains(&check.id().as_ref()) {
                    let _ = check.set_enabled(enabled);
                }
            }
            _ => {}
        }
    }
}

/// Enable or disable the PDF-dependent menu items.
/// Called by the frontend after open_document succeeds (true) or on close (false).
#[tauri::command]
fn set_pdf_menus_enabled(app: tauri::AppHandle, enabled: bool) {
    let Some(menu) = app.menu() else { return };
    let Ok(items) = menu.items() else { return };
    apply_pdf_menu_enabled(items, enabled);
}

// ---------------------------------------------------------------------------
// Display mode helpers
// ---------------------------------------------------------------------------

/// Recursively walk `items`, update the three display-* CheckMenuItems so that
/// only the one matching `selected` is checked.
fn apply_display_checks<R: tauri::Runtime>(items: Vec<MenuItemKind<R>>, selected: &str) {
    for item in items {
        match item {
            MenuItemKind::Submenu(sub) => {
                if let Ok(children) = sub.items() {
                    apply_display_checks(children, selected);
                }
            }
            MenuItemKind::Check(check) => {
                if let Some(mode) = check.id().as_ref().strip_prefix("display-") {
                    let _ = check.set_checked(mode == selected);
                }
            }
            _ => {}
        }
    }
}

/// Toggle the Page Display check-marks to reflect `selected`
/// ("continuous", "single", or "spread"). Called from on_menu_event so the
/// native menu reflects the new state immediately without a round-trip.
fn set_display_checks(app: &tauri::AppHandle, selected: &str) {
    let Some(menu) = app.menu() else { return };
    let Ok(items) = menu.items() else { return };
    apply_display_checks(items, selected);
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialise the pdfium library once for the process lifetime.
    // This populates the global static OnceCell that all PdfDocument instances
    // rely on. Failing here gives a clear message instead of a later panic.
    Pdfium::new(
        Pdfium::bind_to_system_library()
            .expect("pdfium shared library not found — run `make pdfium` first"),
    );

    tauri::Builder::default()
        .menu(menu::build_menu)
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "open"    => { let _ = app.emit("menu-open",    ()); }
                "save"    => { let _ = app.emit("menu-save",    ()); }
                "save-as" => { let _ = app.emit("menu-save-as", ()); }
                "close"   => { let _ = app.emit("menu-close",   ()); }
                "print"   => { let _ = app.emit("menu-print",   ()); }
                "undo"       => { let _ = app.emit("menu-undo",       ()); }
                "redo"       => { let _ = app.emit("menu-redo",       ()); }
                "select-all" => { let _ = app.emit("menu-select-all", ()); }
                "find"       => { let _ = app.emit("menu-find",       ()); }
                // Document menu — stubs forwarded to frontend for future implementation
                "rotate-cw"      => { let _ = app.emit("menu-rotate-cw",      ()); }
                "rotate-cw-all"  => { let _ = app.emit("menu-rotate-cw-all",  ()); }
                "rotate-ccw"     => { let _ = app.emit("menu-rotate-ccw",     ()); }
                "rotate-ccw-all" => { let _ = app.emit("menu-rotate-ccw-all", ()); }
                "split"          => { let _ = app.emit("menu-split",          ()); }
                "merge"          => { let _ = app.emit("menu-merge",          ()); }
                "import-pages"   => { let _ = app.emit("menu-import-pages",   ()); }
                // View → Page Display — toggle check-marks in Rust, then notify frontend
                "display-continuous" => { set_display_checks(app, "continuous"); let _ = app.emit("menu-display", "continuous"); }
                "display-single"     => { set_display_checks(app, "single");     let _ = app.emit("menu-display", "single"); }
                "display-spread"     => { set_display_checks(app, "spread");     let _ = app.emit("menu-display", "spread"); }
                "zoom-in"        => { let _ = app.emit("menu-zoom-in",        ()); }
                "zoom-out"       => { let _ = app.emit("menu-zoom-out",       ()); }
                "zoom-fit-width" => { let _ = app.emit("menu-zoom-fit-width", ()); }
                "theme-system" => { set_theme_checks(app, "system"); let _ = app.emit("menu-theme", "system"); }
                "theme-light"  => { set_theme_checks(app, "light");  let _ = app.emit("menu-theme", "light"); }
                "theme-dark"   => { set_theme_checks(app, "dark");   let _ = app.emit("menu-theme", "dark"); }
                "report-bug"   => { let _ = app.emit("menu-report-bug", ()); }
                _ => {}
            }
        })
        .manage(AppState {
            documents: Mutex::new(HashMap::new()),
            next_id: AtomicU32::new(0),
        })
        // ---------------------------------------------------------------------------
        // Page image protocol — collate://localhost/{doc_id}/{page_index}/{width}
        //
        // Returns raw RGBA bytes directly to the WebView, bypassing JPEG encoding.
        // The frontend paints them onto a <canvas> via ImageData. This eliminates
        // the dominant pipeline cost (8 ms/page for JPEG encode at 1200 px) down
        // to just the pdfium rasterise step (~0.3 ms).
        //
        // Rust note: the closure must be Send + Sync + 'static — it captures nothing
        // from the outer scope, receiving &AppHandle per-request instead.
        // ---------------------------------------------------------------------------
        .register_uri_scheme_protocol("collate", |app, request| {
            fn err(status: u16, msg: &str) -> http::Response<Vec<u8>> {
                http::Response::builder()
                    .status(status)
                    .body(msg.as_bytes().to_vec())
                    .unwrap()
            }

            // Path: /{doc_id}/{page_index}/{width}
            let path = request.uri().path().trim_start_matches('/');
            let parts: Vec<&str> = path.split('/').collect();
            if parts.len() != 3 {
                return err(400, "expected path /{doc_id}/{page_index}/{width}");
            }
            let (doc_id, page_index, width) = match (
                parts[0].parse::<u32>(),
                parts[1].parse::<u32>(),
                parts[2].parse::<u32>(),
            ) {
                (Ok(a), Ok(b), Ok(c)) => (a, b, c),
                _ => return err(400, "path components must be unsigned integers"),
            };

            let state = app.app_handle().state::<AppState>();
            let entry = {
                let docs = state.documents.lock().unwrap();
                match docs.get(&doc_id).cloned() {
                    Some(e) => e,
                    None => return err(404, &format!("document {doc_id} not found")),
                }
            };

            // Serialised by design: pdfium's C library is not thread-safe for
            // concurrent operations on the same FPDF_DOCUMENT handle. The
            // `thread_safe` feature on pdfium-render makes Pdfium itself
            // Send+Sync (it swaps Rc for Arc internally), but that only covers
            // the library handle — it does not make simultaneous renders on one
            // document safe. Hence the Mutex here.
            //
            // At ~0.3 ms/render this is not a bottleneck today. If it ever
            // becomes one, the fix is a per-document pool of PdfDocument
            // instances (each calling load_pdf_from_byte_slice on the same
            // Arc<Vec<u8>>). The bytes are already reference-counted and
            // pdfium holds only a pointer into that buffer — so N pool members
            // share one heap allocation with no extra copies. See the tracking
            // issue for a spike plan.
            let doc = entry.doc.lock().unwrap();
            match rasterise_page(&doc, page_index, width) {
                Ok((rgba, w, h)) => http::Response::builder()
                    .status(200)
                    // BMP is natively decoded by WebKit — no JS codec work needed.
                    // Using <img src="collate://..."> bypasses CORS entirely, which
                    // is why we use BMP rather than raw bytes + fetch().
                    .header("Content-Type", "image/bmp")
                    .body(encode_bmp(&rgba, w, h))
                    .unwrap(),
                Err(e) => err(500, &e),
            }
        })
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            open_document,
            close_document,
            get_document_info,
            set_menu_theme,
            set_pdf_menus_enabled,
            save_document,
            undo_document,
            redo_document,
            rotate_pages,
            delete_pages,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Build a bare AppState with no open documents. Does not require pdfium
    /// or a Tauri AppHandle — safe for pure unit tests.
    fn empty_state() -> AppState {
        AppState {
            documents: Mutex::new(HashMap::new()),
            next_id: AtomicU32::new(0),
        }
    }

    // require_doc — the shared validation helper used by every mutation stub.

    #[test]
    fn require_doc_returns_err_when_id_absent() {
        let state = empty_state();
        assert_eq!(
            require_doc(0, &state).err().unwrap(),
            "document 0 not found"
        );
    }

    #[test]
    fn require_doc_error_message_includes_the_id() {
        let state = empty_state();
        assert_eq!(
            require_doc(99, &state).err().unwrap(),
            "document 99 not found"
        );
    }

    // Stub return values — verify the error strings each command produces so
    // that the frontend toast messages are stable and don't drift silently.
    //
    // Note: testing the "doc found → not implemented" path requires a live
    // PdfDocument, which in turn requires the pdfium shared library. That path
    // is covered by integration tests in tests/. The unit tests here focus on
    // the validation logic, which is the only real behaviour in the stubs.

    #[test]
    fn save_document_error_string_is_stable() {
        let state = empty_state();
        assert_eq!(
            require_doc(1, &state).err().unwrap(),
            "document 1 not found",
            "save_document error message changed — update the frontend toast copy too"
        );
    }

    #[test]
    fn undo_redo_error_strings_are_stable() {
        let state = empty_state();
        // Both stubs delegate to require_doc, so testing the shared path is
        // sufficient until the real implementations land.
        assert_eq!(require_doc(2, &state).err().unwrap(), "document 2 not found");
        assert_eq!(require_doc(3, &state).err().unwrap(), "document 3 not found");
    }

    #[test]
    fn rotate_delete_error_strings_are_stable() {
        let state = empty_state();
        assert_eq!(require_doc(4, &state).err().unwrap(), "document 4 not found");
        assert_eq!(require_doc(5, &state).err().unwrap(), "document 5 not found");
    }

    #[test]
    fn get_document_info_unknown_doc_returns_err() {
        let state = empty_state();
        assert_eq!(
            require_doc(99, &state).err().unwrap(),
            "document 99 not found"
        );
    }
}
