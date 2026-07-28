import { describe, expect, it, vi } from "vitest";

import { UpdateController } from "./update-state.svelte";
import type { DownloadProgress, PendingUpdate, UpdateGateway } from "./update-service";

function pendingUpdate(overrides: Partial<PendingUpdate> = {}): PendingUpdate {
  return {
    version: "0.2.0",
    currentVersion: "0.1.0",
    notes: "Adds automatic updates.",
    async install() {},
    ...overrides,
  };
}

function gateway(overrides: Partial<UpdateGateway> = {}): UpdateGateway {
  return {
    check: async () => null,
    relaunch: async () => {},
    ...overrides,
  };
}

describe("UpdateController", () => {
  it("reports an available update", async () => {
    const controller = new UpdateController(gateway({ check: async () => pendingUpdate() }));
    await controller.check();

    expect(controller.status).toBe("available");
    expect(controller.available?.version).toBe("0.2.0");
  });

  it("keeps a silent check invisible when no update exists", async () => {
    const controller = new UpdateController(gateway());
    await controller.check({ silent: true });

    expect(controller.status).toBe("idle");
    expect(controller.available).toBeNull();
  });

  it("confirms the current version after a manual check", async () => {
    const controller = new UpdateController(gateway());
    await controller.check();

    expect(controller.status).toBe("upToDate");
  });

  it("swallows a failed launch check so reading is never interrupted", async () => {
    const controller = new UpdateController(
      gateway({
        check: async () => {
          throw new Error("network unreachable");
        },
      }),
    );
    await controller.check({ silent: true });

    expect(controller.status).toBe("idle");
    expect(controller.errorMessage).toBe("");
  });

  it("surfaces the failure of a manual check", async () => {
    const controller = new UpdateController(
      gateway({
        check: async () => {
          throw new Error("network unreachable");
        },
      }),
    );
    await controller.check();

    expect(controller.status).toBe("error");
    expect(controller.errorMessage).toBe("network unreachable");
  });

  it("tracks download progress and relaunches after installing", async () => {
    const relaunch = vi.fn(async () => {});
    const controller = new UpdateController(
      gateway({
        relaunch,
        check: async () =>
          pendingUpdate({
            async install(onProgress: (progress: DownloadProgress) => void) {
              onProgress({ downloadedBytes: 0, totalBytes: 200 });
              onProgress({ downloadedBytes: 50, totalBytes: 200 });
            },
          }),
      }),
    );

    await controller.check();
    await controller.install();

    expect(controller.downloadedBytes).toBe(50);
    expect(controller.totalBytes).toBe(200);
    expect(controller.percent).toBe(0.25);
    expect(controller.status).toBe("installing");
    expect(relaunch).toHaveBeenCalledOnce();
  });

  it("leaves the percentage unknown until the download size is known", async () => {
    const controller = new UpdateController(
      gateway({
        check: async () =>
          pendingUpdate({
            async install(onProgress: (progress: DownloadProgress) => void) {
              onProgress({ downloadedBytes: 128 });
            },
          }),
      }),
    );

    await controller.check();
    await controller.install();

    expect(controller.percent).toBeNull();
  });

  it("reports an installation failure without relaunching", async () => {
    const relaunch = vi.fn(async () => {});
    const controller = new UpdateController(
      gateway({
        relaunch,
        check: async () =>
          pendingUpdate({
            async install() {
              throw new Error("signature mismatch");
            },
          }),
      }),
    );

    await controller.check();
    await controller.install();

    expect(controller.status).toBe("error");
    expect(controller.errorMessage).toBe("signature mismatch");
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("ignores a second check while one is in flight", async () => {
    const check = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return pendingUpdate();
    });
    const controller = new UpdateController(gateway({ check }));

    await Promise.all([controller.check(), controller.check()]);

    expect(check).toHaveBeenCalledOnce();
  });

  it("forgets a dismissed update so it cannot install by accident", async () => {
    const install = vi.fn(async () => {});
    const controller = new UpdateController(
      gateway({ check: async () => pendingUpdate({ install }) }),
    );

    await controller.check();
    controller.dismiss();
    await controller.install();

    expect(controller.status).toBe("idle");
    expect(install).not.toHaveBeenCalled();
  });
});
