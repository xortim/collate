import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore, DEFAULT_DOC_VIEW_STATE } from "@/store";
import type { DocumentManifest } from "@/types";

beforeEach(() => {
  useAppStore.setState({ isDirty: false, selectedPages: new Set() });
});

// ---------------------------------------------------------------------------
// isDirty
// ---------------------------------------------------------------------------

describe("isDirty", () => {
  it("starts false", () => {
    expect(useAppStore.getState().isDirty).toBe(false);
  });

  it("setIsDirty(true) marks document as modified", () => {
    useAppStore.getState().setIsDirty(true);
    expect(useAppStore.getState().isDirty).toBe(true);
  });

  it("setIsDirty(false) clears the flag", () => {
    useAppStore.setState({ isDirty: true });
    useAppStore.getState().setIsDirty(false);
    expect(useAppStore.getState().isDirty).toBe(false);
  });

  it("setIsDirty(true) also marks the active tab's isDirty in the tabs array", () => {
    useAppStore.setState({ tabs: [], activeDocId: null, docViewStates: new Map() });
    useAppStore.getState().addTab(MANIFEST_A);
    useAppStore.getState().setIsDirty(true);
    const tab = useAppStore.getState().tabs.find((t) => t.docId === 1);
    expect(tab?.isDirty).toBe(true);
  });

  it("setIsDirty(false) also clears the active tab's isDirty in the tabs array", () => {
    useAppStore.setState({ tabs: [], activeDocId: null, docViewStates: new Map() });
    useAppStore.getState().addTab(MANIFEST_A);
    useAppStore.getState().setIsDirty(true);
    useAppStore.getState().setIsDirty(false);
    const tab = useAppStore.getState().tabs.find((t) => t.docId === 1);
    expect(tab?.isDirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Page selection
// ---------------------------------------------------------------------------

describe("togglePageSelection", () => {
  it("adds a page to an empty selection", () => {
    useAppStore.getState().togglePageSelection(2);
    expect(useAppStore.getState().selectedPages.has(2)).toBe(true);
  });

  it("removes a page that is already selected", () => {
    useAppStore.setState({ selectedPages: new Set([2]) });
    useAppStore.getState().togglePageSelection(2);
    expect(useAppStore.getState().selectedPages.has(2)).toBe(false);
  });

  it("does not affect other selected pages", () => {
    useAppStore.setState({ selectedPages: new Set([1, 3]) });
    useAppStore.getState().togglePageSelection(2);
    const s = useAppStore.getState().selectedPages;
    expect(s.has(1)).toBe(true);
    expect(s.has(2)).toBe(true);
    expect(s.has(3)).toBe(true);
  });
});

describe("selectPageRange", () => {
  it("selects all indices from → to inclusive", () => {
    useAppStore.getState().selectPageRange(2, 5);
    const pages = [...useAppStore.getState().selectedPages].sort((a, b) => a - b);
    expect(pages).toEqual([2, 3, 4, 5]);
  });

  it("works when from > to (reverse drag)", () => {
    useAppStore.getState().selectPageRange(5, 2);
    const pages = [...useAppStore.getState().selectedPages].sort((a, b) => a - b);
    expect(pages).toEqual([2, 3, 4, 5]);
  });

  it("single-page range selects exactly that page", () => {
    useAppStore.getState().selectPageRange(3, 3);
    expect([...useAppStore.getState().selectedPages]).toEqual([3]);
  });

  it("replaces any prior selection", () => {
    useAppStore.setState({ selectedPages: new Set([0, 1]) });
    useAppStore.getState().selectPageRange(4, 5);
    const pages = [...useAppStore.getState().selectedPages].sort((a, b) => a - b);
    expect(pages).toEqual([4, 5]);
  });
});

describe("clearSelection", () => {
  it("empties selectedPages", () => {
    useAppStore.setState({ selectedPages: new Set([1, 2, 3]) });
    useAppStore.getState().clearSelection();
    expect(useAppStore.getState().selectedPages.size).toBe(0);
  });
});

describe("selectAll", () => {
  it("selects every index from 0 to count-1", () => {
    useAppStore.getState().selectAll(4);
    const pages = [...useAppStore.getState().selectedPages].sort((a, b) => a - b);
    expect(pages).toEqual([0, 1, 2, 3]);
  });

  it("selectAll(0) produces an empty selection", () => {
    useAppStore.getState().selectAll(0);
    expect(useAppStore.getState().selectedPages.size).toBe(0);
  });

  it("replaces any prior selection", () => {
    useAppStore.setState({ selectedPages: new Set([99]) });
    useAppStore.getState().selectAll(2);
    const pages = [...useAppStore.getState().selectedPages].sort((a, b) => a - b);
    expect(pages).toEqual([0, 1]);
  });
});

// ---------------------------------------------------------------------------
// recentFiles
// ---------------------------------------------------------------------------

describe("recentFiles", () => {
  beforeEach(() => {
    useAppStore.setState({ recentFiles: [] });
  });

  it("starts empty", () => {
    expect(useAppStore.getState().recentFiles).toEqual([]);
  });

  it("addRecentFile prepends to the list", () => {
    useAppStore.getState().addRecentFile("/a.pdf");
    useAppStore.getState().addRecentFile("/b.pdf");
    expect(useAppStore.getState().recentFiles[0]).toBe("/b.pdf");
  });

  it("addRecentFile deduplicates (existing entry moves to front)", () => {
    useAppStore.setState({ recentFiles: ["/a.pdf", "/b.pdf"] });
    useAppStore.getState().addRecentFile("/b.pdf");
    expect(useAppStore.getState().recentFiles).toEqual(["/b.pdf", "/a.pdf"]);
  });

  it("addRecentFile trims list to 10", () => {
    for (let i = 0; i < 12; i++) {
      useAppStore.getState().addRecentFile(`/${i}.pdf`);
    }
    expect(useAppStore.getState().recentFiles.length).toBe(10);
  });

  it("clearRecentFiles empties the list", () => {
    useAppStore.setState({ recentFiles: ["/a.pdf"] });
    useAppStore.getState().clearRecentFiles();
    expect(useAppStore.getState().recentFiles).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tab management
// ---------------------------------------------------------------------------

const MANIFEST_A: DocumentManifest = {
  doc_id: 1,
  filename: "a.pdf",
  path: "/a.pdf",
  page_count: 2,
  page_sizes: [],
  can_undo: false,
  can_redo: false,
};

const MANIFEST_B: DocumentManifest = {
  doc_id: 2,
  filename: "b.pdf",
  path: "/b.pdf",
  page_count: 3,
  page_sizes: [],
  can_undo: false,
  can_redo: false,
};

const MANIFEST_C: DocumentManifest = {
  doc_id: 3,
  filename: "c.pdf",
  path: "/c.pdf",
  page_count: 1,
  page_sizes: [],
  can_undo: false,
  can_redo: false,
};

describe("tab management", () => {
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
    });
  });

  describe("addTab", () => {
    it("sets activeDocId to the new doc", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      expect(useAppStore.getState().activeDocId).toBe(1);
    });

    it("appends a TabEntry to tabs", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      const { tabs } = useAppStore.getState();
      expect(tabs).toHaveLength(1);
      expect(tabs[0].docId).toBe(1);
      expect(tabs[0].filename).toBe("a.pdf");
      expect(tabs[0].pageCount).toBe(2);
    });

    it("initializes docViewState for the new doc", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      const state = useAppStore.getState().docViewStates.get(1);
      expect(state).toBeDefined();
      expect(state?.zoom).toBe(DEFAULT_DOC_VIEW_STATE.zoom);
    });

    it("resets top-level view state to defaults", () => {
      useAppStore.setState({ zoom: 200, activePage: 5, isDirty: true });
      useAppStore.getState().addTab(MANIFEST_A);
      const s = useAppStore.getState();
      expect(s.activePage).toBe(0);
      expect(s.zoom).toBe(75);
      expect(s.isDirty).toBe(false);
    });

    it("saves previous active doc's state before switching", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.setState({ zoom: 150, activePage: 3 });
      useAppStore.getState().addTab(MANIFEST_B);
      // A's state should have been saved
      const aState = useAppStore.getState().docViewStates.get(1);
      expect(aState?.zoom).toBe(150);
      expect(aState?.activePage).toBe(3);
    });

    it("opening two tabs gives two entries", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().addTab(MANIFEST_B);
      expect(useAppStore.getState().tabs).toHaveLength(2);
      expect(useAppStore.getState().activeDocId).toBe(2);
    });
  });

  describe("removeTab", () => {
    it("removes the tab from tabs and docViewStates", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().removeTab(1);
      expect(useAppStore.getState().tabs).toHaveLength(0);
      expect(useAppStore.getState().docViewStates.has(1)).toBe(false);
    });

    it("sets activeDocId to null when last tab is closed", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().removeTab(1);
      expect(useAppStore.getState().activeDocId).toBeNull();
    });

    it("switches to left neighbour when active tab is closed", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().addTab(MANIFEST_B);
      // B is active; close B → should go to A
      useAppStore.getState().removeTab(2);
      expect(useAppStore.getState().activeDocId).toBe(1);
      expect(useAppStore.getState().tabs).toHaveLength(1);
    });

    it("switches to first tab when leftmost active tab is closed with others present", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().addTab(MANIFEST_B);
      useAppStore.getState().addTab(MANIFEST_C);
      // manually make A active (leftmost)
      useAppStore.getState().setActiveDocId(1);
      useAppStore.getState().removeTab(1);
      // Should fall through to B (now first)
      expect(useAppStore.getState().activeDocId).toBe(2);
    });

    it("closing a non-active tab does not change activeDocId", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().addTab(MANIFEST_B);
      // B is active; close A
      useAppStore.getState().removeTab(1);
      expect(useAppStore.getState().activeDocId).toBe(2);
      expect(useAppStore.getState().tabs).toHaveLength(1);
    });
  });

  describe("setActiveDocId", () => {
    it("saves current top-level state to the outgoing doc", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().addTab(MANIFEST_B);
      useAppStore.setState({ zoom: 200, activePage: 7 });
      // Switch away from B
      useAppStore.getState().setActiveDocId(1);
      expect(useAppStore.getState().docViewStates.get(2)?.zoom).toBe(200);
      expect(useAppStore.getState().docViewStates.get(2)?.activePage).toBe(7);
    });

    it("restores the target doc's saved state into top-level fields", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().addTab(MANIFEST_B);
      // After both tabs are open, override A's saved state
      useAppStore.setState({
        docViewStates: new Map([
          [1, { ...DEFAULT_DOC_VIEW_STATE, zoom: 150, activePage: 4 }],
          [2, { ...DEFAULT_DOC_VIEW_STATE }],
        ]),
      });
      useAppStore.getState().setActiveDocId(1);
      expect(useAppStore.getState().zoom).toBe(150);
      expect(useAppStore.getState().activePage).toBe(4);
    });

    it("updates activeDocId", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().addTab(MANIFEST_B);
      useAppStore.getState().setActiveDocId(1);
      expect(useAppStore.getState().activeDocId).toBe(1);
    });
  });

  describe("reorderTabs", () => {
    it("moves a tab from one index to another", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().addTab(MANIFEST_B);
      useAppStore.getState().addTab(MANIFEST_C);
      useAppStore.getState().reorderTabs(0, 2);
      const ids = useAppStore.getState().tabs.map((t) => t.docId);
      expect(ids).toEqual([2, 3, 1]);
    });

    it("moves a tab from last to first", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().addTab(MANIFEST_B);
      useAppStore.getState().addTab(MANIFEST_C);
      useAppStore.getState().reorderTabs(2, 0);
      const ids = useAppStore.getState().tabs.map((t) => t.docId);
      expect(ids).toEqual([3, 1, 2]);
    });

    it("does not change activeDocId", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().addTab(MANIFEST_B);
      useAppStore.getState().reorderTabs(0, 1);
      expect(useAppStore.getState().activeDocId).toBe(2);
    });

    it("is a no-op when fromIndex === toIndex", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().addTab(MANIFEST_B);
      useAppStore.getState().reorderTabs(1, 1);
      const ids = useAppStore.getState().tabs.map((t) => t.docId);
      expect(ids).toEqual([1, 2]);
    });
  });

  describe("per-doc state isolation", () => {
    it("setZoom on active doc does not affect inactive doc's saved state", () => {
      useAppStore.getState().addTab(MANIFEST_A);
      useAppStore.getState().addTab(MANIFEST_B);
      // Save A's state at zoom=100
      useAppStore.setState({
        docViewStates: new Map([
          [1, { ...DEFAULT_DOC_VIEW_STATE, zoom: 100 }],
          [2, { ...DEFAULT_DOC_VIEW_STATE, zoom: 75 }],
        ]),
      });
      // Change active (B) zoom
      useAppStore.getState().setZoom(300);
      // A's saved state unchanged
      expect(useAppStore.getState().docViewStates.get(1)?.zoom).toBe(100);
    });
  });
});

// ---------------------------------------------------------------------------
// infoPanelOpen
// ---------------------------------------------------------------------------

describe("infoPanelOpen", () => {
  beforeEach(() => {
    useAppStore.setState({ infoPanelOpen: false });
  });

  it("starts false", () => {
    expect(useAppStore.getState().infoPanelOpen).toBe(false);
  });

  it("toggleInfoPanel() sets it to true", () => {
    useAppStore.getState().toggleInfoPanel();
    expect(useAppStore.getState().infoPanelOpen).toBe(true);
  });

  it("toggleInfoPanel() called twice returns to false", () => {
    useAppStore.getState().toggleInfoPanel();
    useAppStore.getState().toggleInfoPanel();
    expect(useAppStore.getState().infoPanelOpen).toBe(false);
  });

  it("setInfoPanelOpen(true) sets it true", () => {
    useAppStore.getState().setInfoPanelOpen(true);
    expect(useAppStore.getState().infoPanelOpen).toBe(true);
  });

  it("setInfoPanelOpen(false) sets it false", () => {
    useAppStore.setState({ infoPanelOpen: true });
    useAppStore.getState().setInfoPanelOpen(false);
    expect(useAppStore.getState().infoPanelOpen).toBe(false);
  });
});

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
