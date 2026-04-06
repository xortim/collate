use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use pdfium_render::prelude::*;
use serde::Serialize;
use tauri::State;

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

struct DocumentEntry {
    path: String,
    page_count: usize,
    filename: String,
}

struct AppState {
    documents: Mutex<HashMap<u32, DocumentEntry>>,
    next_id: AtomicU32,
}

// ---------------------------------------------------------------------------
// IPC return types
// ---------------------------------------------------------------------------

/// Returned by `open_document`. Gives the frontend enough to render the UI.
#[derive(Serialize)]
struct DocumentManifest {
    doc_id: u32,
    page_count: usize,
    filename: String,
}

// ---------------------------------------------------------------------------
// IPC commands
// ---------------------------------------------------------------------------

/// Open a PDF. Validates the file with lopdf, stores it in app state, and
/// returns a manifest so the frontend knows how many pages exist.
///
/// Rust note: `State<AppState>` is dependency injection — Tauri sees the type
/// and hands us the value we registered with `.manage()` in `run()`. The
/// `Mutex` lets us safely mutate the HashMap from any thread. We `lock()`
/// to get a `MutexGuard` (Go analogy: a sync.Mutex that returns a typed
/// guard), then it unlocks automatically when the guard drops.
#[tauri::command]
fn open_document(path: String, state: State<AppState>) -> Result<DocumentManifest, String> {
    let doc = lopdf::Document::load(&path)
        .map_err(|e| format!("Failed to open PDF: {e}"))?;

    let page_count = doc.get_pages().len();

    let filename = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.pdf")
        .to_string();

    // AtomicU32::fetch_add is like sync/atomic.AddUint32 in Go — returns the
    // old value and increments atomically, so no Mutex needed for the counter.
    let doc_id = state.next_id.fetch_add(1, Ordering::Relaxed);

    state.documents.lock().unwrap().insert(
        doc_id,
        DocumentEntry {
            path,
            page_count,
            filename: filename.clone(),
        },
    );

    Ok(DocumentManifest {
        doc_id,
        page_count,
        filename,
    })
}

/// Render one page with pdfium-render and return it as a base64-encoded PNG.
///
/// The frontend receives a plain string it can use directly as the `src` of
/// an <img> tag after prefixing with `data:image/png;base64,`.
///
/// Rust note: we lock the Mutex only long enough to clone the path string,
/// then drop the guard before the pdfium calls. This avoids holding a lock
/// across slow I/O — a common Rust pattern for keeping critical sections short.
///
/// pdfium note: pdfium is a C library that needs the shared library
/// (libpdfium.dylib / pdfium.dll) present at runtime.
/// On macOS: download from https://github.com/bblanchon/pdfium-binaries/releases
/// and place libpdfium.dylib in /usr/local/lib (or anywhere on DYLD_LIBRARY_PATH).
#[tauri::command]
fn get_page_image(
    doc_id: u32,
    page_index: u32,
    width: u32,
    state: State<AppState>,
) -> Result<String, String> {
    // Pull the path out while holding the lock, then release it immediately.
    let path = {
        let docs = state.documents.lock().unwrap();
        docs.get(&doc_id)
            .ok_or_else(|| format!("Document {doc_id} not found"))?
            .path
            .clone()
    };

    // Bind to pdfium. bind_to_system_library() searches the standard library
    // paths for the platform (DYLD_LIBRARY_PATH on macOS, PATH on Windows).
    // Rust note: the `?` operator is like Go's `if err != nil { return err }`,
    // but it also calls `.into()` on the error so types can be converted —
    // here we chain .map_err() to convert the pdfium error to a String first.
    let pdfium = Pdfium::new(
        Pdfium::bind_to_system_library()
            .map_err(|e| format!("pdfium library not found: {e:?}. See get_page_image docs."))?,
    );

    let doc = pdfium
        .load_pdf_from_file(&path, None)
        .map_err(|e| format!("pdfium failed to load PDF: {e:?}"))?;

    // PdfPageIndex is i32 in pdfium-render 0.9.0.
    let page = doc
        .pages()
        .get(page_index as i32)
        .map_err(|e| format!("Failed to get page {page_index}: {e:?}"))?;

    let render_config = PdfRenderConfig::new().set_target_width(width as i32);

    let rendered = page
        .render_with_config(&render_config)
        .map_err(|e| format!("Failed to render page: {e:?}"))?;

    // as_image() returns Result<DynamicImage, PdfiumError> in 0.9.0 — the `?`
    // extracts the value or propagates the error (like Go's err check but
    // inline). DynamicImage is from the `image` crate.
    let img = rendered
        .as_image()
        .map_err(|e| format!("Failed to convert to image: {e:?}"))?;

    let mut png_bytes: Vec<u8> = Vec::new();
    img.write_to(
        &mut std::io::Cursor::new(&mut png_bytes),
        image::ImageFormat::Png,
    )
    .map_err(|e| format!("Failed to encode PNG: {e}"))?;

    Ok(BASE64.encode(&png_bytes))
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            documents: Mutex::new(HashMap::new()),
            next_id: AtomicU32::new(0),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![open_document, get_page_image])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
