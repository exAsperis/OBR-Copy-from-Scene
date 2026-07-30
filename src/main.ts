import OBR, {
  buildEffect,
  buildImage,
  type Image,
  type Item,
  type Layer,
  type SceneDownload,
} from "@owlbear-rodeo/sdk";
import "./style.css";
import {
  copyItemForPlacement,
  getItemText,
  getThumbnail,
  snapshotsMatch,
  stableItemIds,
  type SceneSnapshot,
} from "./inspector";
import {
  addFavorite,
  getActiveScene,
  getFavorites,
  getPriorScene,
  isFavorite,
  MAX_FAVORITES,
  removeFavorite,
  refreshFavorite,
  trackActiveScene,
  type IndexedScene,
} from "./sceneHistory";

type Verification = "unchanged" | "changed" | "unavailable" | "cached";

const CROSSHAIR_ID = "com.exasperis.obr-extension-test/placement-crosshair";
const SCENE_ID_METADATA = "com.exasperis.obr-extension-test/scene-id";
const PLAYER_METADATA_ID = "com.ex-asperis.copy-from-scene";
const LAYER_ORDER: Layer[] = [
  "FOG",
  "POST_PROCESS",
  "CONTROL",
  "POPOVER",
  "POINTER",
  "RULER",
  "TEXT",
  "NOTE",
  "ATTACHMENT",
  "CHARACTER",
  "MOUNT",
  "PROP",
  "DRAWING",
  "GRID",
  "MAP",
];
const LAYER_LABELS: Record<Layer, string> = {
  POPOVER: "Popovers",
  CONTROL: "Controls",
  POST_PROCESS: "Post-processing",
  POINTER: "Pointers",
  FOG: "Fog",
  RULER: "Rulers",
  TEXT: "Text",
  NOTE: "Notes",
  ATTACHMENT: "Attachments",
  CHARACTER: "Characters",
  MOUNT: "Mounts",
  PROP: "Props",
  DRAWING: "Drawings",
  GRID: "Grid",
  MAP: "Maps",
};
const CROSSHAIR_SHADER = `
uniform vec2 size;
uniform mat3 view;

half4 main(float2 coord) {
  vec2 screen = (vec3(coord, 1.0) * view).xy;
  vec2 distanceFromCenter = abs(screen - size * 0.5);

  float horizontalArm =
    (1.0 - smoothstep(1.0, 2.0, distanceFromCenter.y)) *
    smoothstep(7.0, 8.0, distanceFromCenter.x) *
    (1.0 - smoothstep(19.0, 20.0, distanceFromCenter.x));
  float verticalArm =
    (1.0 - smoothstep(1.0, 2.0, distanceFromCenter.x)) *
    smoothstep(7.0, 8.0, distanceFromCenter.y) *
    (1.0 - smoothstep(19.0, 20.0, distanceFromCenter.y));

  float squareDistance = max(distanceFromCenter.x, distanceFromCenter.y);
  float squareOutline =
    (1.0 - smoothstep(7.0, 8.0, squareDistance)) *
    smoothstep(5.0, 6.0, squareDistance);

  float alpha = max(squareOutline, max(horizontalArm, verticalArm));
  float finalAlpha = alpha * 0.95;
  vec3 color = vec3(0.80, 0.63, 0.96);
  return half4(color * finalAlpha, finalAlpha);
}
`;

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

app.innerHTML = `
  <section class="shell">
    <header class="hero">
      <div>
        <h1>Copy from Scene</h1>
        <p class="intro">Copy items from any saved scene to the active scene.</p>
      </div>
    </header>
    <nav id="scene-shortcuts" class="scene-shortcuts" aria-label="Indexed scenes"></nav>
    <section id="results" class="results" aria-live="polite">
      <div class="empty">
        <strong>No scene selected</strong>
        <span>Choose a saved scene to inspect its items.</span>
      </div>
    </section>
  </section>
`;

const results = document.querySelector<HTMLElement>("#results")!;
const shortcuts = document.querySelector<HTMLElement>("#scene-shortcuts")!;
let pickButton: HTMLButtonElement | null = null;
let activeSceneId: string | null = null;
let sectionState: Partial<Record<Layer, boolean>> = { CHARACTER: true };

function setBusy(busy: boolean): void {
  if (pickButton) {
    pickButton.disabled = busy;
    pickButton.textContent = busy ? "Opening picker…" : "Pick another scene";
  }
}

function setStatus(message: string, kind: "neutral" | "success" | "warning" | "error"): void {
  if (kind === "error") {
    console.error(message);
  }
}

async function takeCurrentSceneSnapshot(): Promise<SceneSnapshot> {
  const ready = await OBR.scene.isReady();
  if (!ready) {
    return { ready: false, itemIds: [] };
  }

  const items = await OBR.scene.items.getItems();
  return { ready: true, itemIds: stableItemIds(items) };
}

async function removePlacementCrosshair(): Promise<void> {
  if (await OBR.scene.isReady()) {
    await OBR.scene.local.deleteItems([CROSSHAIR_ID]);
  }
}

async function showPlacementCrosshair(): Promise<void> {
  if (!(await OBR.scene.isReady())) {
    return;
  }

  await OBR.scene.local.deleteItems([CROSSHAIR_ID]);
  const crosshair = buildEffect()
    .id(CROSSHAIR_ID)
    .name("Placement crosshair")
    .effectType("VIEWPORT")
    .sksl(CROSSHAIR_SHADER)
    .blendMode("SRC_OVER")
    .layer("CONTROL")
    .locked(true)
    .disableHit(true)
    .zIndex(1_000_000)
    .build();
  await OBR.scene.local.addItems([crosshair]);
}

async function createPlacementCopy(item: Item, position: { x: number; y: number }): Promise<Item> {
  if (item.type === "IMAGE") {
    const source = item as Image;
    const builder = buildImage(
      structuredClone(source.image),
      structuredClone(source.grid),
    )
      .name(source.name)
      .position(position)
      .rotation(source.rotation)
      .scale(structuredClone(source.scale))
      .visible(source.visible)
      .locked(source.locked)
      .metadata(structuredClone(source.metadata))
      .layer(source.layer)
      .text(structuredClone(source.text))
      .textItemType(source.textItemType)
      .disableAutoZIndex(false);

    if (source.description) {
      builder.description(source.description);
    }
    if (source.disableHit !== undefined) {
      builder.disableHit(source.disableHit);
    }
    if (source.disableAttachmentBehavior) {
      builder.disableAttachmentBehavior(
        structuredClone(source.disableAttachmentBehavior),
      );
    }
    return builder.build();
  }

  const timestamp = new Date().toISOString();
  return copyItemForPlacement(item, position, {
    id: crypto.randomUUID(),
    userId: await OBR.player.getId(),
    timestamp,
  });
}

async function loadSectionState(): Promise<void> {
  const metadata = await OBR.player.getMetadata();
  const value = metadata[PLAYER_METADATA_ID];
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "sections" in value
  ) {
    const sections = (value as { sections?: unknown }).sections;
    if (sections && typeof sections === "object" && !Array.isArray(sections)) {
      sectionState = {
        CHARACTER: true,
        ...(sections as Partial<Record<Layer, boolean>>),
      };
    }
  }
}

function persistSectionState(): void {
  void OBR.player
    .setMetadata({
      [PLAYER_METADATA_ID]: { sections: sectionState },
    })
    .catch((error: unknown) => {
      console.warn("Unable to persist section state", error);
    });
}

function renderShortcuts(): void {
  shortcuts.replaceChildren();
  const favorites = getFavorites(localStorage);
  const prior = getPriorScene(localStorage);
  const active = getActiveScene(localStorage);

  const addSceneButton = (
    scene: IndexedScene,
    options: {
      activeRefresh?: boolean;
      disabled?: boolean;
      removable?: boolean;
      refreshFavorite?: boolean;
    } = {},
  ): void => {
    const row = document.createElement("div");
    row.className = `scene-shortcut-row${options.removable ? " favorite-row" : ""}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scene-shortcut";
    button.textContent = scene.name;
    button.disabled = options.disabled ?? false;
    button.addEventListener("click", () => {
      if (options.refreshFavorite) {
        void inspectScene(scene.name, scene.name);
      } else if (options.activeRefresh) {
        void refreshActiveSceneIndex();
      } else {
        renderScene(scene, "cached");
      }
    });
    row.append(button);

    if (options.removable) {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove-favorite";
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", `Remove ${scene.name} from favorites`);
      removeButton.addEventListener("click", () => {
        removeFavorite(localStorage, scene);
        renderShortcuts();
      });
      row.append(removeButton);
    }
    shortcuts.append(row);
  };

  for (const scene of favorites) {
    addSceneButton(scene, { removable: true, refreshFavorite: true });
  }
  addSceneButton(
    prior ?? { name: "Previous active scene (cached)", items: [] },
    { disabled: !prior },
  );
  if (active) {
    addSceneButton(active, { activeRefresh: true });
  } else if (activeSceneId) {
    addSceneButton(
      { name: "Active scene", items: [] },
      { activeRefresh: true },
    );
  }

  pickButton = document.createElement("button");
  pickButton.type = "button";
  pickButton.className = "scene-shortcut scene-shortcut-pick";
  pickButton.textContent = "Pick another scene";
  pickButton.addEventListener("click", () => void inspectScene());
  shortcuts.append(pickButton);
}

async function syncActiveSceneHistory(): Promise<void> {
  if (!(await OBR.scene.isReady())) {
    activeSceneId = null;
    return;
  }

  const metadata = await OBR.scene.getMetadata();
  const existingId = metadata[SCENE_ID_METADATA];
  activeSceneId =
    typeof existingId === "string" ? existingId : crypto.randomUUID();
  if (existingId !== activeSceneId) {
    await OBR.scene.setMetadata({ [SCENE_ID_METADATA]: activeSceneId });
  }

  const items = await OBR.scene.items.getItems();
  trackActiveScene(localStorage, {
    id: activeSceneId,
    scene: { name: "Active scene", items },
  });
  renderShortcuts();
}

async function refreshActiveSceneIndex(): Promise<void> {
  if (!(await OBR.scene.isReady())) {
    return;
  }
  if (!activeSceneId) {
    await syncActiveSceneHistory();
  }
  if (!activeSceneId) {
    return;
  }

  const items = await OBR.scene.items.getItems();
  const scene: IndexedScene = { name: "Active scene", items };
  trackActiveScene(localStorage, { id: activeSceneId, scene });
  renderShortcuts();
  renderScene(scene, "cached");
}

function createThumbnail(item: Item): HTMLElement {
  const frame = document.createElement("div");
  frame.className = "thumbnail";
  const imageContent = getThumbnail(item);

  if (!imageContent) {
    frame.classList.add("thumbnail-placeholder");
    frame.textContent = "No image preview";
    return frame;
  }

  const image = document.createElement("img");
  image.src = imageContent.url;
  image.alt = item.description || item.name || "Character image";
  image.loading = "lazy";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => {
    image.remove();
    frame.classList.add("thumbnail-placeholder");
    frame.textContent = "Image unavailable";
  });
  frame.append(image);
  return frame;
}

function createItemCard(item: Item): HTMLElement {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.itemSearch = [
    item.name,
    getItemText(item),
    JSON.stringify(item.metadata),
  ]
    .join(" ")
    .toLocaleLowerCase();
  card.append(createThumbnail(item));

  const body = document.createElement("div");
  body.className = "card-body";

  const title = document.createElement("strong");
  title.className = "item-text";
  title.textContent = item.name || "Unnamed item";
  const name = document.createElement("span");
  name.className = "item-name";
  name.textContent = getItemText(item);
  const metadataToggle = document.createElement("button");
  metadataToggle.type = "button";
  metadataToggle.className = "metadata-toggle";
  metadataToggle.textContent = "Metadata (JSON)";
  metadataToggle.setAttribute("aria-expanded", "false");
  body.append(title, name, metadataToggle);

  const placeButton = document.createElement("button");
  placeButton.className = "place-button";
  placeButton.type = "button";
  placeButton.textContent = "Place";
  placeButton.addEventListener("click", async () => {
    placeButton.disabled = true;
    placeButton.textContent = "Placing…";
    try {
      if (!(await OBR.scene.isReady())) {
        throw new Error("Open a scene before placing an item.");
      }
      const [width, height] = await Promise.all([
        OBR.viewport.getWidth(),
        OBR.viewport.getHeight(),
      ]);
      const position = await OBR.viewport.inverseTransformPoint({
        x: width / 2,
        y: height / 2,
      });
      const copy = await createPlacementCopy(item, position);
      await OBR.scene.items.addItems([copy]);
      setStatus(`Placed “${getItemText(item)}” in the center of the current view.`, "success");
      placeButton.textContent = "Placed";
      window.setTimeout(() => {
        placeButton.disabled = false;
        placeButton.textContent = "Place";
      }, 900);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Unable to place item: ${message}`, "error");
      placeButton.disabled = false;
      placeButton.textContent = "Place";
    }
  });

  card.append(body);
  card.append(placeButton);

  const json = document.createElement("pre");
  json.className = "item-json";
  json.hidden = true;
  json.textContent = JSON.stringify(item, null, 2);
  metadataToggle.addEventListener("click", () => {
    json.hidden = !json.hidden;
    metadataToggle.setAttribute("aria-expanded", String(!json.hidden));
  });
  card.append(json);
  return card;
}

function renderScene(scene: IndexedScene, verification: Verification): void {
  results.replaceChildren();

  const summary = document.createElement("header");
  summary.className = "scene-summary";
  const headingGroup = document.createElement("div");
  headingGroup.className = "scene-heading";
  const heading = document.createElement("h2");
  heading.textContent = scene.name;
  headingGroup.append(heading);
  const favorites = getFavorites(localStorage);
  if (!isFavorite(localStorage, scene) && favorites.length < MAX_FAVORITES) {
    const saveFavorite = document.createElement("button");
    saveFavorite.type = "button";
    saveFavorite.className = "save-favorite";
    saveFavorite.textContent = "Save this scene to favorites";
    saveFavorite.addEventListener("click", () => {
      addFavorite(localStorage, scene);
      renderShortcuts();
      renderScene(scene, verification);
    });
    headingGroup.append(saveFavorite);
  }
  const count = document.createElement("span");
  count.className = "count";
  count.textContent = `${scene.items.length} item${scene.items.length === 1 ? "" : "s"}`;
  summary.append(headingGroup, count);
  results.append(summary);

  const filter = document.createElement("input");
  filter.className = "item-filter";
  filter.type = "search";
  filter.placeholder = "Filter items";
  filter.setAttribute("aria-label", "Filter items by name, text, or metadata");
  results.append(filter);

  if (scene.items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `<strong>No items</strong><span>This scene snapshot contains no items.</span>`;
    results.append(empty);
    return;
  }

  const sections = document.createElement("div");
  sections.className = "layer-sections";
  const populatedLayers = new Map<Layer, Item[]>();
  for (const item of scene.items) {
    const items = populatedLayers.get(item.layer) ?? [];
    items.push(item);
    populatedLayers.set(item.layer, items);
  }

  for (const layer of LAYER_ORDER) {
    const items = populatedLayers.get(layer);
    if (!items?.length) {
      continue;
    }
    items.sort((a, b) => {
      const nameOrder = (a.name || "").localeCompare(b.name || "", undefined, {
        sensitivity: "base",
      });
      return (
        nameOrder ||
        getItemText(a).localeCompare(getItemText(b), undefined, {
          sensitivity: "base",
        })
      );
    });

    const details = document.createElement("details");
    details.className = "layer-section";
    details.open = sectionState[layer] ?? layer === "CHARACTER";
    details.dataset.layer = layer;
    const sectionSummary = document.createElement("summary");
    const label = document.createElement("span");
    label.textContent = LAYER_LABELS[layer];
    const layerCount = document.createElement("span");
    layerCount.className = "layer-count";
    layerCount.textContent = String(items.length);
    sectionSummary.append(label, layerCount);
    details.append(sectionSummary);

    const list = document.createElement("div");
    list.className = "item-list";
    for (const item of items) {
      list.append(createItemCard(item));
    }
    details.append(list);
    details.addEventListener("toggle", () => {
      sectionState[layer] = details.open;
      persistSectionState();
    });
    sections.append(details);
  }
  results.append(sections);

  filter.addEventListener("input", () => {
    const query = filter.value.trim().toLocaleLowerCase();
    for (const card of sections.querySelectorAll<HTMLElement>("[data-item-search]")) {
      card.hidden = Boolean(query) && !card.dataset.itemSearch?.includes(query);
    }
    for (const section of sections.querySelectorAll<HTMLDetailsElement>(".layer-section")) {
      const visibleItems = [...section.querySelectorAll<HTMLElement>("[data-item-search]")]
        .filter((card) => !card.hidden).length;
      section.hidden = visibleItems === 0;
      const layerCount = section.querySelector<HTMLElement>(".layer-count");
      if (layerCount) {
        layerCount.textContent = String(visibleItems);
      }
    }
  });
}

async function inspectScene(
  defaultSearch?: string,
  favoriteToRefresh?: string,
): Promise<void> {
  setBusy(true);
  setStatus("Waiting for a scene selection…", "neutral");

  try {
    const before = await takeCurrentSceneSnapshot();
    const scenes = await OBR.assets.downloadScenes(false, defaultSearch);

    if (scenes.length === 0) {
      setStatus("Scene selection cancelled. Nothing changed.", "neutral");
      return;
    }

    const scene = scenes[0];
    if (!scene) {
      throw new Error("The scene picker returned no scene data.");
    }

    const indexedScene: IndexedScene = {
      name: scene.name,
      items: scene.items,
    };
    if (favoriteToRefresh) {
      refreshFavorite(localStorage, favoriteToRefresh, indexedScene);
      renderShortcuts();
    }
    const after = await takeCurrentSceneSnapshot();
    const verification: Verification =
      before.ready && after.ready
        ? snapshotsMatch(before, after)
          ? "unchanged"
          : "changed"
        : "unavailable";
    renderScene(indexedScene, verification);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Unable to inspect the scene: ${message}`, "error");
  } finally {
    setBusy(false);
  }
}

OBR.onReady(() => {
  void (async () => {
    await OBR.action.setWidth(380);
    await removePlacementCrosshair();

    const role = await OBR.player.getRole();
    if (role !== "GM") {
      app.innerHTML = `
        <section class="shell player-message">
          <p class="eyebrow">Copy from Scene</p>
          <h1>GM-only extension</h1>
          <p class="intro">There are no player-facing functions in this extension.</p>
        </section>
      `;
      return;
    }

    setBusy(false);
    setStatus("Connected. Pick a saved scene to begin.", "neutral");
    await loadSectionState();
    await syncActiveSceneHistory();

    if (await OBR.action.isOpen()) {
      await showPlacementCrosshair();
    }

    OBR.action.onOpenChange((isOpen) => {
      const updateCrosshair = isOpen
        ? showPlacementCrosshair()
        : removePlacementCrosshair();
      void updateCrosshair.catch((error: unknown) => {
        console.warn("Unable to update placement crosshair", error);
      });
    });

    OBR.scene.onReadyChange((ready) => {
      if (ready) {
        void syncActiveSceneHistory().then(() =>
          OBR.action.isOpen().then((isOpen) => {
            if (isOpen) {
              return showPlacementCrosshair();
            }
          }),
        );
      } else {
        activeSceneId = null;
      }
    });

    OBR.scene.items.onChange((items) => {
      if (!activeSceneId) {
        return;
      }
      trackActiveScene(localStorage, {
        id: activeSceneId,
        scene: { name: "Active scene", items },
      });
    });
  })().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Unable to initialize the extension: ${message}`, "error");
  });
});

window.addEventListener("beforeunload", () => {
  void removePlacementCrosshair();
});
