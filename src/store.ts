import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DocumentManifest, PageSize } from "@/types";

export type { PageSize };
export type Theme = "light" | "dark" | "system";
export type ZoomMode = "fit-width" | "manual";
export type PageDisplay = "continuous" | "single" | "spread";

export interface DocViewState {
  activePage: number;
  zoom: number;
  zoomMode: ZoomMode;
  selectedPages: ReadonlySet<number>;
  isDirty: boolean;
  selectionAnchor: number | null;
  activePageScanned: boolean;
}

export const DEFAULT_DOC_VIEW_STATE: DocViewState = {
  activePage: 0,
  zoom: 75,
  zoomMode: "manual",
  selectedPages: new Set(),
  isDirty: false,
  selectionAnchor: null,
  activePageScanned: false,
};

export interface TabEntry {
  docId: number;
  filename: string;
  path: string;
  pageCount: number;
  pageSizes: PageSize[];
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
}

interface AppStore {
  // Tab management
  tabs: TabEntry[];
  activeDocId: number | null;
  docViewStates: Map<number, DocViewState>;
  addTab(manifest: DocumentManifest): void;
  removeTab(docId: number): void;
  setActiveDocId(docId: number): void;
  reorderTabs(fromIndex: number, toIndex: number): void;

  // Active doc view state (top-level live copy; saved/restored on tab switch)
  activePage: number;
  setActivePage(index: number): void;
  /** True when the currently active page has no embedded text (scanned image). */
  activePageScanned: boolean;
  setActivePageScanned(scanned: boolean): void;
  zoom: number;
  setZoom(zoom: number): void;
  zoomMode: ZoomMode;
  setZoomMode(mode: ZoomMode): void;
  isDirty: boolean;
  setIsDirty(dirty: boolean): void;
  selectedPages: ReadonlySet<number>;
  togglePageSelection(index: number): void;
  selectPageRange(from: number, to: number): void;
  clearSelection(): void;
  selectAll(count: number): void;
  selectionAnchor: number | null;
  setSelectionAnchor: (i: number | null) => void;

  // Persistent preferences
  sidebarWidth: number;
  setSidebarWidth(width: number): void;
  theme: Theme;
  setTheme(theme: Theme): void;
  recentFiles: string[];
  addRecentFile(path: string): void;
  clearRecentFiles(): void;
  pageDisplay: PageDisplay;
  setPageDisplay(mode: PageDisplay): void;
  infoPanelOpen: boolean;
  setInfoPanelOpen(open: boolean): void;
  toggleInfoPanel(): void;
}

export const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400];

/** Snapshot the current top-level view state fields into a DocViewState object. */
function captureViewState(s: AppStore): DocViewState {
  return {
    activePage: s.activePage,
    zoom: s.zoom,
    zoomMode: s.zoomMode,
    selectedPages: s.selectedPages,
    isDirty: s.isDirty,
    selectionAnchor: s.selectionAnchor,
    activePageScanned: s.activePageScanned,
  };
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Tab management
      tabs: [],
      activeDocId: null,
      docViewStates: new Map(),

      addTab: (manifest) =>
        set((s) => {
          const saved = new Map(s.docViewStates);
          // Save current active doc's state before switching
          if (s.activeDocId !== null) {
            saved.set(s.activeDocId, captureViewState(s));
          }
          // Initialize new doc's state
          saved.set(manifest.doc_id, { ...DEFAULT_DOC_VIEW_STATE });
          const newTab: TabEntry = {
            docId: manifest.doc_id,
            filename: manifest.filename,
            path: manifest.path,
            pageCount: manifest.page_count,
            pageSizes: manifest.page_sizes,
            canUndo: manifest.can_undo,
            canRedo: manifest.can_redo,
            isDirty: false,
          };
          return {
            tabs: [...s.tabs, newTab],
            activeDocId: manifest.doc_id,
            docViewStates: saved,
            // Reset top-level live state for the new doc
            ...DEFAULT_DOC_VIEW_STATE,
          };
        }),

      removeTab: (docId) =>
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.docId === docId);
          if (idx === -1) return {};
          const nextTabs = s.tabs.filter((t) => t.docId !== docId);
          const nextStates = new Map(s.docViewStates);
          nextStates.delete(docId);

          // Determine next active doc
          let nextActiveId: number | null = s.activeDocId;
          let liveOverride: Partial<DocViewState> = {};

          if (s.activeDocId === docId) {
            if (nextTabs.length === 0) {
              nextActiveId = null;
              liveOverride = { ...DEFAULT_DOC_VIEW_STATE };
            } else {
              // Pick left neighbour, falling back to the new first tab
              const neighbourIdx = Math.max(0, idx - 1);
              nextActiveId = nextTabs[neighbourIdx].docId;
              const saved = nextStates.get(nextActiveId);
              liveOverride = saved ? { ...saved } : { ...DEFAULT_DOC_VIEW_STATE };
            }
          }

          return {
            tabs: nextTabs,
            activeDocId: nextActiveId,
            docViewStates: nextStates,
            ...liveOverride,
          };
        }),

      reorderTabs: (fromIndex, toIndex) =>
        set((s) => {
          if (fromIndex === toIndex) return {};
          const next = [...s.tabs];
          const [moved] = next.splice(fromIndex, 1);
          next.splice(toIndex, 0, moved);
          return { tabs: next };
        }),

      setActiveDocId: (docId) =>
        set((s) => {
          if (s.activeDocId === docId) return {};
          // Save current doc state
          const saved = new Map(s.docViewStates);
          if (s.activeDocId !== null) {
            saved.set(s.activeDocId, captureViewState(s));
          }
          // Restore target doc state
          const target = saved.get(docId) ?? DEFAULT_DOC_VIEW_STATE;
          return {
            activeDocId: docId,
            docViewStates: saved,
            ...target,
          };
        }),

      // Active doc view state
      activePage: 0,
      setActivePage: (index) => set({ activePage: index, activePageScanned: false }),
      activePageScanned: false,
      setActivePageScanned: (scanned) => set({ activePageScanned: scanned }),
      zoom: 75,
      setZoom: (zoom) => set({ zoom }),
      zoomMode: "manual",
      setZoomMode: (zoomMode) => set({ zoomMode }),
      isDirty: false,
      setIsDirty: (dirty) =>
        set((s) => ({
          isDirty: dirty,
          tabs:
            s.activeDocId !== null
              ? s.tabs.map((t) =>
                  t.docId === s.activeDocId ? { ...t, isDirty: dirty } : t
                )
              : s.tabs,
        })),
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
      clearSelection: () => set({ selectedPages: new Set<number>(), selectionAnchor: null }),
      selectAll: (count) => {
        const next = new Set<number>();
        for (let i = 0; i < count; i++) next.add(i);
        set({ selectedPages: next });
      },
      selectionAnchor: null,
      setSelectionAnchor: (i) => set({ selectionAnchor: i }),

      // Persistent preferences
      sidebarWidth: 160,
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      theme: "system",
      setTheme: (theme) => set({ theme }),
      recentFiles: [],
      addRecentFile: (path) =>
        set((s) => {
          const without = s.recentFiles.filter((p) => p !== path);
          return { recentFiles: [path, ...without].slice(0, 10) };
        }),
      clearRecentFiles: () => set({ recentFiles: [] }),
      pageDisplay: "continuous",
      setPageDisplay: (pageDisplay) => set({ pageDisplay }),
      infoPanelOpen: false,
      setInfoPanelOpen: (open) => set({ infoPanelOpen: open }),
      toggleInfoPanel: () => set((s) => ({ infoPanelOpen: !s.infoPanelOpen })),
    }),
    {
      name: "collate-settings",
      // Only persist user preferences, not transient document/tab state
      partialize: (state) => ({ theme: state.theme, recentFiles: state.recentFiles }),
    }
  )
);
