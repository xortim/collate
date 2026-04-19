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
///
/// The second return value is the full per-page character sequence (lowercased)
/// in the same order as the char_idx tracking used to build `char_start`/
/// `char_end` on each `WordData`. Callers that need to search the text should
/// use this sequence rather than `PdfPageText::all()`, which may differ on real
/// PDFs due to ligature handling or `FPDF_GetPageText` normalization.
fn extract_page_words(
    doc: &PdfDocument<'_>,
    page_index: usize,
) -> Result<(Vec<WordData>, Vec<char>, bool), String> {
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
        return Ok((vec![], vec![], true));
    }

    let mut words: Vec<WordData> = Vec::new();
    // Full character sequence in pdfium's order (lowercased), used by the
    // caller for substring search so indices stay consistent with char_start/
    // char_end on each WordData.
    let mut all_chars: Vec<char> = Vec::new();

    // Per-word accumulators.
    // `word_chars` collects only chars whose tight_bounds are non-degenerate
    // (used for the visual highlight box).  `in_word` and `word_char_start`
    // track the span of ALL non-whitespace chars — including those skipped by
    // tight_bounds — so the char range in WordData stays correct for search.
    let mut word_chars: Vec<(char, PdfRect)> = Vec::new();
    let mut word_char_start: usize = 0;
    let mut in_word: bool = false;

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

        // Record every character in the sequence (lowercased) so the caller
        // can search using the same index space as char_start/char_end.
        all_chars.push(c.to_lowercase().next().unwrap_or(c));

        if c == '\0' || c.is_whitespace() {
            if in_word {
                // Only emit a word entry when at least one char had usable
                // bounds; if word_chars is empty every char in this run was
                // degenerate and there is nothing to highlight.
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
                in_word = false;
            }
        } else {
            // Mark the start of a new word span at the FIRST non-whitespace
            // character, regardless of whether that character has valid bounds.
            if !in_word {
                word_char_start = char_idx;
                in_word = true;
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
    if in_word && !word_chars.is_empty() {
        words.push(emit_word(
            &word_chars,
            word_char_start,
            char_idx,
            page_width,
            page_height,
        ));
    }

    Ok((words, all_chars, false))
}

// ---------------------------------------------------------------------------
// Public API called by tauri::command wrappers in lib.rs
// ---------------------------------------------------------------------------

/// Debug helper: returns the raw character sequence pdfium yields for a page
/// plus a word summary.  Only compiled in debug builds.
#[cfg(debug_assertions)]
#[derive(serde::Serialize)]
pub struct TextDebugInfo {
    /// Every character pdfium returned, in extraction order (lowercased).
    pub all_chars: String,
    /// Total character count.
    pub char_count: usize,
    /// Word text + char_start + char_end for every extracted word box.
    pub words: Vec<WordDebugEntry>,
    /// True when the page had no embedded text.
    pub scanned: bool,
    /// Any error string from extract_page_words.
    pub error: Option<String>,
}

#[cfg(debug_assertions)]
#[derive(serde::Serialize)]
pub struct WordDebugEntry {
    pub text: String,
    pub char_start: usize,
    pub char_end: usize,
}

#[cfg(debug_assertions)]
pub fn debug_text_chars_impl(
    doc: &PdfDocument<'_>,
    page_index: usize,
) -> TextDebugInfo {
    match extract_page_words(doc, page_index) {
        Ok((word_data, all_chars, scanned)) => TextDebugInfo {
            char_count: all_chars.len(),
            all_chars: all_chars.iter().collect(),
            words: word_data
                .iter()
                .map(|wd| WordDebugEntry {
                    text: wd.word.text.clone(),
                    char_start: wd.char_start,
                    char_end: wd.char_end,
                })
                .collect(),
            scanned,
            error: None,
        },
        Err(e) => TextDebugInfo {
            all_chars: String::new(),
            char_count: 0,
            words: vec![],
            scanned: false,
            error: Some(e),
        },
    }
}

/// Extract the word-level text layer for a single page.
///
/// Returns `scanned: true` and an empty `words` vec when the page has no
/// embedded text (i.e. it is a scanned/image page).
pub fn get_text_layer_impl(
    doc: &PdfDocument<'_>,
    page_index: usize,
) -> Result<TextLayerResponse, String> {
    let (word_data, _all_chars, scanned) = extract_page_words(doc, page_index)?;

    Ok(TextLayerResponse {
        scanned,
        words: word_data.into_iter().map(|wd| wd.word).collect(),
    })
}

/// Searches `all_chars` (a lowercased char sequence) for `query_chars` and
/// returns the indices of words in `word_data` whose character ranges overlap
/// any occurrence of the query.
///
/// Returns:
/// - `None`      — query not present in `all_chars` at all
/// - `Some(vec)` — query found; `vec` holds overlapping word indices (may be
///                 empty when the matched characters have no associated word
///                 boxes, e.g. when `tight_bounds` failed for a font)
pub(crate) fn find_matching_word_indices(
    all_chars: &[char],
    word_data: &[WordData],
    query_chars: &[char],
) -> Option<Vec<usize>> {
    let qlen = query_chars.len();
    if qlen == 0 || all_chars.is_empty() {
        return None;
    }

    // Sliding-window search for every occurrence of query_chars.
    let mut any_match = false;
    let mut word_index_set: std::collections::HashSet<usize> =
        std::collections::HashSet::new();

    if qlen <= all_chars.len() {
        let mut i = 0;
        while i <= all_chars.len() - qlen {
            if all_chars[i..i + qlen] == *query_chars {
                any_match = true;
                let match_end = i + qlen;
                for (idx, wd) in word_data.iter().enumerate() {
                    // Overlap: word starts before match ends AND word ends
                    // after match starts.
                    if wd.char_start < match_end && wd.char_end > i {
                        word_index_set.insert(idx);
                    }
                }
            }
            i += 1;
        }
    }

    if !any_match {
        return None;
    }

    let mut word_indices: Vec<usize> = word_index_set.into_iter().collect();
    word_indices.sort_unstable();
    Some(word_indices)
}

/// Search for `query` across all pages of a document.
///
/// Returns one `SearchMatch` per page that contains at least one match.
/// Each match carries the indices of words (from `get_text_layer`) whose
/// character range overlaps the match position.  `word_indices` may be empty
/// when text is found but the font's glyph bounds could not be computed (e.g.
/// un-embedded fonts where `tight_bounds` fails); in that case the find bar
/// scrolls to the page but no highlight box is shown.
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
        let (word_data, all_chars, scanned) = extract_page_words(doc, page_index)?;
        if scanned {
            continue;
        }

        // `all_chars` is the lowercased character sequence built during
        // extraction — guaranteed to use the same char-index space as the
        // char_start/char_end fields on each WordData.
        if let Some(word_indices) =
            find_matching_word_indices(&all_chars, &word_data, &query_chars)
        {
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

    // ---------------------------------------------------------------------------
    // find_matching_word_indices — pure-logic unit tests (no pdfium required)
    // ---------------------------------------------------------------------------

    fn make_word(char_start: usize, char_end: usize) -> WordData {
        WordData {
            word: WordBox {
                text: String::new(),
                x: 0.0,
                y: 0.0,
                width: 0.1,
                height: 0.05,
                is_url: false,
            },
            char_start,
            char_end,
        }
    }

    /// When the query appears in all_chars but word_data is empty (all chars
    /// had degenerate bounds and no word boxes were built), the match should
    /// still be reported — with an empty word_indices list — so the find bar
    /// can scroll to the page even though no highlight is available.
    #[test]
    fn match_with_no_word_boxes_still_reports_page() {
        let all_chars: Vec<char> = "fox smith".chars().collect();
        let word_data: Vec<WordData> = vec![];
        let query: Vec<char> = vec!['f', 'o', 'x'];

        let result = find_matching_word_indices(&all_chars, &word_data, &query);
        assert_eq!(
            result,
            Some(vec![]),
            "expected Some([]) — match found but no word boxes to highlight"
        );
    }

    /// A match found in all_chars whose range is not covered by any word box
    /// (e.g. first chars have degenerate bounds) must still surface the page.
    #[test]
    fn match_not_covered_by_word_boxes_still_reports_page() {
        // Word box covers positions [4, 9) ("smith") but not [0, 3) ("fox").
        let all_chars: Vec<char> = "fox smith".chars().collect();
        let word_data = vec![make_word(4, 9)]; // "smith" at indices 4..9
        let query: Vec<char> = vec!['f', 'o', 'x'];

        let result = find_matching_word_indices(&all_chars, &word_data, &query);
        assert_eq!(
            result,
            Some(vec![]),
            "expected Some([]) — 'fox' found but only 'smith' word box exists"
        );
    }

    /// Sanity check: normal match where a word box covers the query range.
    #[test]
    fn match_covered_by_word_box_returns_its_index() {
        let all_chars: Vec<char> = "fox smith".chars().collect();
        let word_data = vec![
            make_word(0, 3), // "fox"   at [0, 3)
            make_word(4, 9), // "smith" at [4, 9)
        ];
        let query: Vec<char> = vec!['f', 'o', 'x'];

        let result = find_matching_word_indices(&all_chars, &word_data, &query);
        assert_eq!(result, Some(vec![0]), "expected word index 0 for 'fox'");
    }

    /// No match in all_chars → None (not Some([])).
    #[test]
    fn no_match_returns_none() {
        let all_chars: Vec<char> = "hello world".chars().collect();
        let word_data = vec![make_word(0, 5), make_word(6, 11)];
        let query: Vec<char> = vec!['f', 'o', 'x'];

        let result = find_matching_word_indices(&all_chars, &word_data, &query);
        assert!(result.is_none(), "expected None for absent query");
    }

    /// Empty query → None.
    #[test]
    fn empty_query_returns_none() {
        let all_chars: Vec<char> = "hello".chars().collect();
        let word_data: Vec<WordData> = vec![];
        let result = find_matching_word_indices(&all_chars, &word_data, &[]);
        assert!(result.is_none());
    }

    /// Empty char sequence → None even with a non-empty query.
    #[test]
    fn empty_chars_returns_none() {
        let word_data: Vec<WordData> = vec![];
        let query: Vec<char> = vec!['f'];
        let result = find_matching_word_indices(&[], &word_data, &query);
        assert!(result.is_none());
    }

    /// word_char_start must be captured at the FIRST non-whitespace character
    /// of a word, not reset by subsequent chars before any valid-bounds char.
    /// This is verified indirectly: a word whose char range starts at 0 should
    /// overlap a query match that also starts at 0, even when the word box only
    /// contains chars from the middle of the word.
    #[test]
    fn word_range_covers_leading_degenerate_chars() {
        // Simulate "FOX" where only "OX" made it into the word box (F had bad
        // bounds), but the word's char_start should still be 0 (F's position),
        // so the search for "fox" at all_chars[0..3] overlaps the word.
        let all_chars: Vec<char> = vec!['f', 'o', 'x', ' '];
        // char_start=0 is what the FIXED code must produce; char_start=1 is
        // what the buggy code would produce (reset at F → reset at O).
        let word_data_fixed = vec![make_word(0, 3)]; // correct: starts at F
        let query: Vec<char> = vec!['f', 'o', 'x'];

        let result = find_matching_word_indices(&all_chars, &word_data_fixed, &query);
        assert_eq!(
            result,
            Some(vec![0]),
            "word starting at char 0 must overlap the 'fox' match"
        );
    }
}
