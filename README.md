# Owlbear Rodeo: Copy from Scene

An Owlbear Rodeo extension that uses the native scene picker to inspect and copy
items from a saved scene without opening that scene in the room.

## What it tests

The extension calls `OBR.assets.downloadScenes(false)`. The selected
`SceneDownload` includes the scene's items, which are grouped into collapsible
layer sections in Z-order. Items can be filtered by name, text, or metadata.
Each result card includes optional full JSON and a 48px thumbnail when the item
is an `IMAGE` with an `image/*` MIME type.
Each row can place a full copy of that item in the center of the current
viewport, preserving its metadata and image data while assigning a fresh ID.
While the extension is open, a local-only fixed-pixel crosshair marks that exact
placement point. It uses a viewport effect, so it remains centered and the same
size while the map pans or zooms. Closing the extension panel removes it.

The scene picker and placement controls are available only to GMs. Owlbear
Rodeo's manifest format cannot hide an action by player role, so players see a
short message explaining that the extension has no player-facing functions.

Up to eight scenes can be explicitly saved as persistent favorites and removed
individually. The extension also assigns a private metadata ID to active scenes
so it can retain clickable snapshots labeled **Previous active scene** and
**Active scene**. Layer expansion state is saved in GM player metadata under
`com.ex-asperis.copy-from-scene`.

The extension also snapshots the active scene's sorted item IDs before and after
the picker. An unchanged result is strong evidence that the picker did not
switch the room scene. The SDK does not expose the active scene ID, so this
diagnostic cannot distinguish a scene switch between two scenes with identical
item IDs or concurrent edits while the picker is open.

Image URLs are displayed exactly as Owlbear returns them. They are not
downloaded, converted, or persisted and may be temporary or access-controlled.

## Local development

Requirements: Node.js 22+ and pnpm.

```sh
pnpm install
pnpm dev
```

Vite serves the extension at:

- App: `http://localhost:5173/OBR-Extension-Test/`
- Manifest: `http://localhost:5173/OBR-Extension-Test/manifest.json`

Add the manifest URL in Owlbear Rodeo's extension management screen. Owlbear
Rodeo permits localhost during development.

## Checks

```sh
pnpm typecheck
pnpm test
pnpm build
```

## GitHub Pages

Pushes to `main` run the Pages workflow. Once GitHub Pages is configured to use
**GitHub Actions** as its source, install the extension from:

`https://exasperis.github.io/OBR-Extension-Test/manifest.json`

The production app is:

`https://exasperis.github.io/OBR-Extension-Test/`

## Limitations

- The picker shares one scene at a time.
- Inspection is read-only.
- Source-scene inspection is read-only; **Place** adds a copy to the current
  scene.
- Owlbear Rodeo does not expose a supported way to drag an item from an
  extension iframe onto the scene, so placement uses an explicit button.
- Non-image characters and image items with non-image MIME types use a
  placeholder.
- Broken or inaccessible image URLs fall back to an “Image unavailable”
  placeholder.
