import type {
  DocumentChange,
  DocumentIndexReady,
  DocumentTab,
  OpenDocumentResult,
} from "./document-types";

export class AppState {
  tabs = $state<DocumentTab[]>([]);
  activeDocumentId = $state<string | null>(null);
  #pendingIndexes = new Map<string, DocumentIndexReady>();

  activeTab = $derived(this.tabs.find((tab) => tab.documentId === this.activeDocumentId) ?? null);

  open(result: OpenDocumentResult) {
    const existing = this.tabs.find((tab) => tab.documentId === result.document.id);
    if (existing) {
      existing.metadata = result.document;
      existing.blocks = result.initialBlocks;
      existing.headings = result.headings;
      existing.indexComplete = result.indexComplete;
      existing.status = "ready";
      existing.externalChange = undefined;
      existing.ignoredChangeFingerprint = undefined;
    } else {
      this.tabs.push({
        documentId: result.document.id,
        metadata: result.document,
        blocks: result.initialBlocks,
        headings: result.headings,
        indexComplete: result.indexComplete,
        status: "ready",
        scrollTop: 0,
        outlineExpanded: true,
      });
    }
    this.activeDocumentId = result.document.id;
    const pending = this.#pendingIndexes.get(result.document.id);
    if (pending) {
      this.#pendingIndexes.delete(result.document.id);
      this.completeIndex(pending);
    }
  }

  completeIndex(payload: DocumentIndexReady) {
    const tab = this.tabs.find((candidate) => candidate.documentId === payload.document.id);
    if (!tab) {
      this.#pendingIndexes.set(payload.document.id, payload);
      return;
    }
    if (tab.metadata.revision !== payload.document.revision) return;

    tab.metadata = payload.document;
    tab.headings = payload.headings;
    tab.indexComplete = true;
  }

  activate(documentId: string) {
    if (this.tabs.some((tab) => tab.documentId === documentId)) {
      this.activeDocumentId = documentId;
    }
  }

  close(documentId: string) {
    const index = this.tabs.findIndex((tab) => tab.documentId === documentId);
    if (index < 0) return;

    const wasActive = this.activeDocumentId === documentId;
    this.tabs.splice(index, 1);
    if (wasActive) {
      const replacement = this.tabs[Math.min(index, this.tabs.length - 1)];
      this.activeDocumentId = replacement?.documentId ?? null;
    }
  }

  cycle(direction: 1 | -1) {
    if (this.tabs.length < 2) return;
    const current = this.tabs.findIndex((tab) => tab.documentId === this.activeDocumentId);
    const next = (current + direction + this.tabs.length) % this.tabs.length;
    this.activeDocumentId = this.tabs[next].documentId;
  }

  updateScroll(documentId: string, scrollTop: number) {
    const tab = this.tabs.find((candidate) => candidate.documentId === documentId);
    if (tab) tab.scrollTop = scrollTop;
  }

  reportExternalChange(change: DocumentChange) {
    const tab = this.tabs.find((candidate) => candidate.documentId === change.documentId);
    if (!tab) return;
    if (!change.changed) {
      tab.externalChange = undefined;
      tab.ignoredChangeFingerprint = undefined;
    } else if (change.fingerprint !== tab.ignoredChangeFingerprint) {
      tab.externalChange = change;
    }
  }

  dismissExternalChange(documentId: string) {
    const tab = this.tabs.find((candidate) => candidate.documentId === documentId);
    if (!tab?.externalChange) return;
    tab.ignoredChangeFingerprint = tab.externalChange.fingerprint;
    tab.externalChange = undefined;
  }

  sidebarOpen = $state(true);

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }
}
