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
#[derive(Serialize)]
struct PageSize {
    width_pts: f64,
    height_pts: f64,
}

/// Returned by `open_document`.
#[derive(Serialize)]
struct DocumentManifest {
    doc_id: u32,
    page_count: usize,
    filename: String,
    page_sizes: Vec<PageSize>,
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
            _bytes: pdf_bytes,
        }),
    );

    Ok(DocumentManifest {
        doc_id,
        page_count,
        filename,
        page_sizes,
    })
}

/// Release a document from memory. The PdfDocument drop impl calls
/// FPDF_CloseDocument automatically.
#[tauri::command]
fn close_document(doc_id: u32, state: State<AppState>) -> Result<(), String> {
    state.documents.lock().unwrap().remove(&doc_id);
    Ok(())
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
                "open"  => { let _ = app.emit("menu-open",  ()); }
                "print" => { let _ = app.emit("menu-print", ()); }
                "undo"  => { let _ = app.emit("menu-undo",  ()); }
                "redo"  => { let _ = app.emit("menu-redo",  ()); }
                "find"  => { let _ = app.emit("menu-find",  ()); }
                "theme-system" => { set_theme_checks(app, "system"); let _ = app.emit("menu-theme", "system"); }
                "theme-light"  => { set_theme_checks(app, "light");  let _ = app.emit("menu-theme", "light"); }
                "theme-dark"   => { set_theme_checks(app, "dark");   let _ = app.emit("menu-theme", "dark"); }
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
            set_menu_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
