import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { PageViewer } from "./components/PageViewer";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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

  async function handleOpen() {
    const path = await openDialog({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (!path) return;

    setLoading(true);
    setError(null);
    setManifest(null);

    try {
      const m = await invoke<DocumentManifest>("open_document", { path });
      setManifest(m);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Toolbar */}
      <header className="flex items-center gap-3 px-3 h-11 bg-background shrink-0">
        <Button size="sm" onClick={handleOpen} disabled={loading}>
          {loading ? "Opening…" : "Open PDF"}
        </Button>

        {manifest && (
          <span className="text-sm text-muted-foreground truncate">
            <span className="font-medium text-foreground">{manifest.filename}</span>
            {" — "}
            {manifest.page_count} page{manifest.page_count !== 1 ? "s" : ""}
          </span>
        )}

        {error && (
          <span className="text-sm text-destructive truncate">{error}</span>
        )}
      </header>

      <Separator />

      {/* Viewer */}
      <main className="flex-1 overflow-hidden">
        {manifest ? (
          <PageViewer docId={manifest.doc_id} pageSizes={manifest.page_sizes} />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Open a PDF to get started
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
