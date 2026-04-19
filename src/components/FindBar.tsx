import { useEffect, useRef } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  query: string;
  matchCount: number;
  /** 0-based index of the current match. */
  currentMatch: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

/**
 * Floating find bar for Cmd/Ctrl+F search.
 *
 * Positioned absolutely in the top-right of its containing block (the viewer).
 * Escape closes it. Enter advances to next match, Shift+Enter goes to previous.
 */
export function FindBar({
  open,
  query,
  matchCount,
  currentMatch,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input whenever the bar opens.
  useEffect(() => {
    if (open) {
      // Delay one tick so the element is visible before focus.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keyboard handling: Escape closes, Enter advances matches.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && e.target === inputRef.current) {
        e.preventDefault();
        if (e.shiftKey) onPrev();
        else onNext();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, onNext, onPrev]);

  if (!open) return null;

  const hasQuery = query.length > 0;
  const hasMatches = matchCount > 0;

  return (
    <div
      role="search"
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 50,
      }}
      className="flex items-center gap-1 rounded-md border bg-background shadow-lg px-2 py-1"
    >
      <Input
        ref={inputRef}
        role="searchbox"
        type="text"
        placeholder="Find in document…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="h-7 w-48 text-xs border-0 shadow-none focus-visible:ring-0 px-1"
        aria-label="Find in document"
      />

      {hasQuery && (
        <span className="text-xs text-muted-foreground min-w-[56px] text-right">
          {hasMatches ? `${currentMatch + 1} of ${matchCount}` : "No results"}
        </span>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onPrev}
        disabled={!hasMatches}
        aria-label="Previous match"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onNext}
        disabled={!hasMatches}
        aria-label="Next match"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onClose}
        aria-label="Close find bar"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
