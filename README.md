# Owlbear Rodeo Scene Inspector

A minimal read-only extension experiment that uses Owlbear Rodeo's native scene
picker to inspect character-layer items in a saved scene without opening that
scene in the room.

## What it tests

The extension calls `OBR.assets.downloadScenes(false)`. The selected
`SceneDownload` includes the scene's items, which are filtered to the
`CHARACTER` layer. Each result card shows item metadata, the full returned JSON,
and a thumbnail when the item is an `IMAGE` with an `image/*` MIME type.

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
- Only items on the `CHARACTER` layer are listed.
- Non-image characters and image items with non-image MIME types use a
  placeholder.
- Broken or inaccessible image URLs fall back to an “Image unavailable”
  placeholder.
