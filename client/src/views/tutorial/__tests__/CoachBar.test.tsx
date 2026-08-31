import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CoachBar } from "../components";
import { TutorialStep } from "../script";

const sayStep: TutorialStep = {
  id: "goal",
  kind: "say",
  title: "The whole game",
  say: "Empty your Blurtz pile and the round ends.",
};

const doStep: TutorialStep = {
  id: "bank-two",
  kind: "do",
  title: "Bank piles climb",
  say: "A bank pile goes 1, 2, 3 and up, all in one colour.",
  instruction: "Play the red 2 onto the red 1",
};

const props = {
  step: sayStep,
  stepIndex: 2,
  total: 8,
  nudge: null,
  onAcknowledge: vi.fn(),
  onShowMe: vi.fn(),
  onSkip: vi.fn(),
};

describe("CoachBar", () => {
  it("counts the steps from one, so step index 2 reads as step 3", () => {
    render(<CoachBar {...props} />);

    expect(screen.getByText("Step 3 of 8")).toBeInTheDocument();
  });

  it("exposes progress as a named progressbar", () => {
    render(<CoachBar {...props} />);

    const track = screen.getByRole("progressbar");
    expect(track).toHaveAttribute("aria-valuenow", "3");
    expect(track).toHaveAttribute("aria-valuemin", "1");
    expect(track).toHaveAttribute("aria-valuemax", "8");
    expect(track).toHaveAccessibleName(/tutorial progress/i);
  });

  it("shows the step's title and copy", () => {
    render(<CoachBar {...props} />);

    expect(screen.getByRole("heading", { name: "The whole game" })).toBeInTheDocument();
    expect(screen.getByText(sayStep.say)).toBeInTheDocument();
  });

  it("offers 'Got it' on a say step and calls back", async () => {
    const onAcknowledge = vi.fn();
    render(<CoachBar {...props} onAcknowledge={onAcknowledge} />);

    await userEvent.click(screen.getByRole("button", { name: "Got it" }));

    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });

  it("offers no 'Got it' on a do step, because the board is the acknowledgement", () => {
    render(<CoachBar {...props} step={doStep} />);

    expect(screen.queryByRole("button", { name: "Got it" })).not.toBeInTheDocument();
  });

  it("shows the instruction only on a do step", () => {
    const { rerender } = render(<CoachBar {...props} step={doStep} />);
    expect(screen.getByText(doStep.instruction!)).toBeInTheDocument();

    rerender(<CoachBar {...props} step={sayStep} />);
    expect(screen.queryByText(doStep.instruction!)).not.toBeInTheDocument();
  });

  it("offers 'Show me' only on a do step, and calls back", async () => {
    const onShowMe = vi.fn();
    const { rerender } = render(
      <CoachBar {...props} step={doStep} onShowMe={onShowMe} />
    );

    await userEvent.click(screen.getByRole("button", { name: "Show me" }));
    expect(onShowMe).toHaveBeenCalledTimes(1);

    rerender(<CoachBar {...props} step={sayStep} onShowMe={onShowMe} />);
    expect(screen.queryByRole("button", { name: "Show me" })).not.toBeInTheDocument();
  });

  it("announces a nudge, and renders nothing at all when there is none", () => {
    const { rerender } = render(
      <CoachBar {...props} step={doStep} nudge="Not yet - play the red 2 first" />
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Not yet - play the red 2 first");

    rerender(<CoachBar {...props} step={doStep} nudge={null} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("always offers a way out", async () => {
    const onSkip = vi.fn();
    const { rerender } = render(<CoachBar {...props} onSkip={onSkip} />);

    await userEvent.click(screen.getByRole("button", { name: "Skip the tutorial" }));
    expect(onSkip).toHaveBeenCalledTimes(1);

    rerender(<CoachBar {...props} step={doStep} onSkip={onSkip} />);
    expect(screen.getByRole("button", { name: "Skip the tutorial" })).toBeInTheDocument();
  });
});
