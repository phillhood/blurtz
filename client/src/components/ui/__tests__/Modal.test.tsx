import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "../Modal";

describe("Modal", () => {
  it("renders nothing at all when closed", () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()}>
        <p>Contents</p>
      </Modal>
    );

    // Not merely hidden - absent. A closed modal that stays mounted keeps its
    // children's focus traps and autoFocus live behind the page.
    expect(screen.queryByText("Contents")).not.toBeInTheDocument();
  });

  it("renders its children into the document body, not in place", () => {
    const { container } = render(
      <Modal isOpen onClose={vi.fn()}>
        <p>Contents</p>
      </Modal>
    );

    expect(screen.getByText("Contents")).toBeInTheDocument();
    // The portal is what lets a modal escape an ancestor's overflow/z-index.
    // Rendering in place looks identical until it is clipped by a parent.
    expect(container).toBeEmptyDOMElement();
    expect(document.body).toContainElement(screen.getByText("Contents"));
  });

  it("shows a title and a close button only when given a title", async () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <Modal isOpen onClose={onClose} title="Create New Game">
        <p>Contents</p>
      </Modal>
    );

    expect(
      screen.getByRole("heading", { name: "Create New Game" })
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "×" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <Modal isOpen onClose={vi.fn()}>
        <p>Contents</p>
      </Modal>
    );
    // No title means no header bar, so the × goes with it.
    expect(screen.queryByRole("button", { name: "×" })).not.toBeInTheDocument();
  });

  it("closes when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Create New Game">
        <p>Contents</p>
      </Modal>
    );

    const backdrop = screen.getByText("Contents").parentElement!.parentElement!;
    await userEvent.setup().click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when the panel or its contents are clicked", async () => {
    // The panel stops propagation and the backdrop handler compares target to
    // currentTarget. Without both, clicking anything inside dismisses the
    // modal - including the input the user is filling in.
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Create New Game">
        <button>Inside</button>
      </Modal>
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Inside" }));
    await user.click(screen.getByRole("heading", { name: "Create New Game" }));

    expect(onClose).not.toHaveBeenCalled();
  });
});
