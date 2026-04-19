use pdfium_render::prelude::*;
use serde::Serialize;

// ---------------------------------------------------------------------------
// IPC return types
// ---------------------------------------------------------------------------

/// A word-level text unit with normalized bounding box and metadata.
///
/// Coordinates are normalized to [0.0, 1.0] with top-left origin, so the
/// frontend can apply them as CSS percentages without knowing the page size
/// or zoom level.
#[derive(Serialize, Clone)]
pub struct WordBox {
    /// The word's text content.
    pub text: String,
    /// Left edge, normalized [0.0, 1.0].
    pub x: f32,
    /// Top edge, normalized [0.0, 1.0] (top-left origin).
    pub y: f32,
    /// Width, normalized [0.0, 1.0].
    pub width: f32,
    /// Height, normalized [0.0, 1.0].
    pub height: f32,
    /// True if the word text looks like a URL (http://, https://, www.).
    pub is_url: bool,
}

/// Response from `get_text_layer`.
#[derive(Serialize)]
pub struct TextLayerResponse {
    pub words: Vec<WordBox>,
    /// True when the page has no embedded text characters (scanned image page).
    pub scanned: bool,
}

/// One page's worth of search matches returned by `search_document`.
#[derive(Serialize)]
pub struct SearchMatch {
    pub page_index: u32,
    /// Indices into the words array from `get_text_layer` for this page.
    pub word_indices: Vec<usize>,
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Data carried alongside each WordBox during extraction, tracking the
/// character index range so search results can be mapped back to word indices.
struct WordData {
    word: WordBox,
    /// Index of the first character in pdfium's per-page sequence (inclusive).
    char_start: usize,
    /// Index one past the last character (exclusive).
    char_end: usize,
}

fn is_url(text: &str) -> bool {
    text.starts_with("http://") || text.starts_with("https://") || text.starts_with("www.")
}

/// Extract words from a single page, returning per-word data including char
/// index ranges. Returns `None` for the `WordData` vec when the page has no
/// text characters (i.e. it is a scanned/image-only page).
///
/// Word boundaries: consecutive non-whitespace characters form a word. Each
/// word gets a bounding box that is the union of its constituent character
/// tight bounds.
fn extract_page_words(
    doc: &PdfDocument<'_>,
    page_index: usize,
) -> Result<(Vec<WordData>, bool), String> {
    let page = doc
        .pages()
        .get(page_index as i32)
        .map_err(|e| format!("page {page_index}: {e:?}"))?;

    let page_width = page.width().value;
    let page_height = page.height().value;

    let text = page
        .text()
        .map_err(|e| format!("text layer for page {page_index}: {e:?}"))?;

    // A page with zero characters is a scanned/image-only page.
    if text.is_empty() {
        return Ok((vec![], true));
    }

    let mut words: Vec<WordData> = Vec::new();

    // Per-word accumulators.
    let mut word_chars: Vec<(char, PdfRect)> = Vec::new();
    let mut word_char_start: usize = 0;

    // Char index counter (0-based, matching pdfium's sequence order).
    let mut char_idx: usize = 0;

    let emit_word = |word_chars: &[(char, PdfRect)],
                     char_start: usize,
                     char_end: usize,
                     page_width: f32,
                     page_height: f32|
     -> WordData {
        let text: String = word_chars.iter().map(|(c, _)| *c).collect();

        // Union of all character tight bounds.
        let left: f32 = word_chars
            .iter()
            .map(|(_, r)| r.left().value)
            .fold(f32::INFINITY, f32::min);
        let right: f32 = word_chars
            .iter()
            .map(|(_, r)| r.right().value)
            .fold(f32::NEG_INFINITY, f32::max);
        let bottom: f32 = word_chars
            .iter()
            .map(|(_, r)| r.bottom().value)
            .fold(f32::INFINITY, f32::min);
        let top: f32 = word_chars
            .iter()
            .map(|(_, r)| r.top().value)
            .fold(f32::NEG_INFINITY, f32::max);

        // Convert from PDF coordinate space (bottom-left origin, points) to
        // normalized CSS space (top-left origin, 0.0–1.0).
        //
        // PDF Y-axis: 0 = bottom, page_height = top.
        // CSS Y-axis: 0 = top,    1.0        = bottom.
        //
        // So the CSS top of the character box is (1 - pdf_top / page_height).
        let x = (left / page_width).clamp(0.0, 1.0);
        let y = (1.0 - top / page_height).clamp(0.0, 1.0);
        let w = ((right - left) / page_width).clamp(0.0, 1.0);
        let h = ((top - bottom) / page_height).clamp(0.0, 1.0);
        let is_url = is_url(&text);

        WordData {
            word: WordBox {
                text,
                x,
                y,
                width: w,
                height: h,
                is_url,
            },
            char_start,
            char_end,
        }
    };

    for ch in text.chars().iter() {
        let c = ch.unicode_char().unwrap_or('\0');

        if c == '\0' || c.is_whitespace() {
            if !word_chars.is_empty() {
                words.push(emit_word(
                    &word_chars,
                    word_char_start,
                    char_idx,
                    page_width,
                    page_height,
                ));
                word_chars.clear();
            }
        } else {
            if word_chars.is_empty() {
                word_char_start = char_idx;
            }
            // Skip chars whose bounds pdfium can't compute (e.g. generated spacing chars).
            if let Ok(bounds) = ch.tight_bounds() {
                // Only include characters with non-degenerate bounds.
                if bounds.right().value > bounds.left().value
                    && bounds.top().value >= bounds.bottom().value
                {
                    word_chars.push((c, bounds));
                }
            }
        }
        char_idx += 1;
    }

    // Emit the last word if the text doesn't end with whitespace.
    if !word_chars.is_empty() {
        words.push(emit_word(
            &word_chars,
            word_char_start,
            char_idx,
            page_width,
            page_height,
        ));
    }

    Ok((words, false))
}

// ---------------------------------------------------------------------------
// Public API called by tauri::command wrappers in lib.rs
// ---------------------------------------------------------------------------

/// Extract the word-level text layer for a single page.
///
/// Returns `scanned: true` and an empty `words` vec when the page has no
/// embedded text (i.e. it is a scanned/image page).
pub fn get_text_layer_impl(
    doc: &PdfDocument<'_>,
    page_index: usize,
) -> Result<TextLayerResponse, String> {
    let (word_data, scanned) = extract_page_words(doc, page_index)?;

    Ok(TextLayerResponse {
        scanned,
        words: word_data.into_iter().map(|wd| wd.word).collect(),
    })
}

/// Search for `query` across all pages of a document.
///
/// Returns one `SearchMatch` per page that contains at least one match.
/// Each match carries the indices of words (from `get_text_layer`) whose
/// character range overlaps the match position.
///
/// Matching is case-insensitive. Multi-word queries highlight all words
/// whose character range is touched by the match span.
pub fn search_document_impl(
    doc: &PdfDocument<'_>,
    page_count: usize,
    query: &str,
) -> Result<Vec<SearchMatch>, String> {
    if query.is_empty() {
        return Ok(vec![]);
    }

    let query_chars: Vec<char> = query.to_lowercase().chars().collect();
    let mut results: Vec<SearchMatch> = Vec::new();

    for page_index in 0..page_count {
        let (word_data, scanned) = extract_page_words(doc, page_index)?;
        if scanned || word_data.is_empty() {
            continue;
        }

        // Build a flat character sequence from the word data so we can do
        // case-insensitive substring search without calling into pdfium's
        // search API (which would require mapping segment bounds back to word
        // indices). We reconstruct the same char-index space used during
        // extraction by concatenating word texts, keeping whitespace gaps.
        //
        // Since word_data.char_start/char_end are indices into pdfium's
        // per-page character sequence (including whitespace between words),
        // we use them directly for overlap detection.
        let page = doc
            .pages()
            .get(page_index as i32)
            .map_err(|e| format!("page {page_index}: {e:?}"))?;
        let text_obj = page
            .text()
            .map_err(|e| format!("text layer for page {page_index}: {e:?}"))?;
        let all_chars: Vec<char> = text_obj.all().to_lowercase().chars().collect();

        // Find all match start positions (in char units) using a sliding window.
        let qlen = query_chars.len();
        let mut match_ranges: Vec<(usize, usize)> = Vec::new();
        if qlen <= all_chars.len() {
            let mut i = 0;
            while i <= all_chars.len() - qlen {
                if all_chars[i..i + qlen] == query_chars[..] {
                    match_ranges.push((i, i + qlen));
                    i += 1;
                } else {
                    i += 1;
                }
            }
        }

        if match_ranges.is_empty() {
            continue;
        }

        // For each match range, find which word indices overlap it.
        let mut word_index_set: std::collections::HashSet<usize> =
            std::collections::HashSet::new();
        for (match_start, match_end) in &match_ranges {
            for (idx, wd) in word_data.iter().enumerate() {
                // Overlap condition: word's range starts before match ends AND
                // word's range ends after match starts.
                if wd.char_start < *match_end && wd.char_end > *match_start {
                    word_index_set.insert(idx);
                }
            }
        }

        if !word_index_set.is_empty() {
            let mut word_indices: Vec<usize> = word_index_set.into_iter().collect();
            word_indices.sort_unstable();
            results.push(SearchMatch {
                page_index: page_index as u32,
                word_indices,
            });
        }
    }

    Ok(results)
}

// ---------------------------------------------------------------------------
// Tests — unit-level (no pdfium required)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_url_detects_https() {
        assert!(is_url("https://example.com"));
    }

    #[test]
    fn is_url_detects_http() {
        assert!(is_url("http://example.com"));
    }

    #[test]
    fn is_url_detects_www() {
        assert!(is_url("www.example.com"));
    }

    #[test]
    fn is_url_rejects_plain_words() {
        assert!(!is_url("hello"));
        assert!(!is_url("MOTION"));
        assert!(!is_url("court.order"));
    }
}
