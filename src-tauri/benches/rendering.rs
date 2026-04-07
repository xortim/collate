//! Headless rendering benchmarks — no Tauri runtime required.
//!
//! Run with:  make bench
//!
//! Benchmarks are organised in two layers:
//!
//!   1. Per-stage — isolates each step of the pipeline so we know exactly
//!      where time is spent before optimising anything.
//!
//!      rasterise    pdfium → raw RGBA bytes          (needs library)
//!      rgba_to_rgb  RGBA bytes → RgbImage            (pure Rust)
//!      encode_jpeg  RgbImage → JPEG bytes            (pure Rust)
//!
//!   2. Full pipeline — end-to-end render_page_jpeg at realistic widths,
//!      and multi-page throughput simulating the virtual scroller.
//!
//! The test PDF is generated in-process via lopdf — no binary fixture in repo.

use collate_lib::{encode_bmp, encode_jpeg, rasterise_page, render_page_jpeg, rgba_to_rgb};
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use pdfium_render::prelude::*;
use std::sync::OnceLock;

// ---------------------------------------------------------------------------
// pdfium initialisation
// ---------------------------------------------------------------------------

static PDFIUM_INIT: OnceLock<()> = OnceLock::new();

fn init_pdfium() {
    PDFIUM_INIT.get_or_init(|| {
        Pdfium::new(
            Pdfium::bind_to_system_library()
                .expect("libpdfium not found — run `make pdfium` first"),
        );
    });
}

// ---------------------------------------------------------------------------
// Test PDF generation
// ---------------------------------------------------------------------------

fn make_blank_pdf(page_count: usize) -> Vec<u8> {
    use lopdf::{dictionary, Document, Object, Stream};

    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();

    let mut kids: Vec<Object> = Vec::with_capacity(page_count);
    for _ in 0..page_count {
        let content_id = doc.add_object(Stream::new(dictionary! {}, b"".to_vec()));
        let page_id = doc.add_object(Object::Dictionary(dictionary! {
            "Type" => Object::Name(b"Page".to_vec()),
            "Parent" => Object::Reference(pages_id),
            "MediaBox" => Object::Array(vec![
                Object::Integer(0),
                Object::Integer(0),
                Object::Integer(612),
                Object::Integer(792),
            ]),
            "Contents" => Object::Reference(content_id),
        }));
        kids.push(Object::Reference(page_id));
    }

    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => Object::Name(b"Pages".to_vec()),
            "Kids" => Object::Array(kids),
            "Count" => Object::Integer(page_count as i64),
        }),
    );

    let catalog_id = doc.add_object(Object::Dictionary(dictionary! {
        "Type" => Object::Name(b"Catalog".to_vec()),
        "Pages" => Object::Reference(pages_id),
    }));
    doc.trailer.set("Root", Object::Reference(catalog_id));

    let mut buf = Vec::new();
    doc.save_to(&mut buf).unwrap();
    buf
}

// ---------------------------------------------------------------------------
// Stage 1: rasterise (pdfium → raw RGBA bytes)
// ---------------------------------------------------------------------------

/// How long does pdfium take to rasterise a page, excluding all Rust-side work?
///
/// This is the baseline for whether render_into_bitmap_with_config would help:
/// if rasterise is ~95% of the total, allocation overhead is negligible and
/// that API won't move the needle.
fn bench_rasterise(c: &mut Criterion) {
    init_pdfium();
    let pdf_bytes = make_blank_pdf(1);
    let doc = Pdfium
        .load_pdf_from_byte_slice(&pdf_bytes, None)
        .expect("failed to load test PDF");

    let mut group = c.benchmark_group("stage1_rasterise");
    for &width in &[800u32, 1200, 1920] {
        group.bench_with_input(BenchmarkId::new("width_px", width), &width, |b, &w| {
            b.iter(|| {
                let result = rasterise_page(black_box(&doc), black_box(0), black_box(w))
                    .expect("rasterise failed");
                black_box(result);
            });
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Stage 2: RGBA → RGB conversion
// ---------------------------------------------------------------------------

/// How long does the pixel format conversion take?
///
/// Pure Rust, no pdfium. Pre-generate realistic-sized RGBA buffers matching
/// what pdfium produces at each width, then measure the conversion in isolation.
fn bench_rgba_to_rgb(c: &mut Criterion) {
    init_pdfium();
    let pdf_bytes = make_blank_pdf(1);
    let doc = Pdfium
        .load_pdf_from_byte_slice(&pdf_bytes, None)
        .expect("failed to load test PDF");

    let mut group = c.benchmark_group("stage2_rgba_to_rgb");
    for &width in &[800u32, 1200, 1920] {
        // Rasterise once to get realistic dimensions — pdfium scales height to
        // preserve the page aspect ratio, so we can't assume a fixed height.
        let (raw, w, h) = rasterise_page(&doc, 0, width).expect("rasterise failed");

        group.bench_with_input(BenchmarkId::new("width_px", width), &width, |b, _| {
            b.iter(|| {
                let rgb = rgba_to_rgb(black_box(raw.clone()), black_box(w), black_box(h))
                    .expect("conversion failed");
                black_box(rgb);
            });
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Stage 3: JPEG encoding
// ---------------------------------------------------------------------------

/// How long does JPEG encoding take?
///
/// Pure Rust, no pdfium. Pre-convert to RGB once, then measure encoding only.
fn bench_encode_jpeg(c: &mut Criterion) {
    init_pdfium();
    let pdf_bytes = make_blank_pdf(1);
    let doc = Pdfium
        .load_pdf_from_byte_slice(&pdf_bytes, None)
        .expect("failed to load test PDF");

    let mut group = c.benchmark_group("stage3_encode_jpeg");
    for &width in &[800u32, 1200, 1920] {
        let (raw, w, h) = rasterise_page(&doc, 0, width).expect("rasterise failed");
        let rgb = rgba_to_rgb(raw, w, h).expect("conversion failed");

        group.bench_with_input(BenchmarkId::new("width_px", width), &width, |b, _| {
            b.iter(|| {
                let jpeg = encode_jpeg(black_box(&rgb), black_box(90)).expect("encode failed");
                black_box(jpeg);
            });
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// BMP encoding (the new hot-path codec)
// ---------------------------------------------------------------------------

/// How long does BMP encoding take vs JPEG?
///
/// BMP is the format returned by the collate:// protocol. Unlike JPEG, it
/// requires no DCT or entropy coding — just a header write and an RGBA→BGR
/// channel swap. This bench confirms the codec is no longer the bottleneck.
fn bench_encode_bmp(c: &mut Criterion) {
    init_pdfium();
    let pdf_bytes = make_blank_pdf(1);
    let doc = Pdfium
        .load_pdf_from_byte_slice(&pdf_bytes, None)
        .expect("failed to load test PDF");

    let mut group = c.benchmark_group("stage3_encode_bmp");
    for &width in &[800u32, 1200, 1920] {
        let (raw, w, h) = rasterise_page(&doc, 0, width).expect("rasterise failed");

        group.bench_with_input(BenchmarkId::new("width_px", width), &width, |b, _| {
            b.iter(|| {
                let bmp = encode_bmp(black_box(&raw), black_box(w), black_box(h));
                black_box(bmp);
            });
        });
    }
    group.finish();
}

// ---------------------------------------------------------------------------
// Full pipeline
// ---------------------------------------------------------------------------

/// End-to-end pipeline at realistic viewer widths.
///
/// Compare against the per-stage totals to confirm no unexpected overhead
/// at the orchestration layer.
fn bench_full_pipeline(c: &mut Criterion) {
    init_pdfium();
    let pdf_bytes = make_blank_pdf(1);
    let doc = Pdfium
        .load_pdf_from_byte_slice(&pdf_bytes, None)
        .expect("failed to load test PDF");

    let mut group = c.benchmark_group("pipeline");
    for &width in &[800u32, 1200, 1920] {
        group.bench_with_input(BenchmarkId::new("width_px", width), &width, |b, &w| {
            b.iter(|| {
                let jpeg = render_page_jpeg(black_box(&doc), black_box(0), black_box(w))
                    .expect("render failed");
                black_box(jpeg);
            });
        });
    }
    group.finish();
}

/// Sequential multi-page throughput — simulates the virtual scroller loading
/// a burst of pages as the user scrolls.
fn bench_page_throughput(c: &mut Criterion) {
    init_pdfium();

    let mut group = c.benchmark_group("throughput");
    for &page_count in &[5usize, 20] {
        let pdf_bytes = make_blank_pdf(page_count);
        let doc = Pdfium
            .load_pdf_from_byte_slice(&pdf_bytes, None)
            .expect("failed to load test PDF");

        group.bench_with_input(
            BenchmarkId::new("pages_at_1200px", page_count),
            &page_count,
            |b, &n| {
                b.iter(|| {
                    for i in 0..n as u32 {
                        let jpeg =
                            render_page_jpeg(black_box(&doc), black_box(i), black_box(1200))
                                .expect("render failed");
                        black_box(jpeg);
                    }
                });
            },
        );
    }
    group.finish();
}

criterion_group!(
    benches,
    bench_rasterise,
    bench_rgba_to_rgb,
    bench_encode_bmp,
    bench_encode_jpeg,
    bench_full_pipeline,
    bench_page_throughput,
);
criterion_main!(benches);
