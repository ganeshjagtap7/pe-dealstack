import { describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen } from "@/test/render";
import { ConfirmDialog } from "./ConfirmDialog";

// ConfirmDialog is the shared confirm primitive used by every destructive
// action (remove team member, delete document, archive deal). These tests
// pin the contract: shape, primary/cancel callbacks, Esc-to-cancel, and the
// danger-variant style switch. If any of these break we don't want to find
// out via a flaky deal-page integration test.

describe("<ConfirmDialog />", () => {
  function mountOpen(overrides: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        title="Remove team member"
        message="Remove Alice from the deal team?"
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...overrides}
      />,
    );
    return { onConfirm, onCancel };
  }

  it("renders title and message when open", () => {
    mountOpen();
    expect(screen.getByText("Remove team member")).toBeInTheDocument();
    expect(screen.getByText("Remove Alice from the deal team?")).toBeInTheDocument();
  });

  it("renders nothing when `open` is false", () => {
    renderWithProviders(
      <ConfirmDialog
        open={false}
        title="Should not appear"
        message="Hidden"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByText("Should not appear")).not.toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = mountOpen();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("calls onCancel when the cancel button is clicked", async () => {
    const user = userEvent.setup();
    const { onCancel } = mountOpen();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when the user presses Escape", async () => {
    const user = userEvent.setup();
    const { onCancel } = mountOpen();
    // Esc must be dispatched while focus is inside the dialog.
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders a red confirm button when variant=danger", () => {
    mountOpen({ variant: "danger", confirmLabel: "Delete" });
    const btn = screen.getByRole("button", { name: "Delete" });
    expect(btn.className).toMatch(/bg-red-600/);
  });

  it("renders the Banker Blue confirm button when variant=default", () => {
    mountOpen({ variant: "default", confirmLabel: "OK" });
    const btn = screen.getByRole("button", { name: "OK" });
    // Banker Blue lives in inline style, not a Tailwind class
    expect(btn.style.backgroundColor).toBe("rgb(0, 51, 102)");
  });
});
