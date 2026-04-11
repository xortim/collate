import { useEffect, useState, Fragment } from "react";
import { Info } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { parsePdfDate, formatBytes } from "@/lib/pdfDate";


interface DocumentInfo {
  title:             string | null;
  author:            string | null;
  subject:           string | null;
  keywords:          string | null;
  creator:           string | null;
  producer:          string | null;
  creation_date:     string | null;
  modification_date: string | null;
  page_count:        number;
  file_size_bytes:   number | null;
  pdf_version:       string | null;
}

interface InfoPanelProps {
  docId: number;
  open: boolean;
  onOpenChange(open: boolean): void;
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <dl className="flex items-center justify-between">
      <dt>{label}</dt>
      {value !== null ? (
        <dd className="text-muted-foreground text-right break-all">{value}</dd>
      ) : (
        <dd className="text-muted-foreground/60">Not set</dd>
      )}
    </dl>
  );
}

function RowList({ rows }: { rows: Array<{ label: string; value: string | null }> }) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      {rows.map((row, i) => (
        <Fragment key={row.label}>
          {i > 0 && <Separator />}
          <Row label={row.label} value={row.value} />
        </Fragment>
      ))}
    </div>
  );
}


function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function InfoPanel({ docId, open, onOpenChange }: InfoPanelProps) {
  const [info, setInfo] = useState<DocumentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setInfo(null);
    invoke<DocumentInfo>("get_document_info", { docId })
      .then(setInfo)
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  }, [docId]);

  const keywords = info?.keywords
    ? info.keywords.split(/[,;]+/).map((k) => k.trim()).filter(Boolean)
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 flex flex-col gap-0 p-0">
        <SheetHeader className="px-4 py-3 shrink-0">
          <SheetTitle className="text-sm flex items-center gap-2">
            <Info className="size-4 shrink-0" />
            Document Info
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="info" className="flex flex-col flex-1 min-h-0">
          <TabsList className="mx-4 mt-3 shrink-0 justify-start w-auto">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="keywords">Keywords</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
            {loading ? (
              <LoadingSkeleton />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">General</p>
                  <RowList rows={[
                    { label: "Pages",   value: String(info?.page_count ?? "—") },
                    { label: "Size",    value: formatBytes(info?.file_size_bytes ?? null) },
                    { label: "Version", value: info?.pdf_version ?? null },
                  ]} />
                </div>

                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Metadata</p>
                  <RowList rows={[
                    { label: "Title",    value: info?.title    ?? null },
                    { label: "Author",   value: info?.author   ?? null },
                    { label: "Subject",  value: info?.subject  ?? null },
                    { label: "Creator",  value: info?.creator  ?? null },
                    { label: "Producer", value: info?.producer ?? null },
                  ]} />
                </div>

                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Dates</p>
                  <RowList rows={[
                    { label: "Created",  value: parsePdfDate(info?.creation_date     ?? null) },
                    { label: "Modified", value: parsePdfDate(info?.modification_date ?? null) },
                  ]} />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="keywords" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
            {loading ? (
              <LoadingSkeleton />
            ) : keywords.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {keywords.map((kw) => (
                  <Badge key={kw} variant="secondary">{kw}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center mt-8">
                No keywords defined.
              </p>
            )}
          </TabsContent>

        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
