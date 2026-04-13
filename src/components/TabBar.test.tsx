import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { TabBar } from "./TabBar";
import type { TabEntry } from "@/store";
import type { DragEndEvent } from "@dnd-kit/core";

// Capture the onDragEnd handler so tests can invoke it directly
let capturedOnDragEnd: ((event: DragEndEvent) => void) | undefined;

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode;
      onDragEnd?: (event: DragEndEvent) => void;
    }) => {
      capturedOnDragEnd = onDragEnd;
      return <>{children}</>;
    },
  };
});

const TAB_A: TabEntry = {
  docId: 1,
  filename: "alpha.pdf",
  path: "/alpha.pdf",
  pageCount: 2,
  pageSizes: [],
  canUndo: false,
  canRedo: false,
  isDirty: false,
};

const TAB_B: TabEntry = {
  docId: 2,
  filename: "beta.pdf",
  path: "/beta.pdf",
  pageCount: 5,
  pageSizes: [],
  canUndo: false,
  canRedo: false,
  isDirty: false,
};

describe("TabBar", () => {
  it("renders a tab for each entry", () => {
    render(
      <TabBar tabs={[TAB_A, TAB_B]} activeDocId={1} onSwitch={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText("alpha.pdf")).toBeInTheDocument();
    expect(screen.getByText("beta.pdf")).toBeInTheDocument();
  });

  it("marks only the active tab with aria-selected=true", () => {
    render(
      <TabBar tabs={[TAB_A, TAB_B]} activeDocId={1} onSwitch={vi.fn()} onClose={vi.fn()} />
    );
    const tabs = screen.getAllByRole("tab");
    const alphaTab = tabs.find((t) => t.textContent?.includes("alpha.pdf"))!;
    const betaTab = tabs.find((t) => t.textContent?.includes("beta.pdf"))!;
    expect(alphaTab).toHaveAttribute("aria-selected", "true");
    expect(betaTab).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSwitch with the correct docId when a tab body is clicked", async () => {
    const onSwitch = vi.fn();
    render(
      <TabBar tabs={[TAB_A, TAB_B]} activeDocId={1} onSwitch={onSwitch} onClose={vi.fn()} />
    );
    await userEvent.click(screen.getByText("beta.pdf"));
    expect(onSwitch).toHaveBeenCalledWith(2);
  });

  it("calls onClose with the correct docId when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <TabBar tabs={[TAB_A, TAB_B]} activeDocId={1} onSwitch={vi.fn()} onClose={onClose} />
    );
    await userEvent.click(screen.getByRole("button", { name: /close beta\.pdf/i }));
    expect(onClose).toHaveBeenCalledWith(2);
  });

  it("close button click does not also fire onSwitch", async () => {
    const onSwitch = vi.fn();
    render(
      <TabBar tabs={[TAB_A, TAB_B]} activeDocId={1} onSwitch={onSwitch} onClose={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: /close beta\.pdf/i }));
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("renders dirty dot when tab.isDirty is true", () => {
    const dirtyTab = { ...TAB_A, isDirty: true };
    render(
      <TabBar tabs={[dirtyTab]} activeDocId={1} onSwitch={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByLabelText("unsaved changes")).toBeInTheDocument();
  });

  it("does not render dirty dot when tab.isDirty is false", () => {
    render(
      <TabBar tabs={[TAB_A]} activeDocId={1} onSwitch={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.queryByLabelText("unsaved changes")).not.toBeInTheDocument();
  });

  it("close button has accessible label including filename", () => {
    render(
      <TabBar tabs={[TAB_A]} activeDocId={1} onSwitch={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /close alpha\.pdf/i })).toBeInTheDocument();
  });

  it("middle-truncates filenames longer than 24 characters", () => {
    const longTab = { ...TAB_A, filename: "very-long-document-name-here.pdf" };
    render(
      <TabBar tabs={[longTab]} activeDocId={1} onSwitch={vi.fn()} onClose={vi.fn()} />
    );
    const displayed = screen.getByTitle("very-long-document-name-here.pdf").textContent!;
    expect(displayed.length).toBeLessThanOrEqual(24);
    expect(displayed).toContain("…");
    expect(displayed.endsWith(".pdf")).toBe(true);
  });

  it("renders nothing when tabs array is empty", () => {
    const { container } = render(
      <TabBar tabs={[]} activeDocId={null} onSwitch={vi.fn()} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  describe("tab reordering", () => {
    it("calls onReorder with correct indices when drag ends on a different tab", () => {
      const onReorder = vi.fn();
      render(
        <TabBar
          tabs={[TAB_A, TAB_B]}
          activeDocId={1}
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onReorder={onReorder}
        />
      );
      act(() => {
        capturedOnDragEnd?.({
          active: { id: TAB_A.docId },
          over: { id: TAB_B.docId },
        } as DragEndEvent);
      });
      expect(onReorder).toHaveBeenCalledWith(0, 1);
    });

    it("does not call onReorder when dropped on the same tab", () => {
      const onReorder = vi.fn();
      render(
        <TabBar
          tabs={[TAB_A, TAB_B]}
          activeDocId={1}
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onReorder={onReorder}
        />
      );
      act(() => {
        capturedOnDragEnd?.({
          active: { id: TAB_A.docId },
          over: { id: TAB_A.docId },
        } as DragEndEvent);
      });
      expect(onReorder).not.toHaveBeenCalled();
    });

    it("does not call onReorder when dropped outside any tab", () => {
      const onReorder = vi.fn();
      render(
        <TabBar
          tabs={[TAB_A, TAB_B]}
          activeDocId={1}
          onSwitch={vi.fn()}
          onClose={vi.fn()}
          onReorder={onReorder}
        />
      );
      act(() => {
        capturedOnDragEnd?.({
          active: { id: TAB_A.docId },
          over: null,
        } as DragEndEvent);
      });
      expect(onReorder).not.toHaveBeenCalled();
    });
  });
});
