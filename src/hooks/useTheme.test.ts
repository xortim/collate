import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTheme } from "./useTheme";
import { useAppStore } from "@/store";

// jsdom doesn't implement matchMedia; provide a minimal stub
function makeMatchMedia(matches: boolean) {
  return vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

beforeEach(() => {
  useAppStore.setState({ theme: "system" });
  document.documentElement.className = "";
});

describe("useTheme", () => {
  it("applies dark class when theme is 'dark'", () => {
    window.matchMedia = makeMatchMedia(false);
    useAppStore.setState({ theme: "dark" });
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes dark class when theme is 'light'", () => {
    window.matchMedia = makeMatchMedia(false);
    document.documentElement.classList.add("dark");
    useAppStore.setState({ theme: "light" });
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("follows system preference when theme is 'system' and OS is dark", () => {
    window.matchMedia = makeMatchMedia(true);
    useAppStore.setState({ theme: "system" });
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("follows system preference when theme is 'system' and OS is light", () => {
    window.matchMedia = makeMatchMedia(false);
    useAppStore.setState({ theme: "system" });
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
