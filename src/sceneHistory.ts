import type { Item } from "@owlbear-rodeo/sdk";

export interface IndexedScene {
  name: string;
  items: Item[];
}

export interface ActiveSceneSnapshot {
  id: string;
  scene: IndexedScene;
}

const RECENT_SCENES_KEY = "com.exasperis.obr-extension-test/recent-scenes";
const ACTIVE_SCENE_KEY = "com.exasperis.obr-extension-test/active-scene";
const PRIOR_SCENE_KEY = "com.exasperis.obr-extension-test/prior-scene";

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

export function getRecentScenes(storage: Storage): IndexedScene[] {
  return readJson<IndexedScene[]>(storage, RECENT_SCENES_KEY) ?? [];
}

export function rememberScene(storage: Storage, scene: IndexedScene): IndexedScene[] {
  const signature = scene.items.map((item) => item.id).sort().join("|");
  const recent = getRecentScenes(storage).filter((candidate) => {
    const candidateSignature = candidate.items
      .map((item) => item.id)
      .sort()
      .join("|");
    return candidate.name !== scene.name || candidateSignature !== signature;
  });
  const updated = [structuredClone(scene), ...recent].slice(0, 3);
  storage.setItem(RECENT_SCENES_KEY, JSON.stringify(updated));
  return updated;
}

export function getPriorScene(storage: Storage): IndexedScene | null {
  return readJson<IndexedScene>(storage, PRIOR_SCENE_KEY);
}

export function trackActiveScene(
  storage: Storage,
  snapshot: ActiveSceneSnapshot,
): IndexedScene | null {
  const previous = readJson<ActiveSceneSnapshot>(storage, ACTIVE_SCENE_KEY);
  if (previous && previous.id !== snapshot.id) {
    const prior = { ...previous.scene, name: "Prior active scene" };
    storage.setItem(PRIOR_SCENE_KEY, JSON.stringify(prior));
  }
  storage.setItem(ACTIVE_SCENE_KEY, JSON.stringify(snapshot));
  return getPriorScene(storage);
}
