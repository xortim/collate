import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";

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
