import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextOverlay } from "./TextOverlay";

vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));

const word = (overrides = {}) => ({
  text: "hello",
  x: 0.1,
  y: 0.2,
  width: 0.15,
  height: 0.04,
  is_url: false,
  ...overrides,
});

const getWordSpans = (container: HTMLElement) =>
  container.querySelectorAll("[data-word]");

describe("TextOverlay", () => {
  it("renders nothing when words array is empty", () => {
    const { container } = render(<TextOverlay words={[]} highlights={new Set()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one span per word", () => {
    const { container } = render(
      <TextOverlay
        words={[word({ text: "Hello" }), word({ text: "World" })]}
        highlights={new Set()}
      />
    );
    expect(getWordSpans(container)).toHaveLength(2);
  });

  it("sets percentage-based inline styles from word coordinates", () => {
    const { container } = render(
      <TextOverlay
        words={[word({ x: 0.1, y: 0.2, width: 0.15, height: 0.04 })]}
        highlights={new Set()}
      />
    );
    const span = getWordSpans(container)[0] as HTMLElement;
    expect(span).toHaveStyle({
      left: "10%",
      top: "20%",
      width: "15%",
      height: "4%",
    });
  });

  it("applies highlight class to words in highlights set", () => {
    const { container } = render(
      <TextOverlay
        words={[word({ text: "motion" }), word({ text: "court" })]}
        highlights={new Set([0])}
      />
    );
    const spans = getWordSpans(container);
    expect(spans[0].classList.toString()).toMatch(/highlight/);
    expect(spans[1].classList.toString()).not.toMatch(/highlight/);
  });

  it("renders URL words with data-url attribute", () => {
    const { container } = render(
      <TextOverlay
        words={[word({ text: "https://example.com", is_url: true })]}
        highlights={new Set()}
      />
    );
    const span = getWordSpans(container)[0];
    expect(span).toHaveAttribute("data-url", "https://example.com");
  });

  it("opens URL in system browser when URL span is clicked", async () => {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    const user = userEvent.setup();
    const { container } = render(
      <TextOverlay
        words={[word({ text: "https://example.com", is_url: true })]}
        highlights={new Set()}
      />
    );
    await user.click(getWordSpans(container)[0] as HTMLElement);
    expect(openUrl).toHaveBeenCalledWith("https://example.com");
  });
});
