import type {
  Descendant,
  Image,
  Item,
  SceneDownload,
  TextContent,
  Vector2,
} from "@owlbear-rodeo/sdk";

export interface SceneSnapshot {
  ready: boolean;
  itemIds: string[];
}

export function getCharacterItems(scene: Pick<SceneDownload, "items">): Item[] {
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

function flattenRichText(nodes: Descendant[]): string {
  return nodes
    .map((node) => {
      if ("text" in node) {
        return node.text;
      }
      return flattenRichText(node.children);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getItemText(item: Item): string {
  if (!("text" in item)) {
    return "Untitled";
  }

  const text = item.text as TextContent;
  const value =
    text.type === "PLAIN" ? text.plainText.trim() : flattenRichText(text.richText);
  return value || "Untitled";
}

export function copyItemForPlacement(
  item: Item,
  position: Vector2,
  identity: { id: string; userId: string; timestamp: string },
  visible = item.visible,
): Item {
  const copy = structuredClone(item) as {
    -readonly [Key in keyof Item]: Item[Key];
  };
  copy.id = identity.id;
  copy.createdUserId = identity.userId;
  copy.lastModified = identity.timestamp;
  copy.lastModifiedUserId = identity.userId;
  copy.zIndex = Date.parse(identity.timestamp);
  copy.position = position;
  copy.visible = visible;
  copy.attachedTo = undefined;
  copy.disableAutoZIndex = false;
  return copy as Item;
}
