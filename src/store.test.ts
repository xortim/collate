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
