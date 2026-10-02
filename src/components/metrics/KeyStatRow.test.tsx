import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GOOD_DIRECTION } from "@/lib/bands";
import type { Metric } from "@/lib/reasons";
import { KeyStatRow } from "./KeyStatRow";

const m = (value: number | null, extra: Partial<Metric<number>> = {}): Metric<number> => ({ value, reason: null, provisional: false, ...extra });
const arrow = (c: HTMLElement) => c.querySelector("[data-tone]");

describe("KeyStatRow", () => {
  it("HRV 8% above its average shows a good up arrow", () => {
    const { container } = render(
      <KeyStatRow variant="row" label="Heart rate variability" metric={m(108)} unit="ms" format="int" average={100} sd={5} direction={GOOD_DIRECTION.hrv} />,
    );
    expect(arrow(container)).toHaveAttribute("data-tone", "good");
    expect(arrow(container)).toHaveAttribute("data-dir", "up");
    expect(screen.getByText(/Heart rate variability 108 milliseconds, above your 30-day average of 100, good/)).toBeInTheDocument();
  });

  it("resting HR 3 bpm above its average shows bad", () => {
    const { container } = render(
      <KeyStatRow variant="row" label="Resting heart rate" metric={m(52)} unit="bpm" format="int" average={49} sd={2} direction={GOOD_DIRECTION.resting_hr} />,
    );
    expect(arrow(container)).toHaveAttribute("data-tone", "bad");
  });

  it("inside ±1 σ shows the neutral dot", () => {
    const { container } = render(
      <KeyStatRow variant="row" label="Heart rate variability" metric={m(103)} unit="ms" format="int" average={100} sd={5} direction="up" />,
    );
    expect(arrow(container)).toHaveAttribute("data-tone", "neutral");
    expect(arrow(container)).toHaveAttribute("data-dir", "flat");
  });

  it("a reason shows -- and the short copy, without the average", () => {
    render(
      <KeyStatRow variant="row" label="Blood oxygen" metric={m(null, { reason: "band_not_worn" })} unit="%" format="int" average={97} direction="up" />,
    );
    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not worn").length).toBeGreaterThan(0);
    expect(screen.queryByText("97")).not.toBeInTheDocument();
  });

  it("provisional values carry the tag; loading renders the skeleton", () => {
    const { rerender, container } = render(
      <KeyStatRow variant="tile" label="Respiratory rate" metric={m(16.8, { provisional: true })} unit="rpm" format="decimal1" direction="neutral" chip={{ tone: "optimal", text: "within 16.1 - 16.9" }} />,
    );
    expect(screen.getByText("Provisional")).toBeInTheDocument();
    expect(screen.getByText("within 16.1 - 16.9")).toBeInTheDocument();
    rerender(<KeyStatRow variant="tile" label="Respiratory rate" metric={undefined} format="decimal1" direction="neutral" />);
    expect(container.querySelector("[data-slot=skeleton]")).toBeInTheDocument();
  });
});
