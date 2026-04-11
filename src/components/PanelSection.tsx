import { type ReactNode } from "react";

interface PanelSectionProps {
  heading: string;
  children: ReactNode;
}

export function PanelSection({ heading, children }: PanelSectionProps) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">{heading}</p>
      {children}
    </div>
  );
}
