import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders no-document heading", () => {
    render(<EmptyState onOpen={vi.fn()} />);
    expect(screen.getByText(/no document open/i)).toBeInTheDocument();
  });

  it("renders Open PDF button", () => {
    render(<EmptyState onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: /open pdf/i })).toBeInTheDocument();
  });

  it("calls onOpen when Open PDF is clicked", async () => {
    const onOpen = vi.fn();
    render(<EmptyState onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /open pdf/i }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
