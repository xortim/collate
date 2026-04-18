# Keyboard Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Vim-style page navigation (j/k/gg/G) and standard fallbacks (PgUp/PgDn/Home/End) via a single `useKeyboardNav` hook, add sidebar selection expansion (Shift+j/k/↑/↓), and update the shortcut overlay.

**Architecture:** All keyboard handling lives in `src/hooks/useKeyboardNav.ts` — one place to look, called once from `App.tsx`. The hook reads store state via `useAppStore.getState()` and fires `pageViewerRef.current?.scrollToPage()`. A `selectionAnchor` field added to the zustand store (and `DocViewState`) lets selection expansion survive tab switches.

**Tech Stack:** React + TypeScript, Zustand, Vitest + Testing Library, shadcn/ui Dialog, Tailwind CSS.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/store.ts` | Modify | Add `selectionAnchor` to `AppStore`, `DocViewState`, `captureViewState`, `clearSelection` |
| `src/store.test.ts` | Modify | Add tests for `selectionAnchor` behaviour |
| `src/hooks/useKeyboardNav.ts` | **Create** | All keyboard nav logic |
| `src/hooks/useKeyboardNav.test.ts` | **Create** | Unit tests for the hook |
| `src/App.tsx` | Modify | Call `useKeyboardNav`, create `sidebarRef`, pass to `PageSidebar` |
| `src/components/PageSidebar.tsx` | Modify | Accept `containerRef` prop; replace local `anchorRef` with store `selectionAnchor` |
| `src/components/ShortcutOverlay.tsx` | Modify | Add Page Navigation section, rename Navigation→Tabs, add two-column layout for dual-binding sections |

---

## Task 1 — Store: add `selectionAnchor`

**Files:**
- Modify: `src/store.ts`
- Modify: `src/store.test.ts`

### Step 1.1 — Write failing tests

Add to the bottom of `src/store.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// selectionAnchor
// ---------------------------------------------------------------------------

describe("selectionAnchor", () => {
  beforeEach(() => {
    useAppStore.setState({ selectionAnchor: null, selectedPages: new Set() });
  });

  it("starts null", () => {
    expect(useAppStore.getState().selectionAnchor).toBeNull();
  });

  it("setSelectionAnchor(3) sets anchor to 3", () => {
    useAppStore.getState().setSelectionAnchor(3);
    expect(useAppStore.getState().selectionAnchor).toBe(3);
  });

  it("setSelectionAnchor(null) clears the anchor", () => {
    useAppStore.setState({ selectionAnchor: 5 });
    useAppStore.getState().setSelectionAnchor(null);
    expect(useAppStore.getState().selectionAnchor).toBeNull();
  });

  it("clearSelection() also resets selectionAnchor to null", () => {
    useAppStore.setState({ selectionAnchor: 2, selectedPages: new Set([1, 2, 3]) });
    useAppStore.getState().clearSelection();
    expect(useAppStore.getState().selectedPages.size).toBe(0);
    expect(useAppStore.getState().selectionAnchor).toBeNull();
  });

  it("selectionAnchor is saved and restored on tab switch", () => {
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
    useAppStore.getState().addTab(MANIFEST_A);
    useAppStore.getState().setSelectionAnchor(4);

    useAppStore.getState().addTab(MANIFEST_B);
    // anchor should reset for new doc
    expect(useAppStore.getState().selectionAnchor).toBeNull();

    // switch back to A
    useAppStore.getState().setActiveDocId(1);
    expect(useAppStore.getState().selectionAnchor).toBe(4);
  });
});
```

- [ ] **Step 1.2 — Run tests and confirm they fail**

```bash
pnpm exec vitest run src/store.test.ts
```

Expected: 5 failures mentioning `selectionAnchor` not found.

- [ ] **Step 1.3 — Update `DocViewState` interface and `DEFAULT_DOC_VIEW_STATE`**

In `src/store.ts`, update the `DocViewState` interface:

```typescript
export interface DocViewState {
  activePage: number;
  zoom: number;
  zoomMode: ZoomMode;
  selectedPages: ReadonlySet<number>;
  isDirty: boolean;
  selectionAnchor: number | null;
}
```

Update `DEFAULT_DOC_VIEW_STATE`:

```typescript
export const DEFAULT_DOC_VIEW_STATE: DocViewState = {
  activePage: 0,
  zoom: 75,
  zoomMode: "manual",
  selectedPages: new Set(),
  isDirty: false,
  selectionAnchor: null,
};
```

- [ ] **Step 1.4 — Update `captureViewState`**

```typescript
function captureViewState(s: AppStore): DocViewState {
  return {
    activePage: s.activePage,
    zoom: s.zoom,
    zoomMode: s.zoomMode,
    selectedPages: s.selectedPages,
    isDirty: s.isDirty,
    selectionAnchor: s.selectionAnchor,
  };
}
```

- [ ] **Step 1.5 — Add `selectionAnchor` to `AppStore` interface**

In the `AppStore` interface, add after the `clearSelection` and `selectAll` lines:

```typescript
selectionAnchor: number | null;
setSelectionAnchor: (i: number | null) => void;
```

- [ ] **Step 1.6 — Implement in the store body**

Replace the existing `clearSelection` line:

```typescript
clearSelection: () => set({ selectedPages: new Set<number>() }),
```

with:

```typescript
clearSelection: () => set({ selectedPages: new Set<number>(), selectionAnchor: null }),
```

Add after `clearSelection` and before `selectAll`:

```typescript
selectionAnchor: null,
setSelectionAnchor: (i) => set({ selectionAnchor: i }),
```

- [ ] **Step 1.7 — Run tests and confirm they pass**

```bash
pnpm exec vitest run src/store.test.ts
```

Expected: all tests pass.

- [ ] **Step 1.8 — Commit**

```bash
git add src/store.ts src/store.test.ts
git commit -m "feat: add selectionAnchor to store and DocViewState"
```

---

## Task 2 — `useKeyboardNav` hook

**Files:**
- Create: `src/hooks/useKeyboardNav.test.ts`
- Create: `src/hooks/useKeyboardNav.ts`

### Step 2.1 — Write the test file

Create `src/hooks/useKeyboardNav.test.ts`:

```typescript
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
});

describe("page navigation — input guard", () => {
  it("does not fire when target is an <input>", () => {
    const { scrollToPage, pageViewerRef, sidebarRef } = makeRefs();
    renderHook(() => useKeyboardNav({ pageViewerRef, sidebarRef }));
    const input = document.createElement("input");
    document.body.appendChild(input);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "j", bubbles: true, target: input } as any)
    );
    // Use Object.defineProperty trick since KeyboardEvent target is read-only
    const event = new KeyboardEvent("keydown", { key: "j", bubbles: true });
    Object.defineProperty(event, "target", { value: input });
    window.dispatchEvent(event);
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
```

- [ ] **Step 2.2 — Run tests and confirm they fail**

```bash
pnpm exec vitest run src/hooks/useKeyboardNav.test.ts
```

Expected: module `useKeyboardNav` not found.

- [ ] **Step 2.3 — Create `src/hooks/useKeyboardNav.ts`**

```typescript
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
      if (e.key === "j" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        pageViewerRef.current?.scrollToPage(Math.min(activePage + 1, pageCount - 1));
        return;
      }

      // k — previous page
      if (e.key === "k" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        pageViewerRef.current?.scrollToPage(Math.max(activePage - 1, 0));
        return;
      }

      // J (Shift+j) — expand selection down (sidebar only)
      if (e.key === "J" && !e.metaKey && !e.ctrlKey) {
        if (!sidebarFocused) return;
        e.preventDefault();
        const { selectionAnchor } = useAppStore.getState();
        const anchor = selectionAnchor ?? activePage;
        const cursor = Math.min(activePage + 1, pageCount - 1);
        useAppStore.getState().setActivePage(cursor);
        useAppStore.getState().selectPageRange(anchor, cursor);
        return;
      }

      // K (Shift+k) — expand selection up (sidebar only)
      if (e.key === "K" && !e.metaKey && !e.ctrlKey) {
        if (!sidebarFocused) return;
        e.preventDefault();
        const { selectionAnchor } = useAppStore.getState();
        const anchor = selectionAnchor ?? activePage;
        const cursor = Math.max(activePage - 1, 0);
        useAppStore.getState().setActivePage(cursor);
        useAppStore.getState().selectPageRange(anchor, cursor);
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
        const { selectionAnchor } = useAppStore.getState();
        const anchor = selectionAnchor ?? activePage;
        const cursor = Math.min(activePage + 1, pageCount - 1);
        useAppStore.getState().setActivePage(cursor);
        useAppStore.getState().selectPageRange(anchor, cursor);
        return;
      }

      // Shift+ArrowUp — expand selection up (sidebar only)
      if (e.key === "ArrowUp" && e.shiftKey && !e.metaKey && !e.ctrlKey) {
        if (!sidebarFocused) return;
        e.preventDefault();
        const { selectionAnchor } = useAppStore.getState();
        const anchor = selectionAnchor ?? activePage;
        const cursor = Math.max(activePage - 1, 0);
        useAppStore.getState().setActivePage(cursor);
        useAppStore.getState().selectPageRange(anchor, cursor);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pageViewerRef, sidebarRef]);
}
```

- [ ] **Step 2.4 — Run tests and confirm they pass**

```bash
pnpm exec vitest run src/hooks/useKeyboardNav.test.ts
```

Expected: all tests pass.

- [ ] **Step 2.5 — Run full test suite to confirm no regressions**

```bash
make test-frontend
```

Expected: all tests pass.

- [ ] **Step 2.6 — Commit**

```bash
git add src/hooks/useKeyboardNav.ts src/hooks/useKeyboardNav.test.ts
git commit -m "feat: useKeyboardNav hook with Vim-style page navigation"
```

---

## Task 3 — Wire hook and `sidebarRef` in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 3.1 — Add `sidebarRef` and `useKeyboardNav` import**

Add to the imports at the top of `src/App.tsx`:

```typescript
import { useKeyboardNav } from "@/hooks/useKeyboardNav";
```

- [ ] **Step 3.2 — Add `sidebarRef` declaration**

In the `App` function, after the existing `viewerRef` declaration:

```typescript
const viewerRef = useRef<PageViewerHandle>(null);
// Stable ref for use inside event listener closures
const activeTabRef = useRef<TabEntry | null>(null);
```

Add:

```typescript
const sidebarRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 3.3 — Call the hook**

After the `useTheme()` call, add:

```typescript
useKeyboardNav({ pageViewerRef: viewerRef, sidebarRef });
```

- [ ] **Step 3.4 — Pass `containerRef` to `PageSidebar`**

Find the `PageSidebar` usage in the JSX:

```tsx
<PageSidebar
  docId={activeTab.docId}
  pageSizes={activeTab.pageSizes}
  onScrollToPage={(i) => viewerRef.current?.scrollToPage(i)}
  onBugReport={openBugReportForError}
/>
```

Replace with:

```tsx
<PageSidebar
  docId={activeTab.docId}
  pageSizes={activeTab.pageSizes}
  onScrollToPage={(i) => viewerRef.current?.scrollToPage(i)}
  onBugReport={openBugReportForError}
  containerRef={sidebarRef}
/>
```

---

## Task 4 — `PageSidebar`: accept `containerRef`, use store anchor

**Files:**
- Modify: `src/components/PageSidebar.tsx`

- [ ] **Step 4.1 — Add `containerRef` to `Props` and import `RefObject`**

Replace the existing `Props` interface:

```typescript
interface Props {
  docId: number;
  pageSizes: PageSize[];
  onScrollToPage(index: number): void;
  onBugReport(message: string): void;
}
```

with:

```typescript
import type { RefObject } from "react";

interface Props {
  docId: number;
  pageSizes: PageSize[];
  onScrollToPage(index: number): void;
  onBugReport(message: string): void;
  containerRef?: RefObject<HTMLDivElement | null>;
}
```

Note: add the `RefObject` import to the existing `react` import line:

```typescript
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
```

- [ ] **Step 4.2 — Replace `anchorRef` with store `selectionAnchor`**

In the function signature, add the new prop:

```typescript
export function PageSidebar({ docId, pageSizes, onScrollToPage, onBugReport, containerRef: externalRef }: Props) {
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = externalRef ?? internalRef;
```

Remove the `anchorRef` line:
```typescript
// DELETE this line:
const anchorRef = useRef(0);
```

Add store selectors for `selectionAnchor` and `setSelectionAnchor` alongside the existing ones:

```typescript
const selectedPages = useAppStore((s) => s.selectedPages);
const togglePageSelection = useAppStore((s) => s.togglePageSelection);
const selectPageRange = useAppStore((s) => s.selectPageRange);
const clearSelection = useAppStore((s) => s.clearSelection);
const setSelectionAnchor = useAppStore((s) => s.setSelectionAnchor);
```

- [ ] **Step 4.3 — Update `handleThumbClick` to use store anchor**

Replace the existing `handleThumbClick`:

```typescript
const handleThumbClick = useCallback(
  (index: number, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      const isAdding = !useAppStore.getState().selectedPages.has(index);
      togglePageSelection(index);
      if (isAdding) setSelectionAnchor(index);
    } else if (e.shiftKey) {
      const anchor = useAppStore.getState().selectionAnchor ?? index;
      selectPageRange(anchor, index);
    } else {
      clearSelection();
      setSelectionAnchor(index);
      onScrollToPage(index);
    }
  },
  [togglePageSelection, selectPageRange, clearSelection, setSelectionAnchor, onScrollToPage]
);
```

- [ ] **Step 4.4 — Attach `containerRef` to the scroll div**

Find the inner scroll div:

```tsx
<div ref={containerRef} className="h-full overflow-y-auto py-2 pl-3 pr-6">
```

This line already uses `containerRef` — it now uses the merged ref (external ?? internal), so no change needed here as long as step 4.2 renamed the variable correctly.

- [ ] **Step 4.5 — Run tests**

```bash
make test-frontend
```

Expected: all tests pass.

- [ ] **Step 4.6 — Commit**

```bash
git add src/App.tsx src/components/PageSidebar.tsx
git commit -m "feat: wire useKeyboardNav hook and sidebarRef in App"
```

---

## Task 5 — `ShortcutOverlay`: two-column layout + Page Navigation section

**Files:**
- Modify: `src/components/ShortcutOverlay.tsx`

- [ ] **Step 5.1 — Update `ShortcutOverlay.tsx`**

Replace the entire file contents with:

```typescript
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isMac, modKey, shiftModKey } from "@/lib/platform";

interface Props {
  open: boolean;
  onClose(): void;
}

interface SingleRow {
  action: string;
  keys: string[];
}

interface DualRow {
  action: string;
  standard: string | null;
  vim: string | null;
}

interface SingleSection {
  kind: "single";
  label: string;
  rows: SingleRow[];
}

interface DualSection {
  kind: "dual";
  label: string;
  rows: DualRow[];
}

type Section = SingleSection | DualSection;

function buildSections(): Section[] {
  const mod = modKey();
  const shiftMod = shiftModKey();
  return [
    {
      kind: "single",
      label: "File",
      rows: [
        { action: "Open PDF", keys: [`${mod}O`] },
        { action: "Save",     keys: [`${mod}S`] },
        { action: "Save As",  keys: [`${shiftMod}S`] },
        { action: "Close",    keys: [`${mod}W`] },
      ],
    },
    {
      kind: "dual",
      label: "Page Navigation",
      rows: [
        { action: "Next page",     standard: "PgDn", vim: "j" },
        { action: "Previous page", standard: "PgUp",  vim: "k" },
        { action: "First page",    standard: "Home",  vim: "gg" },
        { action: "Last page",     standard: "End",   vim: "G" },
      ],
    },
    {
      kind: "single",
      label: "View",
      rows: [
        { action: "Document Info",  keys: [`${mod}I`] },
        { action: "Zoom In",        keys: [`${mod}+`] },
        { action: "Zoom Out",       keys: [`${mod}−`] },
        { action: "Fit Width",      keys: [`${mod}0`] },
        { action: "Toggle Sidebar", keys: [`${mod}B`] },
      ],
    },
    {
      kind: "single",
      label: "Tabs",
      rows: [
        {
          action: "Next Tab",
          keys: isMac ? ["⌘⇧]"] : ["Ctrl+Tab", "Ctrl+PgDn"],
        },
        {
          action: "Previous Tab",
          keys: isMac ? ["⌘⇧["] : ["Ctrl+Shift+Tab", "Ctrl+PgUp"],
        },
        {
          action: "Jump to Tab",
          keys: [`${mod}1 – ${mod}9`],
        },
      ],
    },
    {
      kind: "dual",
      label: "Selection",
      rows: [
        { action: "Select All",    standard: `${mod}A`, vim: null },
        { action: "Expand down",   standard: "⇧↓",      vim: "⇧j" },
        { action: "Expand up",     standard: "⇧↑",      vim: "⇧k" },
      ],
    },
    {
      kind: "single",
      label: "Help",
      rows: [
        { action: "Keyboard Shortcuts", keys: ["?"] },
      ],
    },
  ];
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
      {children}
    </kbd>
  );
}

function SingleSectionView({ section }: { section: SingleSection }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {section.label}
      </p>
      <div className="space-y-1">
        {section.rows.map((row) => (
          <div key={row.action} className="flex items-center justify-between text-sm">
            <span>{row.action}</span>
            <div className="flex items-center gap-1">
              {row.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DualSectionView({ section }: { section: DualSection }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {section.label}
      </p>
      {/* Column headers */}
      <div className="mb-1 grid grid-cols-[1fr_88px_56px] gap-x-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        <span />
        <span className="text-right">Standard</span>
        <span className="text-right">Vim</span>
      </div>
      <div className="space-y-1">
        {section.rows.map((row) => (
          <div
            key={row.action}
            className="grid grid-cols-[1fr_88px_56px] items-center gap-x-2 text-sm"
          >
            <span>{row.action}</span>
            <div className="flex justify-end">
              {row.standard ? <Kbd>{row.standard}</Kbd> : <span className="text-muted-foreground/40">—</span>}
            </div>
            <div className="flex justify-end">
              {row.vim ? <Kbd>{row.vim}</Kbd> : <span className="text-muted-foreground/40">—</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShortcutOverlay({ open, onClose }: Props) {
  const sections = buildSections();

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-5">
          {sections.map((section) =>
            section.kind === "dual" ? (
              <DualSectionView key={section.label} section={section} />
            ) : (
              <SingleSectionView key={section.label} section={section} />
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5.2 — Run tests**

```bash
make test-frontend
```

Expected: all tests pass.

- [ ] **Step 5.3 — Commit**

```bash
git add src/components/ShortcutOverlay.tsx
git commit -m "feat: shortcut overlay — Page Navigation section, two-column Vim layout"
```

---

## Verification

- [ ] `make test-frontend` — all tests green
- [ ] `cargo tauri dev` — open a multi-page PDF
- [ ] Press `j` / `k` — pages advance / retreat one at a time
- [ ] Press `PgDn` / `PgUp` — same behaviour
- [ ] Press `gg` (two g presses within ~500ms) — jumps to page 1
- [ ] Press `G` — jumps to last page; press `End` — same
- [ ] Press `Home` — jumps to first page
- [ ] Click into an address bar or any future text input; press `j` — no navigation
- [ ] Click a thumbnail to focus the sidebar; press `J` (Shift+j) — selection expands downward; press `K` — selection expands upward
- [ ] Press `⇧↓` and `⇧↑` with sidebar focused — same expansion behaviour
- [ ] Switch tabs while sidebar has a selection — return to the original tab, anchor is still correct
- [ ] Press `?` — overlay shows "Page Navigation" section with Standard/Vim columns; "Navigation" is now "Tabs"; Selection section has Expand down/up rows
- [ ] Press `Escape` — overlay dismisses
