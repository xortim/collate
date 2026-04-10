import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { modKey, shiftModKey } from "@/lib/platform";

interface Props {
  open: boolean;
  onClose(): void;
}

interface ShortcutRow {
  action: string;
  keys: string[];
}

interface Section {
  label: string;
  rows: ShortcutRow[];
}

function buildSections(): Section[] {
  const mod = modKey();
  const shiftMod = shiftModKey();
  return [
    {
      label: "File",
      rows: [
        { action: "Open PDF",  keys: [`${mod}O`] },
        { action: "Save",      keys: [`${mod}S`] },
        { action: "Save As",   keys: [`${shiftMod}S`] },
        { action: "Close",     keys: [`${mod}W`] },
      ],
    },
    {
      label: "View",
      rows: [
        { action: "Zoom In",        keys: [`${mod}+`] },
        { action: "Zoom Out",       keys: [`${mod}−`] },
        { action: "Fit Width",      keys: [`${mod}0`] },
        { action: "Toggle Sidebar", keys: [`${mod}B`] },
      ],
    },
    {
      label: "Selection",
      rows: [
        { action: "Select All Pages", keys: [`${mod}A`] },
      ],
    },
    {
      label: "Help",
      rows: [
        { action: "Keyboard Shortcuts", keys: ["?"] },
      ],
    },
  ];
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
          {sections.map((section) => (
            <div key={section.label}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.rows.map((row) => (
                  <div key={row.action} className="flex items-center justify-between text-sm">
                    <span>{row.action}</span>
                    <div className="flex items-center gap-1">
                      {row.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
