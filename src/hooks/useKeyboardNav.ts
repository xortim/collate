import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useAppStore } from "@/store";
import type { PageViewerHandle } from "@/components/PageViewer";

interface Options {
  pageViewerRef: RefObject<PageViewerHandle | null>;
  sidebarRef: RefObject<HTMLElement | null>;
}

function isInputFocused(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.contentEditable === "true"
  );
}

export function useKeyboardNav({ pageViewerRef, sidebarRef }: Options): void {
  const lastGRef = useRef<number>(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isInputFocused(e.target)) return;

      const state = useAppStore.getState();
      if (state.activeDocId === null) return;

      const tab = state.tabs.find((t) => t.docId === state.activeDocId);
      if (!tab || tab.pageCount === 0) return;

      const { activePage } = state;
      const pageCount = tab.pageCount;
      const sidebarFocused =
        sidebarRef.current != null &&
        sidebarRef.current.contains(document.activeElement);

      // gg — first page
      if (e.key === "g" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const now = Date.now();
        if (now - lastGRef.current <= 500) {
          e.preventDefault();
          pageViewerRef.current?.scrollToPage(0);
          lastGRef.current = 0;
        } else {
          lastGRef.current = now;
        }
        return;
      }

      // G — last page
      if (e.key === "G" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        pageViewerRef.current?.scrollToPage(pageCount - 1);
        return;
      }

      // j — next page
      if (e.key === "j" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        pageViewerRef.current?.scrollToPage(Math.min(activePage + 1, pageCount - 1));
        return;
      }

      // k — previous page
      if (e.key === "k" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        pageViewerRef.current?.scrollToPage(Math.max(activePage - 1, 0));
        return;
      }

      // J (Shift+j) — expand selection down (sidebar only)
      if (e.key === "J" && !e.metaKey && !e.ctrlKey) {
        if (!sidebarFocused) return;
        e.preventDefault();
        const anchor = state.selectionAnchor ?? activePage;
        const cursor = Math.min(activePage + 1, pageCount - 1);
        state.setActivePage(cursor);
        state.selectPageRange(anchor, cursor);
        return;
      }

      // K (Shift+k) — expand selection up (sidebar only)
      if (e.key === "K" && !e.metaKey && !e.ctrlKey) {
        if (!sidebarFocused) return;
        e.preventDefault();
        const anchor = state.selectionAnchor ?? activePage;
        const cursor = Math.max(activePage - 1, 0);
        state.setActivePage(cursor);
        state.selectPageRange(anchor, cursor);
        return;
      }

      // PageDown — next page
      if (e.key === "PageDown") {
        e.preventDefault();
        pageViewerRef.current?.scrollToPage(Math.min(activePage + 1, pageCount - 1));
        return;
      }

      // PageUp — previous page
      if (e.key === "PageUp") {
        e.preventDefault();
        pageViewerRef.current?.scrollToPage(Math.max(activePage - 1, 0));
        return;
      }

      // Home — first page
      if (e.key === "Home") {
        e.preventDefault();
        pageViewerRef.current?.scrollToPage(0);
        return;
      }

      // End — last page
      if (e.key === "End") {
        e.preventDefault();
        pageViewerRef.current?.scrollToPage(pageCount - 1);
        return;
      }

      // Shift+ArrowDown — expand selection down (sidebar only)
      if (e.key === "ArrowDown" && e.shiftKey && !e.metaKey && !e.ctrlKey) {
        if (!sidebarFocused) return;
        e.preventDefault();
        const anchor = state.selectionAnchor ?? activePage;
        const cursor = Math.min(activePage + 1, pageCount - 1);
        state.setActivePage(cursor);
        state.selectPageRange(anchor, cursor);
        return;
      }

      // Shift+ArrowUp — expand selection up (sidebar only)
      if (e.key === "ArrowUp" && e.shiftKey && !e.metaKey && !e.ctrlKey) {
        if (!sidebarFocused) return;
        e.preventDefault();
        const anchor = state.selectionAnchor ?? activePage;
        const cursor = Math.max(activePage - 1, 0);
        state.setActivePage(cursor);
        state.selectPageRange(anchor, cursor);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pageViewerRef, sidebarRef]);
}
