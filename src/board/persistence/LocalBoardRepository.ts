// localStorage-backed BoardRepository. Each board is stored under
// "mathsboard:<id>". This is the only place that knows the storage format;
// swap it for a backend client later without touching the store.

import type { BoardRepository } from "@/board/persistence/BoardRepository";
import type {
  BoardDocument,
  BoardSummary,
  DraftEnvelope,
  RemoteBoardRef,
} from "@/board/types";
import { newBoardDocument } from "@/board/types";

const PREFIX = "mathsboard:";
const keyFor = (boardId: string): string => PREFIX + boardId;

// Reserved keys that share the PREFIX but are NOT library boards, so list()
// must skip them (their ids never collide because library ids are UUIDs).
// The working draft (single continuously-autosaved current board):
const DRAFT_KEY = "mathsboard:draft";
// The remembered remote (shared) boards, as one { id -> { name, updatedAt } }
// map. Only pointers — the shared content itself lives online in Y-Sweet.
const REMOTES_KEY = "mathsboard:remotes";

export class LocalBoardRepository implements BoardRepository {
  async list(): Promise<BoardSummary[]> {
    const out: BoardSummary[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX) || k === DRAFT_KEY || k === REMOTES_KEY)
        continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const doc = JSON.parse(raw) as BoardDocument;
        out.push({ id: doc.id, name: doc.name, updatedAt: doc.updatedAt });
      } catch {
        // Ignore corrupt entries.
      }
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }

  async load(boardId: string): Promise<BoardDocument | null> {
    const raw = localStorage.getItem(keyFor(boardId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as BoardDocument;
    } catch {
      return null;
    }
  }

  async save(doc: BoardDocument): Promise<void> {
    localStorage.setItem(keyFor(doc.id), JSON.stringify(doc));
  }

  async create(name?: string): Promise<BoardDocument> {
    const doc = newBoardDocument(name);
    await this.save(doc);
    return doc;
  }

  async rename(boardId: string, name: string): Promise<void> {
    const doc = await this.load(boardId);
    if (!doc) return;
    await this.save({ ...doc, name, updatedAt: Date.now() });
  }

  async remove(boardId: string): Promise<void> {
    localStorage.removeItem(keyFor(boardId));
  }

  // --- remembered remote (shared) boards ---
  private readRemotes(): Record<string, { name: string; updatedAt: number }> {
    const raw = localStorage.getItem(REMOTES_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<
        string,
        { name: string; updatedAt: number }
      >;
    } catch {
      return {};
    }
  }

  async listRemotes(): Promise<RemoteBoardRef[]> {
    const map = this.readRemotes();
    return Object.entries(map).map(([id, v]) => ({
      id,
      name: v.name,
      updatedAt: v.updatedAt,
    }));
  }

  async saveRemote(ref: RemoteBoardRef): Promise<void> {
    const map = this.readRemotes();
    map[ref.id] = { name: ref.name, updatedAt: ref.updatedAt };
    localStorage.setItem(REMOTES_KEY, JSON.stringify(map));
  }

  async removeRemote(id: string): Promise<void> {
    const map = this.readRemotes();
    if (!(id in map)) return;
    delete map[id];
    localStorage.setItem(REMOTES_KEY, JSON.stringify(map));
  }

  // --- working draft ---
  async loadDraft(): Promise<DraftEnvelope | null> {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DraftEnvelope;
    } catch {
      return null;
    }
  }

  async saveDraft(draft: DraftEnvelope): Promise<void> {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }

  async clearDraft(): Promise<void> {
    localStorage.removeItem(DRAFT_KEY);
  }
}

/** Shared singleton used by the store. */
export const localRepository: BoardRepository = new LocalBoardRepository();
