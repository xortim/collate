import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useFindBar } from "./useFindBar";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const MATCH_P0 = { page_index: 0, word_indices: [1, 2] };
const MATCH_P2 = { page_index: 2, word_indices: [5] };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useFindBar — initial state", () => {
  it("starts closed with empty query and no matches", () => {
    const { result } = renderHook(() => useFindBar(1, vi.fn()));
    expect(result.current.state.open).toBe(false);
    expect(result.current.state.query).toBe("");
    expect(result.current.state.matches).toEqual([]);
    expect(result.current.state.currentMatchIndex).toBe(0);
  });
});

describe("useFindBar — open / close", () => {
  it("openFind sets open=true", () => {
    const { result } = renderHook(() => useFindBar(1, vi.fn()));
    act(() => result.current.openFind());
    expect(result.current.state.open).toBe(true);
  });

  it("closeFind resets all state", () => {
    const { result } = renderHook(() => useFindBar(1, vi.fn()));
    act(() => result.current.openFind());
    act(() => result.current.closeFind());
    expect(result.current.state.open).toBe(false);
    expect(result.current.state.query).toBe("");
    expect(result.current.state.matches).toEqual([]);
  });
});

describe("useFindBar — setQuery and debounced search", () => {
  it("updates query immediately", () => {
    const { result } = renderHook(() => useFindBar(1, vi.fn()));
    act(() => result.current.setQuery("hello"));
    expect(result.current.state.query).toBe("hello");
  });

  it("does not invoke search before debounce elapses", () => {
    renderHook(() => useFindBar(1, vi.fn()));
    act(() => {
      // setQuery is accessed via result inside the hook closure; we just call invoke directly
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("invokes search_document after 200ms debounce", async () => {
    (invoke as Mock).mockResolvedValue([MATCH_P0]);
    const { result } = renderHook(() => useFindBar(1, vi.fn()));
    act(() => result.current.setQuery("hello"));
    expect(invoke).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(invoke).toHaveBeenCalledWith("search_document", { docId: 1, query: "hello" });
  });

  it("debounces rapid typing — only the last query fires", async () => {
    (invoke as Mock).mockResolvedValue([]);
    const { result } = renderHook(() => useFindBar(1, vi.fn()));
    act(() => result.current.setQuery("h"));
    act(() => result.current.setQuery("he"));
    act(() => result.current.setQuery("hel"));
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("search_document", { docId: 1, query: "hel" });
  });

  it("populates matches and resets currentMatchIndex after search", async () => {
    (invoke as Mock).mockResolvedValue([MATCH_P0, MATCH_P2]);
    const { result } = renderHook(() => useFindBar(1, vi.fn()));
    await act(async () => {
      result.current.setQuery("test");
      vi.advanceTimersByTime(200);
    });
    expect(result.current.state.matches).toEqual([MATCH_P0, MATCH_P2]);
    expect(result.current.state.currentMatchIndex).toBe(0);
  });

  it("invokes search_document when docId is 0 (first document)", async () => {
    (invoke as Mock).mockResolvedValue([MATCH_P0]);
    const { result } = renderHook(() => useFindBar(0, vi.fn()));
    act(() => result.current.setQuery("hello"));
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(invoke).toHaveBeenCalledWith("search_document", { docId: 0, query: "hello" });
  });

  it("clears matches when query is empty string", async () => {
    (invoke as Mock).mockResolvedValue([MATCH_P0]);
    const { result } = renderHook(() => useFindBar(1, vi.fn()));
    await act(async () => {
      result.current.setQuery("test");
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      result.current.setQuery("");
      vi.advanceTimersByTime(200);
    });
    expect(result.current.state.matches).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(1); // empty query short-circuits
  });

  it("clears matches on error", async () => {
    (invoke as Mock).mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useFindBar(1, vi.fn()));
    await act(async () => {
      result.current.setQuery("err");
      vi.advanceTimersByTime(200);
    });
    expect(result.current.state.matches).toEqual([]);
  });
});

describe("useFindBar — next / prev", () => {
  async function hookWithMatches() {
    (invoke as Mock).mockResolvedValue([MATCH_P0, MATCH_P2]);
    const scrollToPage = vi.fn();
    const { result } = renderHook(() => useFindBar(1, scrollToPage));
    await act(async () => {
      result.current.setQuery("test");
      vi.advanceTimersByTime(200);
    });
    return { result, scrollToPage };
  }

  it("next advances currentMatchIndex", async () => {
    const { result } = await hookWithMatches();
    act(() => result.current.next());
    expect(result.current.state.currentMatchIndex).toBe(1);
  });

  it("next wraps around to 0 from last match", async () => {
    const { result } = await hookWithMatches();
    act(() => result.current.next()); // → 1
    act(() => result.current.next()); // → 0 (wrap)
    expect(result.current.state.currentMatchIndex).toBe(0);
  });

  it("prev decrements currentMatchIndex", async () => {
    const { result } = await hookWithMatches();
    act(() => result.current.next()); // → 1
    act(() => result.current.prev()); // → 0
    expect(result.current.state.currentMatchIndex).toBe(0);
  });

  it("prev wraps from 0 to last match", async () => {
    const { result } = await hookWithMatches();
    act(() => result.current.prev()); // → 1 (wrap from 0)
    expect(result.current.state.currentMatchIndex).toBe(1);
  });

  it("next calls scrollToPage with the match's page_index — outside setState", async () => {
    const { result, scrollToPage } = await hookWithMatches();
    act(() => result.current.next());
    // scrollToPage should be called with page_index of match index 1 (MATCH_P2)
    expect(scrollToPage).toHaveBeenCalledWith(MATCH_P2.page_index);
  });

  it("prev calls scrollToPage outside setState", async () => {
    const { result, scrollToPage } = await hookWithMatches();
    act(() => result.current.prev()); // wraps to index 1 (MATCH_P2)
    expect(scrollToPage).toHaveBeenCalledWith(MATCH_P2.page_index);
  });

  it("next is a no-op when there are no matches", () => {
    const scrollToPage = vi.fn();
    const { result } = renderHook(() => useFindBar(1, scrollToPage));
    act(() => result.current.next());
    expect(scrollToPage).not.toHaveBeenCalled();
    expect(result.current.state.currentMatchIndex).toBe(0);
  });
});

describe("useFindBar — highlightsForPage", () => {
  it("returns empty Set for pages with no matches", async () => {
    (invoke as Mock).mockResolvedValue([MATCH_P0]);
    const { result } = renderHook(() => useFindBar(1, vi.fn()));
    await act(async () => {
      result.current.setQuery("x");
      vi.advanceTimersByTime(200);
    });
    expect(result.current.highlightsForPage(99)).toEqual(new Set());
  });

  it("returns word_indices Set for a page with matches", async () => {
    (invoke as Mock).mockResolvedValue([MATCH_P0]);
    const { result } = renderHook(() => useFindBar(1, vi.fn()));
    await act(async () => {
      result.current.setQuery("x");
      vi.advanceTimersByTime(200);
    });
    expect(result.current.highlightsForPage(0)).toEqual(new Set([1, 2]));
  });
});
