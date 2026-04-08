import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface AppStore {
  activePage: number;
  setActivePage(index: number): void;
  sidebarWidth: number;
  setSidebarWidth(width: number): void;
  theme: Theme;
  setTheme(theme: Theme): void;
  zoom: number;
  setZoom(zoom: number): void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      activePage: 0,
      setActivePage: (index) => set({ activePage: index }),
      sidebarWidth: 160,
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      theme: "system",
      setTheme: (theme) => set({ theme }),
      zoom: 100,
      setZoom: (zoom) => set({ zoom }),
    }),
    {
      name: "collate-settings",
      // Only persist user preferences, not transient document state
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);
