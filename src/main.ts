import OBR, {
  buildEffect,
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

type Verification = "unchanged" | "changed" | "unavailable";

const CROSSHAIR_ID = "com.exasperis.obr-extension-test/placement-crosshair";
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
  return half4(0.80, 0.63, 0.96, alpha * 0.95);
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
        <p class="eyebrow">Owlbear Rodeo experiment</p>
        <h1>Scene Inspector</h1>
        <p class="intro">Inspect character items from another saved scene without opening it in the room.</p>
      </div>
      <button id="pick-scene" type="button" disabled>
        <span class="button-label">Connecting…</span>
      </button>
    </header>
    <div id="status" class="status status-neutral" role="status">
      Waiting for the Owlbear Rodeo SDK.
    </div>
    <section id="results" class="results" aria-live="polite">
      <div class="empty">
        <strong>No scene selected</strong>
        <span>Choose a saved scene to inspect its character layer.</span>
      </div>
    </section>
  </section>
`;

const pickButton = document.querySelector<HTMLButtonElement>("#pick-scene")!;
const buttonLabel = pickButton.querySelector<HTMLElement>(".button-label")!;
const status = document.querySelector<HTMLElement>("#status")!;
const results = document.querySelector<HTMLElement>("#results")!;

function setBusy(busy: boolean): void {
  pickButton.disabled = busy;
  buttonLabel.textContent = busy ? "Opening picker…" : "Pick a scene";
}

function setStatus(message: string, kind: "neutral" | "success" | "warning" | "error"): void {
  status.className = `status status-${kind}`;
  status.textContent = message;
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
      const copy = copyItemForPlacement(item, position);
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

function renderScene(scene: SceneDownload, verification: Verification): void {
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

  if (verification === "unchanged") {
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

    const after = await takeCurrentSceneSnapshot();
    const verification: Verification =
      before.ready && after.ready
        ? snapshotsMatch(before, after)
          ? "unchanged"
          : "changed"
        : "unavailable";
    renderScene(scene, verification);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Unable to inspect the scene: ${message}`, "error");
  } finally {
    setBusy(false);
  }
}

pickButton.addEventListener("click", inspectScene);

OBR.onReady(() => {
  setBusy(false);
  setStatus("Connected. Pick a saved scene to begin.", "neutral");
  void showPlacementCrosshair().catch((error: unknown) => {
    console.warn("Unable to display placement crosshair", error);
  });

  OBR.scene.onReadyChange((ready) => {
    if (ready) {
      void showPlacementCrosshair();
    }
  });
});

window.addEventListener("beforeunload", () => {
  void removePlacementCrosshair();
});
