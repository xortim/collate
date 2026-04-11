import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";
export type ZoomMode = "fit-width" | "manual";
export type PageDisplay = "continuous" | "single" | "spread";

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
  pageDisplay: PageDisplay;
  setPageDisplay(mode: PageDisplay): void;
  isDirty: boolean;
  setIsDirty(dirty: boolean): void;
  selectedPages: ReadonlySet<number>;
  togglePageSelection(index: number): void;
  selectPageRange(from: number, to: number): void;
  clearSelection(): void;
  selectAll(count: number): void;
  infoPanelOpen: boolean;
  setInfoPanelOpen(open: boolean): void;
  toggleInfoPanel(): void;
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
      pageDisplay: "continuous",
      setPageDisplay: (pageDisplay) => set({ pageDisplay }),
      isDirty: false,
      setIsDirty: (dirty) => set({ isDirty: dirty }),
      selectedPages: new Set<number>(),
      togglePageSelection: (index) =>
        set((s) => {
          const next = new Set(s.selectedPages);
          if (next.has(index)) next.delete(index);
          else next.add(index);
          return { selectedPages: next };
        }),
      selectPageRange: (from, to) => {
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        const next = new Set<number>();
        for (let i = lo; i <= hi; i++) next.add(i);
        set({ selectedPages: next });
      },
      clearSelection: () => set({ selectedPages: new Set<number>() }),
      selectAll: (count) => {
        const next = new Set<number>();
        for (let i = 0; i < count; i++) next.add(i);
        set({ selectedPages: next });
      },
      infoPanelOpen: false,
      setInfoPanelOpen: (open) => set({ infoPanelOpen: open }),
      toggleInfoPanel: () => set((s) => ({ infoPanelOpen: !s.infoPanelOpen })),
    }),
    {
      name: "collate-settings",
      // Only persist user preferences, not transient document state
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);
