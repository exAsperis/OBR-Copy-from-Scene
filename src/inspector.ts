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
  id: string = crypto.randomUUID(),
): Item {
  const copy = structuredClone(item) as {
    -readonly [Key in keyof Item]: Item[Key];
  };
  copy.id = id;
  copy.position = position;
  copy.attachedTo = undefined;
  copy.disableAutoZIndex = false;
  return copy as Item;
}
