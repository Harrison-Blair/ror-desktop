import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ConfirmDialog,
  type ConfirmDialogProps,
} from "@/components/ConfirmDialog/ConfirmDialog";

function renderDialog(props: Partial<ConfirmDialogProps> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Discard the draft?"
      message="This cannot be undone."
      confirmLabel="Discard"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { user: userEvent.setup(), onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("is a modal alert dialog named by its title and described by its message", () => {
    renderDialog();

    const dialog = screen.getByRole("alertdialog", {
      name: "Discard the draft?",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
  });

  it("labels the cancel button Cancel by default", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("uses a custom cancel label", () => {
    renderDialog({ cancelLabel: "Keep editing" });

    expect(
      screen.getByRole("button", { name: "Keep editing" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("focuses Cancel when it opens", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("Esc calls onCancel", async () => {
    const { user, onCancel, onConfirm } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Tab and Shift+Tab keep focus inside the dialog", async () => {
    render(<button type="button">Outside</button>);
    const { user } = renderDialog();
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Discard" });

    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab({ shift: true });
    expect(confirm).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
  });

  it("a click on the confirm button calls onConfirm", async () => {
    const { user, onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("a click on the cancel button calls onCancel", async () => {
    const { user, onConfirm, onCancel } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
