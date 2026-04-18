import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShortcutOverlay } from "./ShortcutOverlay";

vi.mock("@/lib/platform", () => ({
  isMac: false,
  modKey: () => "Ctrl+",
  shiftModKey: () => "Ctrl+Shift+",
  platformName: "Linux",
}));

describe("ShortcutOverlay — platform-aware key labels", () => {
  it("shows Shift+↓ and Shift+↑ for selection expansion on non-Mac", () => {
    render(<ShortcutOverlay open={true} onClose={() => {}} />);
    expect(screen.getByText("Shift+↓")).toBeInTheDocument();
    expect(screen.getByText("Shift+↑")).toBeInTheDocument();
  });

  it("does not show Mac-only ⇧↓ or ⇧↑ glyphs on non-Mac", () => {
    render(<ShortcutOverlay open={true} onClose={() => {}} />);
    expect(screen.queryByText("⇧↓")).not.toBeInTheDocument();
    expect(screen.queryByText("⇧↑")).not.toBeInTheDocument();
  });

  it("shows J and K as vim selection expansion labels", () => {
    render(<ShortcutOverlay open={true} onClose={() => {}} />);
    expect(screen.getByText("J")).toBeInTheDocument();
    expect(screen.getByText("K")).toBeInTheDocument();
  });

  it("does not show Mac-only ⇧j or ⇧k glyphs on non-Mac", () => {
    render(<ShortcutOverlay open={true} onClose={() => {}} />);
    expect(screen.queryByText("⇧j")).not.toBeInTheDocument();
    expect(screen.queryByText("⇧k")).not.toBeInTheDocument();
  });
});
