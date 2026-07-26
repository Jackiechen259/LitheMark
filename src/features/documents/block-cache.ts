import type { MarkdownBlock } from "./document-types";

export class BlockCache {
  readonly #blocks = new Map<number, MarkdownBlock>();

  constructor(readonly capacity = 500) {
    if (capacity < 1) throw new Error("Block cache capacity must be positive.");
  }

  get(index: number): MarkdownBlock | undefined {
    const block = this.#blocks.get(index);
    if (!block) return undefined;
    this.#blocks.delete(index);
    this.#blocks.set(index, block);
    return block;
  }

  peek(index: number): MarkdownBlock | undefined {
    return this.#blocks.get(index);
  }

  set(block: MarkdownBlock) {
    this.#blocks.delete(block.id);
    this.#blocks.set(block.id, block);
    while (this.#blocks.size > this.capacity) {
      const oldest = this.#blocks.keys().next().value;
      if (oldest === undefined) break;
      this.#blocks.delete(oldest);
    }
  }

  seed(blocks: MarkdownBlock[]) {
    for (const block of blocks) this.set(block);
  }

  clear() {
    this.#blocks.clear();
  }

  get size() {
    return this.#blocks.size;
  }
}
