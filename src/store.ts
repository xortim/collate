import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";
export type ZoomMode = "fit-width" | "manual";

interface AppStore {
  activePage: number;
  setActivePage(index: number): void;
  sidebarWidth: number;
  setSidebarWidth(width: number): void;
  theme: Theme;
  setTheme(theme: Theme): void;
  zoom: number;
  setZoom(zoom: number): void;
  zoomMode: ZoomMode;
  setZoomMode(mode: ZoomMode): void;
}

export const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400];

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      activePage: 0,
      setActivePage: (index) => set({ activePage: index }),
      sidebarWidth: 160,
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      theme: "system",
      setTheme: (theme) => set({ theme }),
      zoom: 75,
      setZoom: (zoom) => set({ zoom }),
      zoomMode: "manual",
      setZoomMode: (zoomMode) => set({ zoomMode }),
    }),
    {
      name: "collate-settings",
      // Only persist user preferences, not transient document state
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);
