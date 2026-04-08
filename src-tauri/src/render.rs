use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, RgbImage, RgbaImage};
use pdfium_render::prelude::*;

// ---------------------------------------------------------------------------
// Pipeline stages
// ---------------------------------------------------------------------------

/// Stage 1 — rasterise a PDF page to raw RGBA bytes via pdfium.
///
/// Returns `(bytes, width_px, height_px)`. The bytes are RGBA (4 channels,
/// 1 byte each). set_reverse_byte_order makes pdfium write RGBA directly so
/// no channel-swap is needed downstream.
///
/// This stage requires the pdfium shared library and cannot be unit-tested
/// without it — cover it via the benchmarks and integration tests instead.
///
/// Rust note: PdfPage<'_> borrows from the PdfDocument it came from. The
/// lifetime tells the compiler "this page cannot outlive its document". We
/// accept a reference here (&PdfPage) rather than taking ownership, because
/// the document still needs to live somewhere while we render.
fn rasterise(page: &PdfPage<'_>, width: u32) -> Result<(Vec<u8>, u32, u32), String> {
    let config = PdfRenderConfig::new()
        .set_target_width(width as i32)
        .set_reverse_byte_order(true);

    let bitmap = page
        .render_with_config(&config)
        .map_err(|e| format!("pdfium render failed: {e:?}"))?;

    let w = bitmap.width() as u32;
    let h = bitmap.height() as u32;

    // as_raw_bytes() returns an owned Vec<u8>, breaking us out of pdfium's
    // lifetime system. Everything downstream is plain Rust.
    Ok((bitmap.as_raw_bytes(), w, h))
}

/// Stage 2 — convert raw RGBA bytes to an RGB image, dropping the alpha channel.
///
/// PDF page backgrounds are always opaque white after pdfium renders them, so
/// discarding alpha is safe. JPEG has no alpha channel, so this conversion is
/// required before encoding.
///
/// This stage has no pdfium dependency and is fully unit-testable.
pub fn rgba_to_rgb(raw: Vec<u8>, width: u32, height: u32) -> Result<RgbImage, String> {
    let rgba = RgbaImage::from_raw(width, height, raw)
        .ok_or_else(|| "RGBA buffer too small for declared dimensions".to_string())?;
    Ok(DynamicImage::ImageRgba8(rgba).to_rgb8())
}

/// Stage 3 — encode an RGB image as JPEG bytes at the given quality (0–100).
///
/// Quality 90 is visually lossless for PDF content at normal viewing scale.
/// JPEG encodes in ~20 ms vs ~300 ms for PNG DEFLATE at 1200 px width.
///
/// This stage has no pdfium dependency and is fully unit-testable.
pub fn encode_jpeg(rgb: &RgbImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut buf: Vec<u8> = Vec::with_capacity(200_000);
    JpegEncoder::new_with_quality(&mut std::io::Cursor::new(&mut buf), quality)
        .encode_image(rgb)
        .map_err(|e| format!("JPEG encoding failed: {e}"))?;
    Ok(buf)
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/// Rasterise a single PDF page to raw RGBA bytes via pdfium.
///
/// Returns `(bytes, width_px, height_px)`. Exposed separately from the full
/// pipeline so benchmarks can measure the pdfium stage in isolation.
pub fn rasterise_page(
    doc: &PdfDocument<'_>,
    page_index: u32,
    width: u32,
) -> Result<(Vec<u8>, u32, u32), String> {
    let page = doc
        .pages()
        .get(page_index as i32)
        .map_err(|e| format!("Failed to get page {page_index}: {e:?}"))?;
    rasterise(&page, width)
}

/// Render a single PDF page and return JPEG bytes.
///
/// Orchestrates the three-stage pipeline: rasterise → convert → encode.
/// Exposed as `pub` so benchmarks can call it without a Tauri runtime.
pub fn render_page_jpeg(
    doc: &PdfDocument<'_>,
    page_index: u32,
    width: u32,
) -> Result<Vec<u8>, String> {
    let page = doc
        .pages()
        .get(page_index as i32)
        .map_err(|e| format!("Failed to get page {page_index}: {e:?}"))?;

    let (raw, w, h) = rasterise(&page, width)?;
    let rgb = rgba_to_rgb(raw, w, h)?;
    encode_jpeg(&rgb, 90)
}

/// Encode raw RGBA bytes as a 24-bit BMP image.
///
/// BMP is uncompressed — encoding is a 54-byte header write plus an
/// RGBA→BGR channel swap and 4-byte row-alignment padding. No codec,
/// no DCT, no DEFLATE. Typical cost: ~0.3 ms at 1200 px.
///
/// Using a negative height in the DIB header makes rows top-to-bottom,
/// matching pdfium's output order — no row flip needed.
///
/// This is the preferred output format for the collate:// protocol because
/// <img src> loads bypass CORS entirely (unlike fetch()), and BMP is
/// supported natively by every browser WebKit engine.
///
/// # Panics
///
/// Panics if `rgba.len() < width * height * 4`. Every pixel requires 4 bytes
/// (R, G, B, A). The caller is responsible for ensuring the buffer matches
/// the declared dimensions — this invariant is always satisfied when `rgba`
/// comes from `rasterise_page`.
pub fn encode_bmp(rgba: &[u8], width: u32, height: u32) -> Vec<u8> {
    let required = (width as usize) * (height as usize) * 4;
    assert!(
        rgba.len() >= required,
        "RGBA buffer too small: need {required} bytes for {width}×{height}, got {}",
        rgba.len()
    );

    // BMP rows must be padded to a 4-byte boundary.
    let row_stride = (width as usize * 3 + 3) & !3;
    let pixel_data_size = row_stride * height as usize;
    let file_size = 54 + pixel_data_size;

    let mut buf = Vec::with_capacity(file_size);

    // File header — 14 bytes
    buf.extend_from_slice(b"BM");
    buf.extend_from_slice(&(file_size as u32).to_le_bytes());
    buf.extend_from_slice(&0u32.to_le_bytes()); // reserved
    buf.extend_from_slice(&54u32.to_le_bytes()); // offset to pixel data

    // BITMAPINFOHEADER — 40 bytes
    buf.extend_from_slice(&40u32.to_le_bytes()); // header size
    buf.extend_from_slice(&width.to_le_bytes());
    buf.extend_from_slice(&(-(height as i32)).to_le_bytes()); // negative = top-down
    buf.extend_from_slice(&1u16.to_le_bytes()); // colour planes
    buf.extend_from_slice(&24u16.to_le_bytes()); // bits per pixel (BGR, no alpha)
    buf.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB (no compression)
    buf.extend_from_slice(&(pixel_data_size as u32).to_le_bytes());
    buf.extend_from_slice(&2835u32.to_le_bytes()); // h pixels/metre (~72 dpi)
    buf.extend_from_slice(&2835u32.to_le_bytes()); // v pixels/metre
    buf.extend_from_slice(&0u32.to_le_bytes()); // colours in table
    buf.extend_from_slice(&0u32.to_le_bytes()); // important colours

    // Pixel data — RGBA → BGR, rows padded to 4-byte alignment
    let padding = row_stride - width as usize * 3;
    for row in 0..height as usize {
        for col in 0..width as usize {
            let i = (row * width as usize + col) * 4;
            buf.push(rgba[i + 2]); // B
            buf.push(rgba[i + 1]); // G
            buf.push(rgba[i]); // R
        }
        buf.extend(std::iter::repeat_n(0u8, padding));
    }

    buf
}

// ---------------------------------------------------------------------------
// Tests — cover the pure stages only (no pdfium library required)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn white_rgba(width: u32, height: u32) -> Vec<u8> {
        vec![255u8; (width * height * 4) as usize]
    }

    #[test]
    fn rgba_to_rgb_drops_alpha_channel() {
        let rgb = rgba_to_rgb(white_rgba(2, 2), 2, 2).unwrap();
        assert_eq!(rgb.width(), 2);
        assert_eq!(rgb.height(), 2);
        assert_eq!(rgb.len(), 12); // 3 channels × 4 pixels
        assert!(rgb.pixels().all(|p| p.0 == [255, 255, 255]));
    }

    #[test]
    fn rgba_to_rgb_rejects_undersized_buffer() {
        let bad = vec![0u8; 3]; // too small for a 2×2 image
        assert!(rgba_to_rgb(bad, 2, 2).is_err());
    }

    #[test]
    fn encode_jpeg_produces_valid_jpeg_marker() {
        let rgb = rgba_to_rgb(white_rgba(64, 64), 64, 64).unwrap();
        let jpeg = encode_jpeg(&rgb, 90).unwrap();
        // Every valid JPEG starts with the SOI marker FF D8
        assert!(jpeg.starts_with(&[0xFF, 0xD8]), "missing JPEG SOI marker");
        assert!(!jpeg.is_empty());
    }

    #[test]
    fn encode_jpeg_respects_quality_range() {
        let rgb = rgba_to_rgb(white_rgba(64, 64), 64, 64).unwrap();
        // Both extremes should succeed without panicking
        assert!(encode_jpeg(&rgb, 1).is_ok());
        assert!(encode_jpeg(&rgb, 100).is_ok());
    }

    #[test]
    fn encode_bmp_produces_valid_bmp_header() {
        let bmp = encode_bmp(&white_rgba(4, 4), 4, 4);
        // BM signature
        assert_eq!(&bmp[0..2], b"BM");
        // File size matches actual buffer length
        let reported_size = u32::from_le_bytes(bmp[2..6].try_into().unwrap());
        assert_eq!(reported_size as usize, bmp.len());
        // Pixel data offset is 54 (14 + 40)
        let pixel_offset = u32::from_le_bytes(bmp[10..14].try_into().unwrap());
        assert_eq!(pixel_offset, 54);
        // 24 bits per pixel
        let bpp = u16::from_le_bytes(bmp[28..30].try_into().unwrap());
        assert_eq!(bpp, 24);
    }

    #[test]
    fn encode_bmp_channel_order_is_bgr() {
        // Single red pixel: R=255, G=0, B=0, A=255
        let rgba = vec![255u8, 0, 0, 255];
        let bmp = encode_bmp(&rgba, 1, 1);
        // Pixel data starts at offset 54; BMP stores BGR
        assert_eq!(bmp[54], 0); // B
        assert_eq!(bmp[55], 0); // G
        assert_eq!(bmp[56], 255); // R
    }

    #[test]
    #[should_panic]
    fn encode_bmp_panics_on_undersized_buffer() {
        // 3 bytes is too small for a 1×1 RGBA image (needs 4)
        encode_bmp(&[0u8; 3], 1, 1);
    }
}
