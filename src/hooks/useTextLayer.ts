import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import type { WordBox } from "@/components/TextOverlay";

interface TextLayerResponse {
  words: WordBox[];
  scanned: boolean;
}

/** Module-level cache: key is `"${docId}:${pageIndex}"`. */
const cache = new Map<string, TextLayerResponse>();

/** Clears all cached entries for a given document (call after mutations). */
export function invalidateTextLayerCache(docId: number) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${docId}:`)) {
      cache.delete(key);
    }
  }
}

/**
 * Fetches and caches the word-level text layer for a single page.
 *
 * Returns `{ words, scanned, loading }`:
 * - `words` — word boxes in normalized [0, 1] coordinates
 * - `scanned` — true when the page has no embedded text
 * - `loading` — true while the first fetch is in flight
 *
 * The result is cached so repeated renders (e.g. zoom changes) don't re-fetch.
 * Cache is invalidated when a `document-mutated` Tauri event fires for this doc.
 */
export function useTextLayer(docId: number | null, pageIndex: number) {
  const cacheKey = docId != null ? `${docId}:${pageIndex}` : null;
  const [result, setResult] = useState<TextLayerResponse>(() =>
    cacheKey && cache.has(cacheKey) ? cache.get(cacheKey)! : { words: [], scanned: false }
  );
  const [loading, setLoading] = useState(
    () => cacheKey == null || !cache.has(cacheKey)
  );

  // Track the current key so the effect cleanup can ignore stale responses.
  const keyRef = useRef(cacheKey);
  keyRef.current = cacheKey;

  useEffect(() => {
    if (docId == null) return;
    const key = `${docId}:${pageIndex}`;

    if (cache.has(key)) {
      setResult(cache.get(key)!);
      setLoading(false);
      return;
    }

    setLoading(true);

    invoke<TextLayerResponse>("get_text_layer", {
      docId,
      pageIndex,
    })
      .then((res) => {
        if (keyRef.current !== key) return; // stale
        cache.set(key, res);
        setResult(res);
        setLoading(false);
      })
      .catch(() => {
        if (keyRef.current !== key) return;
        setLoading(false);
      });
  }, [docId, pageIndex]);

  // Listen for document mutation events and invalidate the cache for this doc.
  useEffect(() => {
    if (docId == null) return;
    const unlisten = listen<number>("document-mutated", (event) => {
      if (event.payload === docId) {
        invalidateTextLayerCache(docId);
        // Re-trigger fetch by clearing local state.
        setResult({ words: [], scanned: false });
        setLoading(true);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [docId]);

  return { ...result, loading };
}
