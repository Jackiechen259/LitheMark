import { normalizeAppError } from "../../lib/errors";
import type { PendingUpdate, UpdateGateway, UpdateSummary } from "./update-service";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "upToDate"
  | "error";

export class UpdateController {
  status = $state<UpdateStatus>("idle");
  available = $state<UpdateSummary | null>(null);
  errorMessage = $state("");
  downloadedBytes = $state(0);
  totalBytes = $state<number | null>(null);

  readonly #gateway: UpdateGateway;
  #pending: PendingUpdate | null = null;
  #busy = false;

  constructor(gateway: UpdateGateway) {
    this.#gateway = gateway;
  }

  /** Fraction of the download that has arrived, or null while the size is unknown. */
  percent = $derived(
    this.totalBytes && this.totalBytes > 0
      ? Math.min(1, this.downloadedBytes / this.totalBytes)
      : null,
  );

  /**
   * A silent check runs on launch and must never interrupt reading: an
   * unreachable endpoint leaves the app exactly as it was.
   */
  async check({ silent = false }: { silent?: boolean } = {}): Promise<void> {
    if (this.#busy) return;
    this.#busy = true;
    this.status = "checking";
    this.errorMessage = "";

    try {
      const update = await this.#gateway.check();
      this.#pending = update;
      this.available = update;
      this.status = update ? "available" : silent ? "idle" : "upToDate";
    } catch (error) {
      this.#pending = null;
      this.available = null;
      this.status = silent ? "idle" : "error";
      this.errorMessage = silent ? "" : normalizeAppError(error).message;
    } finally {
      this.#busy = false;
    }
  }

  async install(): Promise<void> {
    const update = this.#pending;
    if (!update || this.#busy) return;
    this.#busy = true;
    this.status = "downloading";
    this.errorMessage = "";
    this.downloadedBytes = 0;
    this.totalBytes = null;

    try {
      await update.install((progress) => {
        this.downloadedBytes = progress.downloadedBytes;
        this.totalBytes = progress.totalBytes ?? null;
      });
      // Windows hands control to the installer, which restarts LitheMark itself;
      // the explicit relaunch covers hosts where the process survives the install.
      this.status = "installing";
      await this.#gateway.relaunch();
    } catch (error) {
      this.status = "error";
      this.errorMessage = normalizeAppError(error).message;
    } finally {
      this.#busy = false;
    }
  }

  dismiss(): void {
    this.status = "idle";
    this.available = null;
    this.errorMessage = "";
    this.#pending = null;
  }
}
