import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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

/** A label/value row in a <dl> grid. Null values render "Not set" in muted text. */
function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      {value !== null ? (
        <dd className="text-xs font-medium break-all">{value}</dd>
      ) : (
        <dd className="text-xs text-muted-foreground/60">Not set</dd>
      )}
    </>
  );
}

/** A section label above a group of rows. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
      {children}
    </p>
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
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle className="text-sm">Document Info</SheetTitle>
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
              <div className="flex flex-col gap-0">
                <SectionLabel>General</SectionLabel>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  <Row label="Pages"   value={String(info?.page_count ?? "—")} />
                  <Row label="Size"    value={formatBytes(info?.file_size_bytes ?? null)} />
                  <Row label="Version" value={info?.pdf_version ?? null} />
                </dl>

                <Separator className="my-3" />

                <SectionLabel>Metadata</SectionLabel>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  <Row label="Title"    value={info?.title    ?? null} />
                  <Row label="Author"   value={info?.author   ?? null} />
                  <Row label="Subject"  value={info?.subject  ?? null} />
                  <Row label="Creator"  value={info?.creator  ?? null} />
                  <Row label="Producer" value={info?.producer ?? null} />
                </dl>

                <Separator className="my-3" />

                <SectionLabel>Dates</SectionLabel>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  <Row label="Created"  value={parsePdfDate(info?.creation_date     ?? null)} />
                  <Row label="Modified" value={parsePdfDate(info?.modification_date ?? null)} />
                </dl>
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
