import type { Image, Item, SceneDownload } from "@owlbear-rodeo/sdk";

export interface SceneSnapshot {
  ready: boolean;
  itemIds: string[];
}

export function getCharacterItems(scene: SceneDownload): Item[] {
  return scene.items.filter((item) => item.layer === "CHARACTER");
}

export function getThumbnail(item: Item): Image["image"] | null {
  if (item.type !== "IMAGE") {
    return null;
  }

  const image = item as Image;
  if (!image.image.mime.toLowerCase().startsWith("image/")) {
    return null;
  }

  return image.image;
}

export function snapshotsMatch(before: SceneSnapshot, after: SceneSnapshot): boolean {
  if (!before.ready || !after.ready) {
    return false;
  }

  return (
    before.itemIds.length === after.itemIds.length &&
    before.itemIds.every((id, index) => id === after.itemIds[index])
  );
}

export function stableItemIds(items: Item[]): string[] {
  return items.map((item) => item.id).sort();
}
