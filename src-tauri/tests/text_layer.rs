//! Integration tests for the text layer extraction and search features.
//!
//! These tests require the pdfium shared library. Run `make pdfium` first if
//! pdfium is not already present on your system.
//!
//! Test PDFs are generated in-memory using lopdf so no fixture files are
//! needed. All pdfium operations are gated behind a one-time initialisation
//! (mirroring what `run()` does in the main binary).

use std::sync::OnceLock;

use collate_lib::text::{get_text_layer_impl, search_document_impl};
use lopdf::{Dictionary, Document, Object, Stream};
use pdfium_render::prelude::*;

// ---------------------------------------------------------------------------
// Pdfium initialisation — once per process, mirrors lib.rs `run()`
// ---------------------------------------------------------------------------

fn init_pdfium() {
    static INIT: OnceLock<()> = OnceLock::new();
    INIT.get_or_init(|| {
        Pdfium::new(
            Pdfium::bind_to_system_library()
                .expect("pdfium shared library not found — run `make pdfium` first"),
        );
    });
}

// ---------------------------------------------------------------------------
// PDF fixture helpers
// ---------------------------------------------------------------------------

/// Build a minimal one-page PDF whose content stream places `text` on the page
/// using the given Type1 BaseFont at 12pt.  Pdfium handles standard font names
/// (Helvetica, Helvetica-Bold, etc.) using built-in AFM metrics.
fn make_text_pdf_with_font(text: &str, base_font: &str) -> Vec<u8> {
    let mut doc = Document::with_version("1.4");

    let mut font_dict = Dictionary::new();
    font_dict.set("Type", Object::Name(b"Font".to_vec()));
    font_dict.set("Subtype", Object::Name(b"Type1".to_vec()));
    font_dict.set("BaseFont", Object::Name(base_font.as_bytes().to_vec()));
    font_dict.set("Encoding", Object::Name(b"WinAnsiEncoding".to_vec()));
    let font_id = doc.add_object(Object::Dictionary(font_dict));

    let stream_bytes = format!("BT /F1 12 Tf 72 720 Td ({text}) Tj ET").into_bytes();
    let mut stream_dict = Dictionary::new();
    stream_dict.set("Length", Object::Integer(stream_bytes.len() as i64));
    let content_id = doc.add_object(Object::Stream(Stream::new(stream_dict, stream_bytes)));

    let mut font_resources = Dictionary::new();
    font_resources.set("F1", Object::Reference(font_id));
    let mut resources_dict = Dictionary::new();
    resources_dict.set("Font", Object::Dictionary(font_resources));

    let media_box = Object::Array(vec![
        Object::Integer(0),
        Object::Integer(0),
        Object::Integer(612),
        Object::Integer(792),
    ]);

    let pages_id = doc.new_object_id();

    let mut page_dict = Dictionary::new();
    page_dict.set("Type", Object::Name(b"Page".to_vec()));
    page_dict.set("Parent", Object::Reference(pages_id));
    page_dict.set("MediaBox", media_box);
    page_dict.set("Contents", Object::Reference(content_id));
    page_dict.set("Resources", Object::Dictionary(resources_dict));
    let page_id = doc.add_object(Object::Dictionary(page_dict));

    let mut pages_dict = Dictionary::new();
    pages_dict.set("Type", Object::Name(b"Pages".to_vec()));
    pages_dict.set("Kids", Object::Array(vec![Object::Reference(page_id)]));
    pages_dict.set("Count", Object::Integer(1));
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    let mut catalog_dict = Dictionary::new();
    catalog_dict.set("Type", Object::Name(b"Catalog".to_vec()));
    catalog_dict.set("Pages", Object::Reference(pages_id));
    let catalog_id = doc.add_object(Object::Dictionary(catalog_dict));
    doc.trailer.set("Root", Object::Reference(catalog_id));

    let tmp = std::env::temp_dir().join(format!(
        "collate_test_font_{:?}.pdf",
        std::thread::current().id()
    ));
    doc.save(tmp.to_str().unwrap()).expect("lopdf save failed");
    let bytes = std::fs::read(&tmp).expect("read temp pdf");
    let _ = std::fs::remove_file(&tmp);
    bytes
}

/// Build a minimal one-page PDF whose content stream places `text` on the page
/// using Helvetica 12pt at position (72, 720) PDF points.
///
/// Pdfium can extract text from standard Type1 fonts (Helvetica) using its
/// built-in AFM metrics — no embedded font program required.
fn make_text_pdf(text: &str) -> Vec<u8> {
    let mut doc = Document::with_version("1.4");

    // Font dictionary — standard Type1, WinAnsiEncoding so pdfium maps bytes
    // to Unicode correctly.
    let mut font_dict = Dictionary::new();
    font_dict.set("Type", Object::Name(b"Font".to_vec()));
    font_dict.set("Subtype", Object::Name(b"Type1".to_vec()));
    font_dict.set("BaseFont", Object::Name(b"Helvetica".to_vec()));
    font_dict.set("Encoding", Object::Name(b"WinAnsiEncoding".to_vec()));
    let font_id = doc.add_object(Object::Dictionary(font_dict));

    // Content stream.
    let stream_bytes = format!("BT /F1 12 Tf 72 720 Td ({text}) Tj ET").into_bytes();
    let mut stream_dict = Dictionary::new();
    stream_dict.set("Length", Object::Integer(stream_bytes.len() as i64));
    let content_id = doc.add_object(Object::Stream(Stream::new(stream_dict, stream_bytes)));

    // Resources dictionary.
    let mut font_resources = Dictionary::new();
    font_resources.set("F1", Object::Reference(font_id));
    let mut resources_dict = Dictionary::new();
    resources_dict.set("Font", Object::Dictionary(font_resources));

    // MediaBox: US Letter (612 × 792 pts).
    let media_box = Object::Array(vec![
        Object::Integer(0),
        Object::Integer(0),
        Object::Integer(612),
        Object::Integer(792),
    ]);

    // Pages node (placeholder — we'll fill it after we have the page id).
    let pages_id = doc.new_object_id();

    // Page dictionary.
    let mut page_dict = Dictionary::new();
    page_dict.set("Type", Object::Name(b"Page".to_vec()));
    page_dict.set("Parent", Object::Reference(pages_id));
    page_dict.set("MediaBox", media_box);
    page_dict.set("Contents", Object::Reference(content_id));
    page_dict.set("Resources", Object::Dictionary(resources_dict));
    let page_id = doc.add_object(Object::Dictionary(page_dict));

    // Fill in the Pages node now that we have the page id.
    let mut pages_dict = Dictionary::new();
    pages_dict.set("Type", Object::Name(b"Pages".to_vec()));
    pages_dict.set(
        "Kids",
        Object::Array(vec![Object::Reference(page_id)]),
    );
    pages_dict.set("Count", Object::Integer(1));
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    // Catalog.
    let mut catalog_dict = Dictionary::new();
    catalog_dict.set("Type", Object::Name(b"Catalog".to_vec()));
    catalog_dict.set("Pages", Object::Reference(pages_id));
    let catalog_id = doc.add_object(Object::Dictionary(catalog_dict));
    doc.trailer.set("Root", Object::Reference(catalog_id));

    // Serialize to bytes via a temp file (avoids io::Write API version concerns).
    let tmp = std::env::temp_dir().join(format!(
        "collate_test_{:?}.pdf",
        std::thread::current().id()
    ));
    doc.save(tmp.to_str().unwrap()).expect("lopdf save failed");
    let bytes = std::fs::read(&tmp).expect("read temp pdf");
    let _ = std::fs::remove_file(&tmp);
    bytes
}

/// Build a minimal one-page PDF with NO content stream — simulates a scanned
/// image page where pdfium finds zero text characters.
fn make_blank_pdf() -> Vec<u8> {
    let mut doc = Document::with_version("1.4");
    let pages_id = doc.new_object_id();

    let mut page_dict = Dictionary::new();
    page_dict.set("Type", Object::Name(b"Page".to_vec()));
    page_dict.set("Parent", Object::Reference(pages_id));
    page_dict.set(
        "MediaBox",
        Object::Array(vec![
            Object::Integer(0),
            Object::Integer(0),
            Object::Integer(612),
            Object::Integer(792),
        ]),
    );
    let page_id = doc.add_object(Object::Dictionary(page_dict));

    let mut pages_dict = Dictionary::new();
    pages_dict.set("Type", Object::Name(b"Pages".to_vec()));
    pages_dict.set(
        "Kids",
        Object::Array(vec![Object::Reference(page_id)]),
    );
    pages_dict.set("Count", Object::Integer(1));
    doc.objects.insert(pages_id, Object::Dictionary(pages_dict));

    let mut catalog_dict = Dictionary::new();
    catalog_dict.set("Type", Object::Name(b"Catalog".to_vec()));
    catalog_dict.set("Pages", Object::Reference(pages_id));
    let catalog_id = doc.add_object(Object::Dictionary(catalog_dict));
    doc.trailer.set("Root", Object::Reference(catalog_id));

    let tmp = std::env::temp_dir().join(format!(
        "collate_blank_{:?}.pdf",
        std::thread::current().id()
    ));
    doc.save(tmp.to_str().unwrap()).expect("lopdf save failed");
    let bytes = std::fs::read(&tmp).expect("read temp pdf");
    let _ = std::fs::remove_file(&tmp);
    bytes
}

/// Open PDF bytes with pdfium and run `f` with the resulting document.
fn with_doc<F, T>(bytes: Vec<u8>, f: F) -> T
where
    F: FnOnce(&PdfDocument<'_>) -> T,
{
    let bytes = std::sync::Arc::new(bytes);
    let doc = Pdfium
        .load_pdf_from_byte_slice(&bytes, None)
        .expect("pdfium failed to open test PDF");
    f(&doc)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[test]
fn text_layer_returns_words_for_text_page() {
    init_pdfium();
    let bytes = make_text_pdf("Hello World");
    with_doc(bytes, |doc| {
        let result = get_text_layer_impl(doc, 0).expect("get_text_layer_impl failed");
        assert!(!result.scanned, "page with text should not be flagged as scanned");
        assert!(
            !result.words.is_empty(),
            "expected at least one word, got none"
        );
    });
}

#[test]
fn text_layer_coordinates_are_normalised() {
    init_pdfium();
    let bytes = make_text_pdf("Hello");
    with_doc(bytes, |doc| {
        let result = get_text_layer_impl(doc, 0).expect("get_text_layer_impl failed");
        for word in &result.words {
            assert!(
                (0.0..=1.0).contains(&word.x),
                "x out of range: {}",
                word.x
            );
            assert!(
                (0.0..=1.0).contains(&word.y),
                "y out of range: {}",
                word.y
            );
            assert!(
                (0.0..=1.0).contains(&word.width),
                "width out of range: {}",
                word.width
            );
            assert!(
                (0.0..=1.0).contains(&word.height),
                "height out of range: {}",
                word.height
            );
        }
    });
}

#[test]
fn text_layer_word_grouping_splits_on_whitespace() {
    init_pdfium();
    // "Hello World" should produce exactly two words.
    let bytes = make_text_pdf("Hello World");
    with_doc(bytes, |doc| {
        let result = get_text_layer_impl(doc, 0).expect("get_text_layer_impl failed");
        assert_eq!(
            result.words.len(),
            2,
            "expected 2 words, got {}: {:?}",
            result.words.len(),
            result.words.iter().map(|w| &w.text).collect::<Vec<_>>()
        );
        assert_eq!(result.words[0].text, "Hello");
        assert_eq!(result.words[1].text, "World");
    });
}

#[test]
fn text_layer_returns_scanned_for_blank_page() {
    init_pdfium();
    let bytes = make_blank_pdf();
    with_doc(bytes, |doc| {
        let result = get_text_layer_impl(doc, 0).expect("get_text_layer_impl failed");
        assert!(result.scanned, "blank page should be flagged as scanned");
        assert!(
            result.words.is_empty(),
            "expected no words on blank page, got {}",
            result.words.len()
        );
    });
}

#[test]
fn text_layer_url_detection() {
    init_pdfium();
    let bytes = make_text_pdf("https://example.com");
    with_doc(bytes, |doc| {
        let result = get_text_layer_impl(doc, 0).expect("get_text_layer_impl failed");
        assert!(
            !result.words.is_empty(),
            "expected URL word to be extracted"
        );
        let url_word = result
            .words
            .iter()
            .find(|w| w.text == "https://example.com");
        assert!(
            url_word.is_some(),
            "expected word with text 'https://example.com', got: {:?}",
            result.words.iter().map(|w| &w.text).collect::<Vec<_>>()
        );
        assert!(
            url_word.unwrap().is_url,
            "expected is_url=true for https://example.com"
        );
    });
}

#[test]
fn search_finds_match_on_correct_page() {
    init_pdfium();
    let bytes = make_text_pdf("Motion for Summary Judgment");
    with_doc(bytes, |doc| {
        let matches =
            search_document_impl(doc, 1, "Summary").expect("search_document_impl failed");
        assert_eq!(matches.len(), 1, "expected 1 matching page");
        assert_eq!(matches[0].page_index, 0);
        assert!(
            !matches[0].word_indices.is_empty(),
            "expected at least one word index"
        );
    });
}

#[test]
fn search_is_case_insensitive() {
    init_pdfium();
    let bytes = make_text_pdf("Motion for Summary Judgment");
    with_doc(bytes, |doc| {
        let matches =
            search_document_impl(doc, 1, "summary").expect("search_document_impl failed");
        assert_eq!(matches.len(), 1, "case-insensitive search should match");
    });
}

#[test]
fn search_returns_empty_for_no_match() {
    init_pdfium();
    let bytes = make_text_pdf("Hello World");
    with_doc(bytes, |doc| {
        let matches =
            search_document_impl(doc, 1, "Zebra").expect("search_document_impl failed");
        assert!(matches.is_empty(), "expected no matches for 'Zebra'");
    });
}

#[test]
fn search_empty_query_returns_empty() {
    init_pdfium();
    let bytes = make_text_pdf("Hello World");
    with_doc(bytes, |doc| {
        let matches = search_document_impl(doc, 1, "").expect("search_document_impl failed");
        assert!(matches.is_empty());
    });
}

#[test]
fn search_skips_scanned_pages() {
    init_pdfium();
    let bytes = make_blank_pdf();
    with_doc(bytes, |doc| {
        let matches = search_document_impl(doc, 1, "hello").expect("search_document_impl failed");
        assert!(
            matches.is_empty(),
            "scanned page should produce no search results"
        );
    });
}

/// Helvetica-Bold / WinAnsiEncoding with an unembedded font may cause
/// tight_bounds to fail for every glyph.  The search must still find the text
/// and return a page match even when no word highlight boxes can be built.
#[test]
fn search_finds_match_in_helvetica_bold() {
    init_pdfium();
    let bytes = make_text_pdf_with_font("FOX SMITH", "Helvetica-Bold");
    with_doc(bytes, |doc| {
        let matches =
            search_document_impl(doc, 1, "FOX").expect("search_document_impl failed");
        assert_eq!(
            matches.len(),
            1,
            "expected 1 page match for 'FOX' in Helvetica-Bold text"
        );
        assert_eq!(matches[0].page_index, 0);
    });
}

/// Case-insensitive search must also work for Helvetica-Bold text.
#[test]
fn search_finds_lowercase_query_in_helvetica_bold() {
    init_pdfium();
    let bytes = make_text_pdf_with_font("FOX SMITH", "Helvetica-Bold");
    with_doc(bytes, |doc| {
        let matches =
            search_document_impl(doc, 1, "fox").expect("search_document_impl failed");
        assert_eq!(
            matches.len(),
            1,
            "case-insensitive search must find 'fox' in 'FOX SMITH'"
        );
    });
}

/// A page must appear in results even when the matched text has no word boxes
/// (e.g. all tight_bounds calls failed for a font).  word_indices will be
/// empty but the page index must be present so the find bar can scroll to it.
#[test]
fn search_reports_page_when_word_boxes_missing() {
    init_pdfium();
    // We test search_document_impl with a real PDF so the path through
    // extract_page_words is exercised.  The word_indices may be empty when
    // tight_bounds is unavailable, but the page must still appear.
    let bytes = make_text_pdf_with_font("FOX SMITH", "Helvetica-Bold");
    with_doc(bytes, |doc| {
        let matches =
            search_document_impl(doc, 1, "FOX").expect("search_document_impl failed");
        assert!(
            !matches.is_empty(),
            "page must be in results even if word_indices is empty"
        );
        assert_eq!(matches[0].page_index, 0, "match must be on page 0");
    });
}
