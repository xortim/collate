import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKeyboardNav } from "./useKeyboardNav";
import { useAppStore } from "@/store";
import type { DocumentManifest } from "@/types";

// Minimal tab fixture
const MANIFEST: DocumentManifest = {
  doc_id: 1,
  filename: "test.pdf",
  path: "/test.pdf",
  page_count: 10,
  page_sizes: [],
  can_undo: false,
  can_redo: false,
};

function fireKey(key: string, extra: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...extra }));
}

function makeRefs(sidebarEl?: HTMLElement | null) {
  const scrollToPage = vi.fn();
  const pageViewerRef = { current: { scrollToPage } } as any;
  const sidebarRef = { current: sidebarEl ?? null } as any;
  return { scrollToPage, pageViewerRef, sidebarRef };
}

beforeEach(() => {
  useAppStore.setState({
    tabs: [],
    activeDocId: null,
    docViewStates: new Map(),
    activePage: 0,
    zoom: 75,
    zoomMode: "manual",
    selectedPages: new Set(),
    isDirty: false,
    selectionAnchor: null,
  });
  useAppStore.getState().addTab(MANIFEST);
  useAppStore.setState({ activePage: 5 }); // start mid-document
});

afterEach(() => {
  vi.useRealTimers();
});

describe("page navigation — no document open", () => {
  it("does not call scrollToPage when activeDocId is null", () => {
    useAppStore.setState({ activeDocId: null });
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("j");
    expect(scrollToPage).not.toHaveBeenCalled();
  });

  it("does not call scrollToPage when pageCount is 0", () => {
    useAppStore.setState({
      tabs: [{ ...useAppStore.getState().tabs[0], pageCount: 0 }],
    });
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("j");
    expect(scrollToPage).not.toHaveBeenCalled();
  });
});

describe("page navigation — input guard", () => {
  it("does not fire when target is an <input>", () => {
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    const input = document.createElement("input");
    document.body.appendChild(input);
    // Dispatch from the input so e.target is naturally set to it and it bubbles to window
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    expect(scrollToPage).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});

describe("j / PageDown — next page", () => {
  it("j scrolls to activePage + 1", () => {
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("j");
    expect(scrollToPage).toHaveBeenCalledWith(6);
  });

  it("PageDown scrolls to activePage + 1", () => {
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("PageDown");
    expect(scrollToPage).toHaveBeenCalledWith(6);
  });

  it("j clamps at last page", () => {
    useAppStore.setState({ activePage: 9 }); // last page (pageCount=10)
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("j");
    expect(scrollToPage).toHaveBeenCalledWith(9);
  });
});

describe("k / PageUp — previous page", () => {
  it("k scrolls to activePage - 1", () => {
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("k");
    expect(scrollToPage).toHaveBeenCalledWith(4);
  });

  it("PageUp scrolls to activePage - 1", () => {
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("PageUp");
    expect(scrollToPage).toHaveBeenCalledWith(4);
  });

  it("k clamps at first page", () => {
    useAppStore.setState({ activePage: 0 });
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("k");
    expect(scrollToPage).toHaveBeenCalledWith(0);
  });
});

describe("G / End — last page", () => {
  it("G jumps to last page", () => {
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("G");
    expect(scrollToPage).toHaveBeenCalledWith(9);
  });

  it("End jumps to last page", () => {
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("End");
    expect(scrollToPage).toHaveBeenCalledWith(9);
  });
});

describe("Home — first page", () => {
  it("Home jumps to first page", () => {
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("Home");
    expect(scrollToPage).toHaveBeenCalledWith(0);
  });
});

describe("gg — first page", () => {
  it("two g presses within 500ms jump to first page", () => {
    vi.useFakeTimers();
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("g");
    vi.advanceTimersByTime(400);
    fireKey("g");
    expect(scrollToPage).toHaveBeenCalledWith(0);
  });

  it("two g presses more than 500ms apart do not jump", () => {
    vi.useFakeTimers();
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("g");
    vi.advanceTimersByTime(501);
    fireKey("g");
    expect(scrollToPage).not.toHaveBeenCalled();
  });

  it("single g press does not jump", () => {
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    fireKey("g");
    expect(scrollToPage).not.toHaveBeenCalled();
  });
});

describe("selection expansion — sidebar guard", () => {
  function makeSidebarSetup() {
    const sidebarEl = document.createElement("div");
    document.body.appendChild(sidebarEl);
    const child = document.createElement("button");
    child.setAttribute("tabindex", "0");
    sidebarEl.appendChild(child);
    child.focus();
    return { sidebarEl, cleanup: () => document.body.removeChild(sidebarEl) };
  }

  it("J (Shift+j) does not fire when sidebar not focused", () => {
    const { pageViewerRef, sidebarRef } = makeRefs(null);
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    useAppStore.setState({ selectionAnchor: 5 });
    fireKey("J");
    expect(useAppStore.getState().selectedPages.size).toBe(0);
  });

  it("J (Shift+j) expands selection down when sidebar focused", () => {
    const { sidebarEl, cleanup } = makeSidebarSetup();
    const { pageViewerRef, sidebarRef } = makeRefs(sidebarEl);
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    useAppStore.setState({ activePage: 5, selectionAnchor: 5 });
    fireKey("J");
    const pages = [...useAppStore.getState().selectedPages].sort((a, b) => a - b);
    expect(pages).toEqual([5, 6]);
    expect(useAppStore.getState().activePage).toBe(6);
    cleanup();
  });

  it("K (Shift+k) expands selection up when sidebar focused", () => {
    const { sidebarEl, cleanup } = makeSidebarSetup();
    const { pageViewerRef, sidebarRef } = makeRefs(sidebarEl);
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    useAppStore.setState({ activePage: 5, selectionAnchor: 5 });
    fireKey("K");
    const pages = [...useAppStore.getState().selectedPages].sort((a, b) => a - b);
    expect(pages).toEqual([4, 5]);
    expect(useAppStore.getState().activePage).toBe(4);
    cleanup();
  });

  it("Shift+ArrowDown expands selection down when sidebar focused", () => {
    const { sidebarEl, cleanup } = makeSidebarSetup();
    const { pageViewerRef, sidebarRef } = makeRefs(sidebarEl);
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    useAppStore.setState({ activePage: 5, selectionAnchor: 5 });
    fireKey("ArrowDown", { shiftKey: true });
    const pages = [...useAppStore.getState().selectedPages].sort((a, b) => a - b);
    expect(pages).toEqual([5, 6]);
    cleanup();
  });

  it("Shift+ArrowUp expands selection up when sidebar focused", () => {
    const { sidebarEl, cleanup } = makeSidebarSetup();
    const { pageViewerRef, sidebarRef } = makeRefs(sidebarEl);
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    useAppStore.setState({ activePage: 5, selectionAnchor: 5 });
    fireKey("ArrowUp", { shiftKey: true });
    const pages = [...useAppStore.getState().selectedPages].sort((a, b) => a - b);
    expect(pages).toEqual([4, 5]);
    cleanup();
  });

  it("selection expansion uses activePage as fallback anchor when selectionAnchor is null", () => {
    const { sidebarEl, cleanup } = makeSidebarSetup();
    const { pageViewerRef, sidebarRef } = makeRefs(sidebarEl);
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    useAppStore.setState({ activePage: 3, selectionAnchor: null });
    fireKey("J");
    const pages = [...useAppStore.getState().selectedPages].sort((a, b) => a - b);
    expect(pages).toEqual([3, 4]);
    cleanup();
  });
});
