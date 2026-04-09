import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SidebarThumbnail } from "./SidebarThumbnail";

// jsdom doesn't implement collate:// image loading — stub Image so the
// useEffect that loads the thumbnail src doesn't error or stall.
class FakeImage {
  onload: (() => void) | null = null;
  set src(_: string) {
    // Immediately resolve so displayedSrc is set and skeleton is replaced.
    this.onload?.();
  }
}
vi.stubGlobal("Image", FakeImage);

function renderThumbnail(overrides: Partial<Parameters<typeof SidebarThumbnail>[0]> = {}) {
  return render(
    <SidebarThumbnail
      docId={1}
      pageIndex={0}
      width={120}
      widthPts={612}
      heightPts={792}
      isActive={false}
      onClick={vi.fn()}
      {...overrides}
    />
  );
}

describe("SidebarThumbnail context menu", () => {
  it("renders a right-click context menu trigger", async () => {
    renderThumbnail();
    // The context menu wraps the thumbnail — right-click to open it.
    const thumb = screen.getByRole("button", { name: /go to page 1/i });
    await userEvent.pointer({ target: thumb, keys: "[MouseRight]" });
    // All six items should appear.
    expect(screen.getByRole("menuitem", { name: /rotate clockwise/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /rotate counter-clockwise/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /delete page/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /insert page before/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /insert page after/i })).toBeInTheDocument();
  });

  it("all context menu items are disabled stubs", async () => {
    renderThumbnail();
    const thumb = screen.getByRole("button", { name: /go to page 1/i });
    await userEvent.pointer({ target: thumb, keys: "[MouseRight]" });
    const items = screen.getAllByRole("menuitem");
    for (const item of items) {
      expect(item).toHaveAttribute("data-disabled");
    }
  });

  it("clicking context menu item does not trigger navigation", async () => {
    const onClick = vi.fn();
    renderThumbnail({ onClick });
    const thumb = screen.getByRole("button", { name: /go to page 1/i });
    await userEvent.pointer({ target: thumb, keys: "[MouseRight]" });
    const rotateItem = screen.getByRole("menuitem", { name: /rotate clockwise/i });
    await userEvent.click(rotateItem);
    expect(onClick).not.toHaveBeenCalled();
  });
});
