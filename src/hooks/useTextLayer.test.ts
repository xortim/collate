import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useTextLayer, invalidateTextLayerCache } from "./useTextLayer";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const MOCK_RESPONSE = { words: [{ text: "Hello", x: 0.1, y: 0.1, width: 0.1, height: 0.05, is_url: false }], scanned: false };

// Capture the latest document-mutated listener so tests can fire it.
let mutationListener: ((event: { payload: number }) => void) | null = null;
beforeEach(() => {
  mutationListener = null;
  (listen as Mock).mockImplementation((_event: string, handler: (e: { payload: number }) => void) => {
    mutationListener = handler;
    return Promise.resolve(vi.fn());
  });
  (invoke as Mock).mockResolvedValue(MOCK_RESPONSE);
});

afterEach(() => {
  invalidateTextLayerCache(1);
  invalidateTextLayerCache(2);
  vi.clearAllMocks();
});

describe("useTextLayer — initial state", () => {
  it("starts with loading=true and empty words when cache is cold", () => {
    const { result } = renderHook(() => useTextLayer(1, 0));
    expect(result.current.loading).toBe(true);
    expect(result.current.words).toEqual([]);
    expect(result.current.scanned).toBe(false);
  });

  it("returns null doc as loading=true, words=[] without invoking", () => {
    const { result } = renderHook(() => useTextLayer(null, 0));
    expect(result.current.loading).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("useTextLayer — fetch", () => {
  it("calls get_text_layer with docId and pageIndex", async () => {
    renderHook(() => useTextLayer(1, 3));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_text_layer", { docId: 1, pageIndex: 3 }));
  });

  it("resolves to words and loading=false after fetch", async () => {
    const { result } = renderHook(() => useTextLayer(1, 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.words).toEqual(MOCK_RESPONSE.words);
    expect(result.current.scanned).toBe(false);
  });

  it("sets loading=false and returns empty words on fetch error", async () => {
    (invoke as Mock).mockRejectedValueOnce(new Error("fail"));
    const { result } = renderHook(() => useTextLayer(1, 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.words).toEqual([]);
  });
});

describe("useTextLayer — cache", () => {
  it("skips the IPC call on re-render when cache is warm", async () => {
    const { result, rerender } = renderHook(() => useTextLayer(1, 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(invoke).toHaveBeenCalledTimes(1);
    rerender();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("returns loading=false immediately on mount when cache is warm", async () => {
    // Warm the cache with a first render.
    const { unmount } = renderHook(() => useTextLayer(1, 0));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    unmount();
    // Second mount: cache is warm, should be loading=false on first render.
    const { result } = renderHook(() => useTextLayer(1, 0));
    expect(result.current.loading).toBe(false);
    expect(result.current.words).toEqual(MOCK_RESPONSE.words);
  });
});

describe("useTextLayer — document-mutated", () => {
  it("re-fetches after a mutation event for the same docId", async () => {
    const { result } = renderHook(() => useTextLayer(1, 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(invoke).toHaveBeenCalledTimes(1);

    // Fire the mutation event.
    act(() => { mutationListener?.({ payload: 1 }); });

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("ignores mutation events for a different docId", async () => {
    const { result } = renderHook(() => useTextLayer(1, 0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { mutationListener?.({ payload: 2 }); }); // different doc

    // No second invocation.
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(false);
  });
});
