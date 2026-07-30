import { describe, expect, it } from "vitest";
import type { Item } from "@owlbear-rodeo/sdk";
import {
  addFavorite,
  getActiveScene,
  getFavorites,
  getPriorScene,
  isFavorite,
  removeFavorite,
  refreshFavorite,
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

describe("favorite scenes", () => {
  it("adds, detects, and removes explicit favorites", () => {
    const storage = new MemoryStorage();
    addFavorite(storage, scene("One", "1"));
    addFavorite(storage, scene("Two", "2"));
    expect(getFavorites(storage).map((item) => item.name)).toEqual(["One", "Two"]);
    expect(isFavorite(storage, scene("One", "1"))).toBe(true);
    removeFavorite(storage, scene("One", "1"));
    expect(getFavorites(storage).map((item) => item.name)).toEqual(["Two"]);
    refreshFavorite(storage, "Two", scene("Two refreshed", "22"));
    expect(getFavorites(storage)[0]?.name).toBe("Two");
    expect(getFavorites(storage)[0]?.items[0]?.id).toBe("2");
    refreshFavorite(storage, "Two", scene(" two ", "22"));
    expect(getFavorites(storage)[0]?.name).toBe("Two");
    expect(getFavorites(storage)[0]?.items[0]?.id).toBe("22");
  });

  it("caps favorites at eight scenes", () => {
    const storage = new MemoryStorage();
    for (let index = 0; index < 10; index += 1) {
      addFavorite(storage, scene(`Scene ${index}`, String(index)));
    }
    expect(getFavorites(storage)).toHaveLength(8);
  });
});

describe("active scene tracking", () => {
  it("promotes the previous snapshot when the active scene ID changes", () => {
    const storage = new MemoryStorage();
    trackActiveScene(storage, { id: "a", scene: scene("Anything", "1") });
    expect(getActiveScene(storage)?.name).toBe("Active scene");
    expect(getPriorScene(storage)).toBeNull();
    trackActiveScene(storage, { id: "b", scene: scene("Active scene", "2") });
    expect(getPriorScene(storage)?.name).toBe("Previous active scene (cached)");
    expect(getPriorScene(storage)?.items[0]?.id).toBe("1");
  });
});
