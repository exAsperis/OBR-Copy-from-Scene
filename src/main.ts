import OBR, { type Item, type SceneDownload } from "@owlbear-rodeo/sdk";
import "./style.css";
import {
  getCharacterItems,
  getThumbnail,
  snapshotsMatch,
  stableItemIds,
  type SceneSnapshot,
} from "./inspector";

type Verification = "unchanged" | "changed" | "unavailable";

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

function createMetadata(metadata: Item["metadata"]): HTMLElement {
  const container = document.createElement("div");
  container.className = "metadata";

  const entries = Object.entries(metadata);
  if (entries.length === 0) {
    container.innerHTML = `<span class="muted">No metadata</span>`;
    return container;
  }

  for (const [key, value] of entries) {
    const row = document.createElement("div");
    row.className = "metadata-row";

    const keyElement = document.createElement("code");
    keyElement.textContent = key;

    const valueElement = document.createElement("pre");
    valueElement.textContent = JSON.stringify(value, null, 2);

    row.append(keyElement, valueElement);
    container.append(row);
  }

  return container;
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

  const heading = document.createElement("div");
  heading.className = "card-heading";
  const title = document.createElement("h3");
  title.textContent = item.name || "Unnamed character";
  const badge = document.createElement("span");
  badge.className = "type-badge";
  badge.textContent = item.type;
  heading.append(title, badge);

  const facts = document.createElement("dl");
  facts.className = "facts";
  const factValues: Array<[string, string]> = [
    ["ID", item.id],
    ["Visible", item.visible ? "Yes" : "No"],
    ["Locked", item.locked ? "Yes" : "No"],
  ];
  for (const [label, value] of factValues) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    facts.append(term, description);
  }

  const metadataTitle = document.createElement("h4");
  metadataTitle.textContent = "Metadata";

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Complete item JSON";
  const json = document.createElement("pre");
  json.className = "raw-json";
  json.textContent = JSON.stringify(item, null, 2);
  details.append(summary, json);

  body.append(heading, facts, metadataTitle, createMetadata(item.metadata), details);
  card.append(body);
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
  grid.className = "card-grid";
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
});
