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

function sceneSignature(scene: Pick<IndexedScene, "items">): string {
  return scene.items.map((item) => item.id).sort().join("|");
}

export function findIndexedSceneName(
  storage: Storage,
  items: Item[],
): string | null {
  const signature = sceneSignature({ items });
  return (
    getRecentScenes(storage).find(
      (scene) => sceneSignature(scene) === signature,
    )?.name ?? null
  );
}

export function rememberScene(storage: Storage, scene: IndexedScene): IndexedScene[] {
  const signature = sceneSignature(scene);
  const recent = getRecentScenes(storage).filter((candidate) => {
    const candidateSignature = sceneSignature(candidate);
    return candidate.name !== scene.name || candidateSignature !== signature;
  });
  const updated = [structuredClone(scene), ...recent].slice(0, 3);
  storage.setItem(RECENT_SCENES_KEY, JSON.stringify(updated));
  return updated;
}

export function getPriorScene(storage: Storage): IndexedScene | null {
  const prior = readJson<IndexedScene>(storage, PRIOR_SCENE_KEY);
  if (!prior || prior.name !== "Prior active scene") {
    return prior;
  }

  return {
    ...prior,
    name:
      findIndexedSceneName(storage, prior.items) ??
      "Previous scene (name unavailable)",
  };
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
