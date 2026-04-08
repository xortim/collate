import "@testing-library/jest-dom";

// jsdom's localStorage is not fully implemented in all vitest environments.
// Provide a simple in-memory stub so zustand's persist middleware works.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

// jsdom doesn't implement matchMedia. Provide a minimal stub so components
// that use it (SidebarProvider → use-mobile, useTheme) don't throw.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
