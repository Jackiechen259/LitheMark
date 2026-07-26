import { loadLocalAsset } from "./document-service";
import type { LocalAsset } from "./document-types";

const DEFAULT_MAX_BYTES = 48 * 1024 * 1024;

export class LocalAssetCache {
  readonly #entries = new Map<string, LocalAsset>();
  readonly #pending = new Map<string, Promise<LocalAsset>>();
  #byteSize = 0;

  constructor(
    readonly maxBytes = DEFAULT_MAX_BYTES,
    readonly maxEntries = 64,
  ) {}

  async load(documentId: string, reference: string) {
    const key = cacheKey(documentId, reference);
    const cached = this.#entries.get(key);
    if (cached) {
      this.#entries.delete(key);
      this.#entries.set(key, cached);
      return cached;
    }

    const pending = this.#pending.get(key);
    if (pending) return pending;
    const request = loadLocalAsset(documentId, reference)
      .then((asset) => {
        this.#insert(key, asset);
        return asset;
      })
      .finally(() => this.#pending.delete(key));
    this.#pending.set(key, request);
    return request;
  }

  clearDocument(documentId: string) {
    const prefix = `${documentId}\0`;
    for (const [key, asset] of this.#entries) {
      if (!key.startsWith(prefix)) continue;
      this.#entries.delete(key);
      this.#byteSize -= asset.byteSize;
    }
  }

  #insert(key: string, asset: LocalAsset) {
    const previous = this.#entries.get(key);
    if (previous) this.#byteSize -= previous.byteSize;
    this.#entries.delete(key);
    this.#entries.set(key, asset);
    this.#byteSize += asset.byteSize;

    while (this.#entries.size > this.maxEntries || this.#byteSize > this.maxBytes) {
      const oldestKey = this.#entries.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.#entries.get(oldestKey);
      this.#entries.delete(oldestKey);
      if (oldest) this.#byteSize -= oldest.byteSize;
    }
  }

  get size() {
    return this.#entries.size;
  }

  get byteSize() {
    return this.#byteSize;
  }
}

function cacheKey(documentId: string, reference: string) {
  return `${documentId}\0${reference}`;
}

export const localAssetCache = new LocalAssetCache();
