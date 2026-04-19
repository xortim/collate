import { openUrl } from "@tauri-apps/plugin-opener";

export interface WordBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  is_url: boolean;
}

interface Props {
  words: WordBox[];
  /** Word indices (into the words array) that should be highlighted as find matches. */
  highlights: Set<number>;
}

/**
 * Invisible text overlay positioned absolutely over a page image.
 *
 * Each word is rendered as a transparent <span> at the corresponding
 * percentage position so the browser handles text selection, copy, and
 * cursor natively. Highlight spans get a semi-transparent yellow background
 * for find-in-document matches. URL spans open in the system browser on click.
 *
 * Coordinates are normalized [0.0, 1.0] with top-left origin — multiply by
 * 100 to get CSS percentage values. Zoom and resize are free: the overlay
 * stretches with the page image via `inset: 0`.
 */
export function TextOverlay({ words, highlights }: Props) {
  if (words.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        userSelect: "text",
        overflow: "hidden",
      }}
    >
      {words.map((word, idx) => {
        const isHighlighted = highlights.has(idx);
        const isUrl = word.is_url;

        return (
          <span
            key={idx}
            data-word={word.text}
            data-url={isUrl ? word.text : undefined}
            onClick={
              isUrl
                ? (e) => {
                    e.stopPropagation();
                    openUrl(word.text);
                  }
                : undefined
            }
            className={isHighlighted ? "highlight" : undefined}
            style={{
              position: "absolute",
              left: `${word.x * 100}%`,
              top: `${word.y * 100}%`,
              width: `${word.width * 100}%`,
              height: `${word.height * 100}%`,
              color: "transparent",
              cursor: isUrl ? "pointer" : "text",
              pointerEvents: "auto",
              // Semi-transparent yellow for find matches.
              backgroundColor: isHighlighted ? "rgba(250, 204, 21, 0.4)" : undefined,
              // Prevent layout-affecting whitespace.
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
}
