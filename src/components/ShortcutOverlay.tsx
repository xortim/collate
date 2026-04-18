import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isMac, modKey, shiftModKey } from "@/lib/platform";

interface Props {
  open: boolean;
  onClose(): void;
}

interface SingleRow {
  action: string;
  keys: string[];
}

interface DualRow {
  action: string;
  standard: string | null;
  vim: string | null;
}

interface SingleSection {
  kind: "single";
  label: string;
  rows: SingleRow[];
}

interface DualSection {
  kind: "dual";
  label: string;
  rows: DualRow[];
}

type Section = SingleSection | DualSection;

function buildSections(): Section[] {
  const mod = modKey();
  const shiftMod = shiftModKey();
  return [
    {
      kind: "single",
      label: "File",
      rows: [
        { action: "Open PDF", keys: [`${mod}O`] },
        { action: "Save",     keys: [`${mod}S`] },
        { action: "Save As",  keys: [`${shiftMod}S`] },
        { action: "Close",    keys: [`${mod}W`] },
      ],
    },
    {
      kind: "dual",
      label: "Page Navigation",
      rows: [
        { action: "Next page",     standard: "PgDn", vim: "j" },
        { action: "Previous page", standard: "PgUp",  vim: "k" },
        { action: "First page",    standard: "Home",  vim: "gg" },
        { action: "Last page",     standard: "End",   vim: "G" },
      ],
    },
    {
      kind: "single",
      label: "View",
      rows: [
        { action: "Document Info",  keys: [`${mod}I`] },
        { action: "Zoom In",        keys: [`${mod}+`] },
        { action: "Zoom Out",       keys: [`${mod}−`] },
        { action: "Fit Width",      keys: [`${mod}0`] },
        { action: "Toggle Sidebar", keys: [`${mod}B`] },
      ],
    },
    {
      kind: "single",
      label: "Tabs",
      rows: [
        {
          action: "Next Tab",
          keys: isMac ? ["⌘⇧]"] : ["Ctrl+Tab", "Ctrl+PgDn"],
        },
        {
          action: "Previous Tab",
          keys: isMac ? ["⌘⇧["] : ["Ctrl+Shift+Tab", "Ctrl+PgUp"],
        },
        {
          action: "Jump to Tab",
          keys: [`${mod}1 – ${mod}9`],
        },
      ],
    },
    {
      kind: "dual",
      label: "Selection",
      rows: [
        { action: "Select All",    standard: `${mod}A`, vim: null },
        { action: "Expand down",   standard: "⇧↓",      vim: "⇧j" },
        { action: "Expand up",     standard: "⇧↑",      vim: "⇧k" },
      ],
    },
    {
      kind: "single",
      label: "Help",
      rows: [
        { action: "Keyboard Shortcuts", keys: ["?"] },
      ],
    },
  ];
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
      {children}
    </kbd>
  );
}

function SingleSectionView({ section }: { section: SingleSection }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {section.label}
      </p>
      <div className="space-y-1">
        {section.rows.map((row) => (
          <div key={row.action} className="flex items-center justify-between text-sm">
            <span>{row.action}</span>
            <div className="flex items-center gap-1">
              {row.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DualSectionView({ section }: { section: DualSection }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {section.label}
      </p>
      {/* Column headers */}
      <div className="mb-1 grid grid-cols-[1fr_88px_56px] gap-x-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        <span />
        <span className="text-right">Standard</span>
        <span className="text-right">Vim</span>
      </div>
      <div className="space-y-1">
        {section.rows.map((row) => (
          <div
            key={row.action}
            className="grid grid-cols-[1fr_88px_56px] items-center gap-x-2 text-sm"
          >
            <span>{row.action}</span>
            <div className="flex justify-end">
              {row.standard ? <Kbd>{row.standard}</Kbd> : <span className="text-muted-foreground/40">—</span>}
            </div>
            <div className="flex justify-end">
              {row.vim ? <Kbd>{row.vim}</Kbd> : <span className="text-muted-foreground/40">—</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShortcutOverlay({ open, onClose }: Props) {
  const sections = buildSections();

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-5">
          {sections.map((section) =>
            section.kind === "dual" ? (
              <DualSectionView key={section.label} section={section} />
            ) : (
              <SingleSectionView key={section.label} section={section} />
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
