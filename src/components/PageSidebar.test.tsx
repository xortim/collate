import { render, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PageSidebar } from "./PageSidebar";
import { useAppStore } from "@/store";

// Virtualizer requires a real scroll container with measurable geometry —
// stub it out so tests focus on click/selection logic, not layout.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({ key: i, index: i, start: 0 })),
    getTotalSize: () => 0,
    measure: vi.fn(),
    scrollToIndex: vi.fn(),
  }),
}));

// Thumbnail renders nothing in jsdom — avoid collate:// protocol noise.
vi.mock("./SidebarThumbnail", () => ({
  SidebarThumbnail: ({ pageIndex, onClick, isSelected }: {
    pageIndex: number;
    onClick: (e: React.MouseEvent) => void;
    isSelected: boolean;
  }) => (
    <button
      data-testid={`thumb-${pageIndex}`}
      data-selected={isSelected}
      onClick={onClick}
    >
      {pageIndex}
    </button>
  ),
}));

vi.mock("./SidebarResizeHandle", () => ({
  SidebarResizeHandle: () => null,
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const PAGES_5 = Array.from({ length: 5 }, () => ({ width_pts: 612, height_pts: 792 }));

function renderSidebar(onScrollToPage = vi.fn()) {
  return render(
    <PageSidebar docId={1} pageSizes={PAGES_5} onScrollToPage={onScrollToPage} />
  );
}

beforeEach(() => {
  useAppStore.setState({ selectedPages: new Set(), activePage: 0 });
});

describe("PageSidebar — click navigation", () => {
  it("plain click calls onScrollToPage with the page index", async () => {
    const onScrollToPage = vi.fn();
    const { getByTestId } = renderSidebar(onScrollToPage);
    await userEvent.click(getByTestId("thumb-2"));
    expect(onScrollToPage).toHaveBeenCalledWith(2);
  });
});

describe("PageSidebar — modifier-key selection", () => {
  it("Cmd+click toggles page selection without navigating", () => {
    const onScrollToPage = vi.fn();
    const { getByTestId } = renderSidebar(onScrollToPage);
    fireEvent.click(getByTestId("thumb-2"), { metaKey: true });
    expect(useAppStore.getState().selectedPages.has(2)).toBe(true);
    expect(onScrollToPage).not.toHaveBeenCalled();
  });

  it("Ctrl+click also toggles selection", () => {
    const { getByTestId } = renderSidebar();
    fireEvent.click(getByTestId("thumb-3"), { ctrlKey: true });
    expect(useAppStore.getState().selectedPages.has(3)).toBe(true);
  });

  it("Cmd+click again deselects a previously selected page", () => {
    useAppStore.setState({ selectedPages: new Set([2]) });
    const { getByTestId } = renderSidebar();
    fireEvent.click(getByTestId("thumb-2"), { metaKey: true });
    expect(useAppStore.getState().selectedPages.has(2)).toBe(false);
  });

  it("Shift+click selects a range from the anchor", () => {
    const { getByTestId } = renderSidebar();
    // Cmd+click page 1 to set anchor
    fireEvent.click(getByTestId("thumb-1"), { metaKey: true });
    // Shift+click page 3 to select range 1-3
    fireEvent.click(getByTestId("thumb-3"), { shiftKey: true });
    const pages = [...useAppStore.getState().selectedPages].sort((a, b) => a - b);
    expect(pages).toEqual([1, 2, 3]);
  });

  it("passes isSelected correctly to thumbnails", () => {
    useAppStore.setState({ selectedPages: new Set([1, 3]) });
    const { getByTestId } = renderSidebar();
    expect(getByTestId("thumb-1").dataset.selected).toBe("true");
    expect(getByTestId("thumb-2").dataset.selected).toBe("false");
    expect(getByTestId("thumb-3").dataset.selected).toBe("true");
  });
});
