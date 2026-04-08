import { useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { PageViewer, PageViewerHandle } from "./components/PageViewer";
import { PageSidebar } from "./components/PageSidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAppStore } from "@/store";

interface PageSize {
  width_pts: number;
  height_pts: number;
}

interface DocumentManifest {
  doc_id: number;
  page_count: number;
  filename: string;
  page_sizes: PageSize[];
}

function App() {
  const [manifest, setManifest] = useState<DocumentManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const viewerRef = useRef<PageViewerHandle>(null);
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);

  async function handleOpen() {
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (!path) return;

    setLoading(true);
    setError(null);

    if (manifest) {
      await invoke("close_document", { docId: manifest.doc_id });
    }
    setManifest(null);

    try {
      const m = await invoke<DocumentManifest>("open_document", { path });
      setManifest(m);
      useAppStore.getState().setActivePage(0);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    // SidebarProvider manages open/closed state, Cmd+B shortcut, and cookie
    // persistence. --sidebar-width overrides the default 16rem to a narrower
    // strip appropriate for page thumbnails.
    <SidebarProvider
      defaultOpen={true}
      className="h-screen overflow-hidden"
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      {manifest && (
        <Sidebar collapsible="offcanvas">
          <PageSidebar
            docId={manifest.doc_id}
            pageSizes={manifest.page_sizes}
            onScrollToPage={(i) => viewerRef.current?.scrollToPage(i)}
          />
        </Sidebar>
      )}

      <SidebarInset className="flex flex-col overflow-hidden">
        <header className="flex items-center gap-2 px-3 h-11 shrink-0">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-5" />
          <Button size="sm" onClick={handleOpen} disabled={loading}>
            {loading ? "Opening…" : "Open PDF"}
          </Button>

          {manifest && (
            <span className="text-sm text-muted-foreground truncate">
              <span className="font-medium text-foreground">
                {manifest.filename}
              </span>
              {" — "}
              {manifest.page_count} page{manifest.page_count !== 1 ? "s" : ""}
            </span>
          )}

          {error && (
            <span className="text-sm text-destructive truncate">{error}</span>
          )}
        </header>

        <Separator />

        <div className="flex-1 overflow-hidden min-h-0">
          {manifest ? (
            <PageViewer
              ref={viewerRef}
              docId={manifest.doc_id}
              pageSizes={manifest.page_sizes}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Open a PDF to get started
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default App;
