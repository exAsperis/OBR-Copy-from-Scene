import type { Item } from "@owlbear-rodeo/sdk";

export interface IndexedScene {
  name: string;
  items: Item[];
}

export interface ActiveSceneSnapshot {
  id: string;
  scene: IndexedScene;
}

const FAVORITE_SCENES_KEY = "com.exasperis.obr-extension-test/favorite-scenes";
const ACTIVE_SCENE_KEY = "com.exasperis.obr-extension-test/active-scene";
const PRIOR_SCENE_KEY = "com.exasperis.obr-extension-test/prior-scene";
export const MAX_FAVORITES = 8;

function readJson<T>(storage: Storage, key: string): T | null {
  const value = storage.getItem(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function getFavorites(storage: Storage): IndexedScene[] {
  return readJson<IndexedScene[]>(storage, FAVORITE_SCENES_KEY) ?? [];
}

function sceneSignature(scene: Pick<IndexedScene, "items">): string {
  return scene.items.map((item) => item.id).sort().join("|");
}

export function isFavorite(storage: Storage, scene: IndexedScene): boolean {
  const signature = sceneSignature(scene);
  return getFavorites(storage).some(
    (favorite) => sceneSignature(favorite) === signature,
  );
}

export function addFavorite(storage: Storage, scene: IndexedScene): IndexedScene[] {
  const favorites = getFavorites(storage);
  if (isFavorite(storage, scene) || favorites.length >= MAX_FAVORITES) {
    return favorites;
  }
  const updated = [...favorites, structuredClone(scene)];
  storage.setItem(FAVORITE_SCENES_KEY, JSON.stringify(updated));
  return updated;
}

export function removeFavorite(
  storage: Storage,
  scene: IndexedScene,
): IndexedScene[] {
  const signature = sceneSignature(scene);
  const updated = getFavorites(storage).filter(
    (favorite) => sceneSignature(favorite) !== signature,
  );
  storage.setItem(FAVORITE_SCENES_KEY, JSON.stringify(updated));
  return updated;
}

export function getPriorScene(storage: Storage): IndexedScene | null {
  const prior = readJson<IndexedScene>(storage, PRIOR_SCENE_KEY);
  return prior ? { ...prior, name: "Previous active scene" } : null;
}

export function getActiveScene(storage: Storage): IndexedScene | null {
  const active = readJson<ActiveSceneSnapshot>(storage, ACTIVE_SCENE_KEY);
  return active ? { ...active.scene, name: "Active scene" } : null;
}

export function trackActiveScene(
  storage: Storage,
  snapshot: ActiveSceneSnapshot,
): IndexedScene | null {
  const previous = readJson<ActiveSceneSnapshot>(storage, ACTIVE_SCENE_KEY);
  if (previous && previous.id !== snapshot.id) {
    storage.setItem(PRIOR_SCENE_KEY, JSON.stringify(previous.scene));
  }
  storage.setItem(ACTIVE_SCENE_KEY, JSON.stringify(snapshot));
  return getPriorScene(storage);
}
