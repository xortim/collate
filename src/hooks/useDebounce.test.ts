import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebounce } from "./useDebounce";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDebounce", () => {
  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebounce("initial", 150));
    expect(result.current).toBe("initial");
  });

  it("returns the updated value after the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 150),
      { initialProps: { value: "initial" } }
    );
    rerender({ value: "updated" });
    expect(result.current).toBe("initial");
    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current).toBe("updated");
  });

  it("does not update if the value changes again before the delay elapses", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 150),
      { initialProps: { value: "initial" } }
    );
    rerender({ value: "intermediate" });
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ value: "final" });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe("initial");
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe("final");
  });
});
