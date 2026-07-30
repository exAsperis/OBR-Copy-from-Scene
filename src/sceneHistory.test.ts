import { describe, expect, it } from "vitest";
import type { Item } from "@owlbear-rodeo/sdk";
import {
  getPriorScene,
  getRecentScenes,
  findIndexedSceneName,
  rememberScene,
  trackActiveScene,
} from "./sceneHistory";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

function scene(name: string, id: string) {
  return { name, items: [{ id } as Item] };
}

describe("recent scene history", () => {
  it("keeps the three most recently indexed scenes", () => {
    const storage = new MemoryStorage();
    rememberScene(storage, scene("One", "1"));
    rememberScene(storage, scene("Two", "2"));
    rememberScene(storage, scene("Three", "3"));
    rememberScene(storage, scene("Four", "4"));
    expect(getRecentScenes(storage).map((item) => item.name)).toEqual([
      "Four",
      "Three",
      "Two",
    ]);
    expect(findIndexedSceneName(storage, [{ id: "3" } as Item])).toBe("Three");
  });
});

describe("active scene tracking", () => {
  it("promotes the previous snapshot when the active scene ID changes", () => {
    const storage = new MemoryStorage();
    trackActiveScene(storage, { id: "a", scene: scene("Market Square", "1") });
    expect(getPriorScene(storage)).toBeNull();
    trackActiveScene(storage, { id: "b", scene: scene("Active scene", "2") });
    expect(getPriorScene(storage)?.name).toBe("Market Square");
    expect(getPriorScene(storage)?.items[0]?.id).toBe("1");
  });
});
