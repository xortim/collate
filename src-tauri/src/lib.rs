use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use pdfium_render::prelude::*;
use serde::Serialize;
use tauri::State;

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

// page_count and filename will be used in future IPC commands (close_document,
// workspace manifest). Suppress the dead_code lint until then.
#[allow(dead_code)]
struct DocumentEntry {
    /// Raw PDF bytes kept in memory so pdfium never re-reads from disk.
    /// Arc lets us clone the pointer (cheap) without copying the bytes.
    pdf_bytes: Arc<Vec<u8>>,
    page_count: usize,
    filename: String,
}

struct AppState {
    /// Pdfium binding, initialised once at startup.
    ///
    /// Rust note: Mutex<T> is Send+Sync when T: Send. The `thread_safe`
    /// feature on pdfium-render makes Pdfium use Arc internally instead of
    /// Rc, so Pdfium becomes Send — allowing it to live behind a Mutex in a
    /// shared state struct that Tauri hands to multiple threads.
    pdfium: Mutex<Pdfium>,
    documents: Mutex<HashMap<u32, DocumentEntry>>,
    next_id: AtomicU32,
}

// ---------------------------------------------------------------------------
// IPC return types
// ---------------------------------------------------------------------------

/// Physical page dimensions in PDF points (1 pt = 1/72 inch).
/// The frontend uses these to pre-size virtual list rows before the image
/// arrives, preventing layout shifts during scroll.
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
    /// One entry per page, in order.
    page_sizes: Vec<PageSize>,
}

// ---------------------------------------------------------------------------
// IPC commands
// ---------------------------------------------------------------------------

/// Open a PDF. Reads bytes into memory, validates with lopdf, extracts page
/// sizes with pdfium, stores everything in AppState, returns a manifest.
///
/// Rust note: `State<AppState>` is dependency injection — Tauri sees the type
/// and hands us the value we registered with `.manage()` in `run()`. The
/// `Mutex` lets us safely mutate the HashMap from any thread. We `lock()`
/// to get a `MutexGuard` (Go analogy: a sync.Mutex that returns a typed
/// guard), then it unlocks automatically when the guard drops at end of scope.
#[tauri::command]
fn open_document(path: String, state: State<AppState>) -> Result<DocumentManifest, String> {
    // Read the file once; everything downstream uses these bytes.
    let pdf_bytes =
        std::fs::read(&path).map_err(|e| format!("Failed to read file: {e}"))?;

    // Validate the PDF structure with lopdf (our future editing library).
    let lopdf_doc = lopdf::Document::load_mem(&pdf_bytes)
        .map_err(|e| format!("Invalid or corrupt PDF: {e}"))?;
    let page_count = lopdf_doc.get_pages().len();

    // Extract per-page dimensions using the cached pdfium binding.
    //
    // Rust note: the braces create a scope so the MutexGuard (`pdfium`) drops
    // at `}`, releasing the lock before we do anything else — same idea as
    // Go's defer mu.Unlock() but scope-driven rather than explicit.
    // Rust note: the closure returns Result<PageSize, String> so we can
    // propagate errors with `?`. collect::<Result<Vec<_>, _>>() short-circuits
    // on the first Err — analogous to returning early from a Go loop on error.
    let page_sizes: Vec<PageSize> = {
        let pdfium = state.pdfium.lock().unwrap();
        let doc = pdfium
            .load_pdf_from_byte_slice(&pdf_bytes, None)
            .map_err(|e| format!("pdfium failed to read PDF: {e:?}"))?;
        (0..page_count as i32)
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
            .collect::<Result<Vec<_>, String>>()?
    };

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
            pdf_bytes: Arc::new(pdf_bytes),
            page_count,
            filename: filename.clone(),
        },
    );

    Ok(DocumentManifest {
        doc_id,
        page_count,
        filename,
        page_sizes,
    })
}

/// Render one page and return it as a base64-encoded PNG string.
///
/// The pdfium binding is already initialised in AppState (no library load),
/// and the PDF bytes are already in memory (no disk I/O). This call only
/// parses and renders.
///
/// Rust note: we acquire the documents lock only long enough to clone the Arc
/// (a pointer increment, not a byte copy), release it, then acquire the pdfium
/// lock for rendering. Keeping critical sections short and non-overlapping
/// avoids deadlocks and reduces contention.
#[tauri::command]
fn get_page_image(
    doc_id: u32,
    page_index: u32,
    width: u32,
    state: State<AppState>,
) -> Result<String, String> {
    // Clone the Arc — O(1), just bumps a reference count.
    let pdf_bytes = {
        let docs = state.documents.lock().unwrap();
        docs.get(&doc_id)
            .ok_or_else(|| format!("Document {doc_id} not found"))?
            .pdf_bytes
            .clone()
    };

    let pdfium = state.pdfium.lock().unwrap();

    let doc = pdfium
        .load_pdf_from_byte_slice(&pdf_bytes, None)
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

    // as_image() returns Result<DynamicImage, PdfiumError>. DynamicImage is
    // from the `image` crate — a heap-allocated decoded bitmap.
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
    // Bind to pdfium once for the lifetime of the process. Panicking here
    // gives a clear startup error if the library is missing (run `make pdfium`).
    let pdfium = Pdfium::new(
        Pdfium::bind_to_system_library()
            .expect("pdfium shared library not found — run `make pdfium` first"),
    );

    tauri::Builder::default()
        .manage(AppState {
            pdfium: Mutex::new(pdfium),
            documents: Mutex::new(HashMap::new()),
            next_id: AtomicU32::new(0),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![open_document, get_page_image])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
