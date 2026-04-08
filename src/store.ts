import { create } from "zustand";

interface AppStore {
  activePage: number;
  setActivePage(index: number): void;
  sidebarWidth: number;
  setSidebarWidth(width: number): void;
}

export const useAppStore = create<AppStore>((set) => ({
  activePage: 0,
  setActivePage: (index) => set({ activePage: index }),
  sidebarWidth: 160,
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
}));
