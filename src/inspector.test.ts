import { describe, expect, it } from "vitest";
import type { Image, Item, SceneDownload } from "@owlbear-rodeo/sdk";
import {
  getCharacterItems,
  copyItemForPlacement,
  getItemText,
  getThumbnail,
  snapshotsMatch,
  stableItemIds,
} from "./inspector";

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    type: "SHAPE",
    name: "Test",
    visible: true,
    locked: false,
    createdUserId: "user",
    zIndex: 0,
    lastModified: "2026-01-01",
    lastModifiedUserId: "user",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    metadata: {},
    layer: "PROP",
    ...overrides,
  } as Item;
}

function imageItem(mime = "image/png"): Image {
  return {
    ...item({ id: "image-1", type: "IMAGE", layer: "CHARACTER" }),
    type: "IMAGE",
    image: {
      width: 300,
      height: 200,
      mime,
      url: "https://example.com/character.png",
    },
    grid: { dpi: 150, offset: { x: 0, y: 0 } },
    text: {
      type: "PLAIN",
      plainText: "",
      richText: [],
      width: "AUTO",
      height: "AUTO",
      style: {
        fillColor: "#fff",
        fillOpacity: 1,
        strokeColor: "#000",
        strokeOpacity: 1,
        strokeWidth: 0,
        textAlign: "CENTER",
        textAlignVertical: "MIDDLE",
        fontFamily: "sans-serif",
        fontSize: 12,
        fontWeight: 400,
        lineHeight: 1,
        padding: 0,
      },
    },
    textItemType: "LABEL",
  } as Image;
}

describe("getCharacterItems", () => {
  it("returns only character-layer items with metadata and image data intact", () => {
    const character = imageItem();
    character.metadata = { "example.test/data": { hp: 12, tags: ["hero"] } };
    const scene = {
      name: "Other Scene",
      items: [item(), character],
    } as SceneDownload;

    const result = getCharacterItems(scene);

    expect(result).toEqual([character]);
    expect(result[0]?.metadata).toEqual({
      "example.test/data": { hp: 12, tags: ["hero"] },
    });
    expect((result[0] as Image).image.url).toBe(
      "https://example.com/character.png",
    );
  });

  it("returns an empty list when the scene has no character items", () => {
    expect(
      getCharacterItems({ name: "Empty", items: [item()] } as SceneDownload),
    ).toEqual([]);
  });
});

describe("getThumbnail", () => {
  it("returns image content for displayable image MIME types", () => {
    expect(getThumbnail(imageItem("image/webp"))?.mime).toBe("image/webp");
  });

  it("rejects video image items and non-image character items", () => {
    expect(getThumbnail(imageItem("video/webm"))).toBeNull();
    expect(getThumbnail(item({ layer: "CHARACTER" }))).toBeNull();
  });
});

describe("getItemText", () => {
  it("uses image text as the primary display identifier", () => {
    const character = imageItem();
    character.text.plainText = "Goblin 3";
    expect(getItemText(character)).toBe("Goblin 3");
  });

  it("falls back when an item has no text", () => {
    expect(getItemText(item({ layer: "CHARACTER" }))).toBe("Untitled");
  });
});

describe("copyItemForPlacement", () => {
  it("preserves item data while assigning a new ID and position", () => {
    const source = imageItem();
    source.metadata = { "example.test/data": { hp: 7 } };
    source.attachedTo = "old-parent";

    const copy = copyItemForPlacement(source, { x: 40, y: 60 }, {
      id: "new-id",
      userId: "current-user",
      timestamp: "2026-07-29T12:00:00.000Z",
    });

    expect(copy.id).toBe("new-id");
    expect(copy.position).toEqual({ x: 40, y: 60 });
    expect(copy.metadata).toEqual(source.metadata);
    expect((copy as Image).image).toEqual(source.image);
    expect(copy.attachedTo).toBeUndefined();
    expect(copy.createdUserId).toBe("current-user");
    expect(copy.lastModifiedUserId).toBe("current-user");
    expect(copy.lastModified).toBe("2026-07-29T12:00:00.000Z");
    expect(source.id).toBe("image-1");
  });
});

describe("scene snapshot comparison", () => {
  it("sorts item IDs and matches equivalent ready snapshots", () => {
    expect(stableItemIds([item({ id: "b" }), item({ id: "a" })])).toEqual([
      "a",
      "b",
    ]);
    expect(
      snapshotsMatch(
        { ready: true, itemIds: ["a", "b"] },
        { ready: true, itemIds: ["a", "b"] },
      ),
    ).toBe(true);
  });

  it("does not match changed or unavailable snapshots", () => {
    expect(
      snapshotsMatch(
        { ready: true, itemIds: ["a"] },
        { ready: true, itemIds: ["b"] },
      ),
    ).toBe(false);
    expect(
      snapshotsMatch(
        { ready: false, itemIds: [] },
        { ready: true, itemIds: [] },
      ),
    ).toBe(false);
  });
});
