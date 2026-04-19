import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FindBar } from "./FindBar";

describe("FindBar", () => {
  const noop = () => {};

  it("renders nothing when closed", () => {
    const { container } = render(
      <FindBar
        open={false}
        query=""
        matchCount={0}
        currentMatch={0}
        onQueryChange={noop}
        onNext={noop}
        onPrev={noop}
        onClose={noop}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the find panel when open", () => {
    render(
      <FindBar
        open={true}
        query=""
        matchCount={0}
        currentMatch={0}
        onQueryChange={noop}
        onNext={noop}
        onPrev={noop}
        onClose={noop}
      />
    );
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("shows match count when there are matches", () => {
    render(
      <FindBar
        open={true}
        query="motion"
        matchCount={12}
        currentMatch={3}
        onQueryChange={noop}
        onNext={noop}
        onPrev={noop}
        onClose={noop}
      />
    );
    expect(screen.getByText("4 of 12")).toBeInTheDocument();
  });

  it("shows no-matches indicator when matchCount is 0 and query is non-empty", () => {
    render(
      <FindBar
        open={true}
        query="zebra"
        matchCount={0}
        currentMatch={0}
        onQueryChange={noop}
        onNext={noop}
        onPrev={noop}
        onClose={noop}
      />
    );
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("calls onQueryChange when input changes", async () => {
    const onQueryChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FindBar
        open={true}
        query=""
        matchCount={0}
        currentMatch={0}
        onQueryChange={onQueryChange}
        onNext={noop}
        onPrev={noop}
        onClose={noop}
      />
    );
    await user.type(screen.getByRole("searchbox"), "motion");
    expect(onQueryChange).toHaveBeenCalled();
  });

  it("calls onNext when next button is clicked", async () => {
    const onNext = vi.fn();
    const user = userEvent.setup();
    render(
      <FindBar
        open={true}
        query="motion"
        matchCount={3}
        currentMatch={0}
        onQueryChange={noop}
        onNext={onNext}
        onPrev={noop}
        onClose={noop}
      />
    );
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it("calls onPrev when prev button is clicked", async () => {
    const onPrev = vi.fn();
    const user = userEvent.setup();
    render(
      <FindBar
        open={true}
        query="motion"
        matchCount={3}
        currentMatch={0}
        onQueryChange={noop}
        onNext={noop}
        onPrev={onPrev}
        onClose={noop}
      />
    );
    await user.click(screen.getByRole("button", { name: /prev/i }));
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <FindBar
        open={true}
        query=""
        matchCount={0}
        currentMatch={0}
        onQueryChange={noop}
        onNext={noop}
        onPrev={noop}
        onClose={onClose}
      />
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <FindBar
        open={true}
        query=""
        matchCount={0}
        currentMatch={0}
        onQueryChange={noop}
        onNext={noop}
        onPrev={noop}
        onClose={onClose}
      />
    );
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
