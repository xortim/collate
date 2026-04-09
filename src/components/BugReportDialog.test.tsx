import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BugReportDialog } from "./BugReportDialog";

describe("BugReportDialog", () => {
  it("renders nothing when closed", () => {
    render(<BugReportDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog with title and description fields when open", () => {
    render(<BugReportDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(/bug title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it("submit button is disabled when fields are empty", () => {
    render(<BugReportDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
  });

  it("shows no validation errors on initial open (not noisy)", () => {
    render(<BugReportDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.queryByText(/at least/i)).not.toBeInTheDocument();
  });

  it("shows title error only after the title field is blurred with a short value", async () => {
    render(<BugReportDialog open={true} onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/bug title/i), "Short");
    await userEvent.tab(); // blur
    expect(
      await screen.findByText(/at least 10 characters/i)
    ).toBeInTheDocument();
  });

  it("shows description error only after the description field is blurred with a short value", async () => {
    render(<BugReportDialog open={true} onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/description/i), "Too short");
    await userEvent.tab();
    expect(
      await screen.findByText(/at least 20 characters/i)
    ).toBeInTheDocument();
  });

  it("clears error once the field meets the minimum length", async () => {
    render(<BugReportDialog open={true} onOpenChange={vi.fn()} />);
    const input = screen.getByLabelText(/bug title/i);
    await userEvent.type(input, "Short");
    await userEvent.tab();
    await screen.findByText(/at least 10 characters/i);

    await userEvent.clear(input);
    await userEvent.type(input, "This is a valid title");
    await userEvent.tab();
    expect(screen.queryByText(/at least 10 characters/i)).not.toBeInTheDocument();
  });

  it("submit button is enabled when both fields are valid", async () => {
    render(<BugReportDialog open={true} onOpenChange={vi.fn()} />);
    await userEvent.type(
      screen.getByLabelText(/bug title/i),
      "This is a valid title"
    );
    await userEvent.type(
      screen.getByLabelText(/description/i),
      "This description is long enough to pass"
    );
    expect(screen.getByRole("button", { name: /submit/i })).toBeEnabled();
  });

  it("submit button is enabled at exactly minimum lengths", async () => {
    render(<BugReportDialog open={true} onOpenChange={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/bug title/i), "1234567890");
    await userEvent.type(
      screen.getByLabelText(/description/i),
      "12345678901234567890"
    );
    expect(screen.getByRole("button", { name: /submit/i })).toBeEnabled();
  });

  it("calls onOpenChange(false) when Cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    render(<BugReportDialog open={true} onOpenChange={onOpenChange} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) on successful submit", async () => {
    const onOpenChange = vi.fn();
    render(<BugReportDialog open={true} onOpenChange={onOpenChange} />);
    await userEvent.type(
      screen.getByLabelText(/bug title/i),
      "This is a valid title"
    );
    await userEvent.type(
      screen.getByLabelText(/description/i),
      "This description is long enough to pass"
    );
    await userEvent.click(screen.getByRole("button", { name: /submit/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
