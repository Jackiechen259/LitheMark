import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import UpdateNotice from "./UpdateNotice.svelte";

const noop = () => {};

describe("UpdateNotice", () => {
  it("offers to install an available version", async () => {
    const onInstall = vi.fn();
    render(UpdateNotice, {
      props: {
        status: "available",
        version: "0.2.0",
        percent: null,
        errorMessage: "",
        onInstall,
        onDismiss: noop,
      },
    });

    expect(screen.getByText("LitheMark 0.2.0 is available.")).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: "Install and restart" }));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it("shows download progress and blocks dismissal while working", () => {
    render(UpdateNotice, {
      props: {
        status: "downloading",
        version: "0.2.0",
        percent: 0.42,
        errorMessage: "",
        onInstall: noop,
        onDismiss: noop,
      },
    });

    expect(screen.getByText(/42%/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Later" })).toBeDisabled();
  });

  it("reports a failure without offering to install it", () => {
    render(UpdateNotice, {
      props: {
        status: "error",
        percent: null,
        errorMessage: "The update signature could not be verified.",
        onInstall: noop,
        onDismiss: noop,
      },
    });

    expect(screen.getByText("The update signature could not be verified.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Install and restart" })).toBeNull();
  });
});
