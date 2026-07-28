import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

export interface UpdateSummary {
  version: string;
  currentVersion: string;
  notes?: string;
  releasedAt?: string;
}

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes?: number;
}

export interface PendingUpdate extends UpdateSummary {
  install(onProgress: (progress: DownloadProgress) => void): Promise<void>;
}

/**
 * The seam the update controller talks to, so its state machine can be tested
 * without a Tauri host.
 */
export interface UpdateGateway {
  check(): Promise<PendingUpdate | null>;
  relaunch(): Promise<void>;
}

export const tauriUpdateGateway: UpdateGateway = {
  async check() {
    const update = await check();
    if (!update) return null;

    return {
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body || undefined,
      releasedAt: update.date,
      async install(onProgress) {
        let downloadedBytes = 0;
        let totalBytes: number | undefined;

        await update.downloadAndInstall((event) => {
          if (event.event === "Started") {
            totalBytes = event.data.contentLength;
            downloadedBytes = 0;
          } else if (event.event === "Progress") {
            downloadedBytes += event.data.chunkLength;
          }
          onProgress({ downloadedBytes, totalBytes });
        });
      },
    };
  },
  relaunch,
};
