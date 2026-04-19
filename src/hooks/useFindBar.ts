import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";

export interface SearchMatch {
  page_index: number;
  word_indices: number[];
}

interface FindBarState {
  open: boolean;
  query: string;
  matches: SearchMatch[];
  currentMatchIndex: number;
}

/**
 * Manages find-in-document state and search invocation.
 *
 * Returns:
 * - `state` — current find bar state
 * - `openFind()` — open the find bar (call on Cmd+F)
 * - `closeFind()` — close and reset
 * - `setQuery(q)` — update query, triggers a debounced search
 * - `next()` / `prev()` — advance match index and scroll to the page
 * - `highlightsForPage(pageIndex)` — Set<number> of word indices to highlight on that page
 */
export function useFindBar(docId: number | null, scrollToPage: (index: number) => void) {
  const [state, setState] = useState<FindBarState>({
    open: false,
    query: "",
    matches: [],
    currentMatchIndex: 0,
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (query: string) => {
      if (!docId || query.trim() === "") {
        setState((s) => ({ ...s, matches: [], currentMatchIndex: 0 }));
        return;
      }
      try {
        const matches = await invoke<SearchMatch[]>("search_document", { docId, query });
        setState((s) => ({ ...s, matches, currentMatchIndex: 0 }));
        // Scroll to the first match page if any.
        if (matches.length > 0) {
          scrollToPage(matches[0].page_index);
        }
      } catch {
        setState((s) => ({ ...s, matches: [], currentMatchIndex: 0 }));
      }
    },
    [docId, scrollToPage]
  );

  const setQuery = useCallback(
    (query: string) => {
      setState((s) => ({ ...s, query }));
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(query), 200);
    },
    [search]
  );

  const openFind = useCallback(() => {
    setState((s) => ({ ...s, open: true }));
  }, []);

  const closeFind = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setState({ open: false, query: "", matches: [], currentMatchIndex: 0 });
  }, []);

  const next = useCallback(() => {
    setState((s) => {
      if (s.matches.length === 0) return s;
      const nextIdx = (s.currentMatchIndex + 1) % s.matches.length;
      scrollToPage(s.matches[nextIdx].page_index);
      return { ...s, currentMatchIndex: nextIdx };
    });
  }, [scrollToPage]);

  const prev = useCallback(() => {
    setState((s) => {
      if (s.matches.length === 0) return s;
      const prevIdx = (s.currentMatchIndex - 1 + s.matches.length) % s.matches.length;
      scrollToPage(s.matches[prevIdx].page_index);
      return { ...s, currentMatchIndex: prevIdx };
    });
  }, [scrollToPage]);

  /** Returns a Set of word indices to highlight on the given page. */
  const highlightsForPage = useCallback(
    (pageIndex: number): Set<number> => {
      const match = state.matches.find((m) => m.page_index === pageIndex);
      return match ? new Set(match.word_indices) : new Set();
    },
    [state.matches]
  );

  return {
    state,
    openFind,
    closeFind,
    setQuery,
    next,
    prev,
    highlightsForPage,
  };
}
