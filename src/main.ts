import OBR, {
  buildEffect,
  buildImage,
  type Image,
  type Item,
  type SceneDownload,
} from "@owlbear-rodeo/sdk";
import "./style.css";
import {
  getCharacterItems,
  copyItemForPlacement,
  getItemText,
  getThumbnail,
  snapshotsMatch,
  stableItemIds,
  type SceneSnapshot,
} from "./inspector";
import {
  getPriorScene,
  getRecentScenes,
  findIndexedSceneName,
  rememberScene,
  trackActiveScene,
  type IndexedScene,
} from "./sceneHistory";

type Verification = "unchanged" | "changed" | "unavailable" | "cached";

const CROSSHAIR_ID = "com.exasperis.obr-extension-test/placement-crosshair";
const SCENE_ID_METADATA = "com.exasperis.obr-extension-test/scene-id";
const SCENE_NAME_METADATA = "com.exasperis.obr-extension-test/scene-name";
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
        <h1>Scene Inspector</h1>
        <p class="intro">Copy character items from any saved scene to the active scene.</p>
      </div>
    </header>
    <nav id="scene-shortcuts" class="scene-shortcuts" aria-label="Indexed scenes"></nav>
    <section id="results" class="results" aria-live="polite">
      <div class="empty">
        <strong>No scene selected</strong>
        <span>Choose a saved scene to inspect its character layer.</span>
      </div>
    </section>
  </section>
`;

const results = document.querySelector<HTMLElement>("#results")!;
const shortcuts = document.querySelector<HTMLElement>("#scene-shortcuts")!;
let pickButton: HTMLButtonElement | null = null;
let activeSceneId: string | null = null;
let activeSceneName = "Previous scene (name unavailable)";

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

function renderShortcuts(): void {
  shortcuts.replaceChildren();
  const recent = getRecentScenes(localStorage);
  const prior = getPriorScene(localStorage);

  const addSceneButton = (scene: IndexedScene): void => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scene-shortcut";
    button.textContent = scene.name;
    button.addEventListener("click", () => renderScene(scene, "cached"));
    shortcuts.append(button);
  };

  for (const scene of recent) {
    addSceneButton(scene);
  }
  if (prior) {
    addSceneButton(prior);
  }

  pickButton = document.createElement("button");
  pickButton.type = "button";
  pickButton.className = "scene-shortcut scene-shortcut-pick";
  pickButton.textContent = "Pick another scene";
  pickButton.addEventListener("click", inspectScene);
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
  const storedName = metadata[SCENE_NAME_METADATA];
  const indexedName = findIndexedSceneName(localStorage, items);
  activeSceneName =
    typeof storedName === "string"
      ? storedName
      : indexedName ?? "Previous scene (name unavailable)";
  if (typeof storedName !== "string" && indexedName) {
    await OBR.scene.setMetadata({ [SCENE_NAME_METADATA]: indexedName });
  }
  trackActiveScene(localStorage, {
    id: activeSceneId,
    scene: { name: activeSceneName, items },
  });
  renderShortcuts();
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
  card.append(createThumbnail(item));

  const body = document.createElement("div");
  body.className = "card-body";

  const title = document.createElement("strong");
  title.className = "item-text";
  title.textContent = getItemText(item);
  const name = document.createElement("span");
  name.className = "item-name";
  name.textContent = item.name || "Unnamed item";
  body.append(title, name);

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
  return card;
}

function renderScene(scene: IndexedScene, verification: Verification): void {
  const characters = getCharacterItems(scene);
  results.replaceChildren();

  const summary = document.createElement("header");
  summary.className = "scene-summary";
  const heading = document.createElement("h2");
  heading.textContent = scene.name;
  const count = document.createElement("span");
  count.className = "count";
  count.textContent = `${characters.length} character${characters.length === 1 ? "" : "s"}`;
  summary.append(heading, count);
  results.append(summary);

  if (verification === "cached") {
    setStatus(`Loaded indexed scene “${scene.name}”.`, "neutral");
  } else if (verification === "unchanged") {
    setStatus(
      "Active scene unchanged — it remained ready with the same item IDs before and after inspection.",
      "success",
    );
  } else if (verification === "changed") {
    setStatus(
      "The active scene item set changed while the picker was open. This may be a scene switch or a concurrent room edit.",
      "warning",
    );
  } else {
    setStatus(
      "Selected scene loaded, but the active scene was not ready for a before-and-after comparison.",
      "warning",
    );
  }

  if (characters.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.innerHTML = `<strong>No character items</strong><span>This scene has no items on the CHARACTER layer.</span>`;
    results.append(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "item-list";
  for (const item of characters) {
    grid.append(createItemCard(item));
  }
  results.append(grid);
}

async function inspectScene(): Promise<void> {
  setBusy(true);
  setStatus("Waiting for a scene selection…", "neutral");

  try {
    const before = await takeCurrentSceneSnapshot();
    const scenes = await OBR.assets.downloadScenes(false);

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
    try {
      rememberScene(localStorage, indexedScene);
    } catch (error) {
      console.warn("Unable to persist indexed scene", error);
    }
    renderShortcuts();

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
          <p class="eyebrow">Scene Inspector</p>
          <h1>GM-only extension</h1>
          <p class="intro">There are no player-facing functions in this extension.</p>
        </section>
      `;
      return;
    }

    setBusy(false);
    setStatus("Connected. Pick a saved scene to begin.", "neutral");
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
        activeSceneName = "Previous scene (name unavailable)";
      }
    });

    OBR.scene.items.onChange((items) => {
      if (!activeSceneId) {
        return;
      }
      trackActiveScene(localStorage, {
        id: activeSceneId,
        scene: { name: activeSceneName, items },
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
