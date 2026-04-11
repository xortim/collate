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


interface DocumentSecurity {
  is_protected:  boolean;
  revision:      number | null;
  can_print:     "high_quality" | "low_quality" | "not_allowed";
  can_modify:    boolean;
  can_copy:      boolean;
  can_annotate:  boolean;
  can_fill_forms: boolean;
  can_assemble:  boolean;
}

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
  security:          DocumentSecurity;
}

interface InfoPanelProps {
  docId: number;
  open: boolean;
  onOpenChange(open: boolean): void;
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <dl className="flex items-start justify-between">
      <dt className="shrink-0 pr-4">{label}</dt>
      {value !== null ? (
        <dd className="text-muted-foreground text-right break-all">{value}</dd>
      ) : (
        <dd className="text-muted-foreground/60 shrink-0">Not set</dd>
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


function SecurityContent({ security }: { security: DocumentSecurity }) {
  const encryptionStatus = security.is_protected
    ? `Encrypted (Rev. ${security.revision})`
    : "None";

  const printLabel =
    security.can_print === "high_quality" ? "Allowed"
    : security.can_print === "low_quality" ? "Low quality only"
    : "Not allowed";

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-muted/30 rounded-lg p-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">Encryption</p>
        <RowList rows={[{ label: "Protection", value: encryptionStatus }]} />
      </div>

      <div className="bg-muted/30 rounded-lg p-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">Permissions</p>
        <RowList rows={[
          { label: "Printing",    value: printLabel },
          { label: "Modify",      value: security.can_modify     ? "Allowed" : "Not allowed" },
          { label: "Copy text",   value: security.can_copy       ? "Allowed" : "Not allowed" },
          { label: "Annotations", value: security.can_annotate   ? "Allowed" : "Not allowed" },
          { label: "Fill forms",  value: security.can_fill_forms ? "Allowed" : "Not allowed" },
          { label: "Assemble",    value: security.can_assemble   ? "Allowed" : "Not allowed" },
        ]} />
      </div>
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
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setInfo(null);
    setError(false);
    invoke<DocumentInfo>("get_document_info", { docId })
      .then(setInfo)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [docId, open]);

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
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
            {loading ? (
              <LoadingSkeleton />
            ) : error ? (
              <p className="text-sm text-destructive text-center mt-8">Could not load document info.</p>
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
            ) : error ? (
              <p className="text-sm text-destructive text-center mt-8">Could not load document info.</p>
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

          <TabsContent value="security" className="flex-1 overflow-y-auto px-4 py-3 mt-0">
            {loading ? (
              <LoadingSkeleton />
            ) : error ? (
              <p className="text-sm text-destructive text-center mt-8">Could not load document info.</p>
            ) : (
              <SecurityContent security={info!.security} />
            )}
          </TabsContent>

        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
