import { render, act } from "@testing-library/react";
import { createRef } from "react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { PageViewer, PageViewerHandle } from "./PageViewer";
import { useAppStore } from "@/store";

// Avoid virtualizer complexity in unit tests — we only care about the scroll
// detection logic, not layout.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [],
    getTotalSize: () => 0,
    measure: vi.fn(),
  }),
}));

// Avoid collate:// protocol calls during tests.
vi.mock("./PageImage", () => ({
  PageImage: () => null,
}));

// 5 standard letter pages (612 × 792 pts).
const PAGES_5 = Array.from({ length: 5 }, () => ({
  width_pts: 612,
  height_pts: 792,
}));

// 13 standard letter pages — for testing middle-page clamping at low zoom.
const PAGES_13 = Array.from({ length: 13 }, () => ({
  width_pts: 612,
  height_pts: 792,
}));

// Helper: set read-only DOM geometry on an element.
function mockGeometry(
  el: HTMLElement,
  scrollHeight: number,
  clientHeight: number,
  scrollTop: number
) {
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  Object.defineProperty(el, "scrollTop", { value: scrollTop, configurable: true, writable: true });
}

beforeEach(() => {
  useAppStore.setState({ zoom: 75, zoomMode: "manual", activePage: 0 });
});

describe("PageViewer — scrollToPage", () => {
  it("marks the clicked page active immediately when no scroll event fires", async () => {
    // At 50% zoom many pages are visible at once. Clicking a visible page
    // may produce an offset equal to the current scrollTop so the browser
    // fires no scroll event and onScroll never runs.
    useAppStore.setState({ zoom: 50, zoomMode: "manual", activePage: 0 });
    const ref = createRef<PageViewerHandle>();
    render(<PageViewer ref={ref} docId={1} pageSizes={PAGES_5} />);

    await act(async () => {
      ref.current?.scrollToPage(2);
    });

    expect(useAppStore.getState().activePage).toBe(2);
  });

  it("marks the last page active when scrollTop is clamped at maxScroll", async () => {
    // At 75% zoom with 5 letter pages:
    //   slot = round(792/612 × 459) + 16 = 594 + 16 = 610 px
    //   last page top (index 4) = 16 + 4×610 = 2456 px
    //   maxScroll = (16 + 5×610) − 800 = 3066 − 800 = 2266 px
    // scrollToPage(4) targets 2456 but the browser clamps to 2266.
    // The grace-zone check (2456 > 2266+50) would previously break the loop
    // before reaching page 4, leaving active=3.
    const ref = createRef<PageViewerHandle>();
    const { container } = render(
      <PageViewer ref={ref} docId={1} pageSizes={PAGES_5} />
    );
    const scrollEl = container.firstElementChild as HTMLDivElement;
    mockGeometry(scrollEl, 3066, 800, 2266); // scrollTop already at maxScroll

    await act(async () => {
      ref.current?.scrollToPage(4);
      // Simulate the browser scroll event that fires after el.scrollTop is set,
      // with scrollTop clamped to maxScroll (2266) rather than the target (2456).
      scrollEl.dispatchEvent(new Event("scroll"));
    });

    expect(useAppStore.getState().activePage).toBe(4);
  });

  it("marks a middle page active even when scrollTop clamps to maxScroll", async () => {
    // At 25% zoom with 13 letter pages:
    //   slot = round(792/612 × 153) + 16 = 198 + 16 = 214 px
    //   page 11 top (index 10) = 16 + 10×214 = 2156 px  > maxScroll (1998)
    //   page 12 top (index 11) = 2370 px                > maxScroll
    //   maxScroll = (16 + 13×214) − 800 = 2798 − 800 = 1998 px
    // Clicking page 11 or 12 clamps scrollTop to 1998. The old bottom guard
    // (scrollTop >= maxScroll-1 → active = lastPage) incorrectly forced
    // active to page 13 (index 12) instead of the clicked page.
    useAppStore.setState({ zoom: 25, zoomMode: "manual", activePage: 9 }); // page 10 was active
    const ref = createRef<PageViewerHandle>();
    const { container } = render(
      <PageViewer ref={ref} docId={1} pageSizes={PAGES_13} />
    );
    const scrollEl = container.firstElementChild as HTMLDivElement;
    mockGeometry(scrollEl, 2798, 800, 1998); // scrollTop clamped to maxScroll

    await act(async () => {
      ref.current?.scrollToPage(10); // click page 11 (0-indexed)
      scrollEl.dispatchEvent(new Event("scroll"));
    });

    expect(useAppStore.getState().activePage).toBe(10); // page 11, NOT page 13 (index 12)
  });

  it("scrollToPage sets scrollTop so the target page has PAGE_TOP_GAP above it", async () => {
    // At 75% zoom: pageWidth = round(612*75/100) = 459, rendered_h = round(792/612*459) = 594, slot = 610.
    // Page 1 top in DOM = PAGE_TOP_GAP + slot0 = 16 + 610 = 626.
    // scrollToPage(1) must set scrollTop = 610 (= slot0) so the viewport starts at 610,
    // leaving PAGE_TOP_GAP (16 px) of breathing room above page 1 — matching the gap
    // that exists above page 0 when a document first opens (scrollTop = 0).
    const ref = createRef<PageViewerHandle>();
    const { container } = render(<PageViewer ref={ref} docId={1} pageSizes={PAGES_5} />);
    const scrollEl = container.firstElementChild as HTMLDivElement;

    await act(async () => {
      ref.current?.scrollToPage(1);
    });

    expect(scrollEl.scrollTop).toBe(610);
  });
});

describe("PageViewer — natural scroll active page detection", () => {
  it("detects the topmost visible page during normal scrolling", async () => {
    // At 75% zoom, scrollTop=600 puts page 1's top (626 px) just inside the
    // 50 px grace zone → page 1 (index 1) should become active.
    const ref = createRef<PageViewerHandle>();
    const { container } = render(
      <PageViewer ref={ref} docId={1} pageSizes={PAGES_5} />
    );
    const scrollEl = container.firstElementChild as HTMLDivElement;
    mockGeometry(scrollEl, 3066, 800, 600);

    await act(async () => {
      scrollEl.dispatchEvent(new Event("scroll"));
    });

    expect(useAppStore.getState().activePage).toBe(1);
  });
});
