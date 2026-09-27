# Graphics in the editor: import, tiles, pixel editing

Every image the game uses can be imported, drawn and changed in the editor – board and battle
sprites, faces, tiles and decor, icons, backgrounds, the title image and the game's own interface
graphics – each in a pixel editor that fits its kind and previews it the way the game shows it.

- Sheet layouts: [public/assets/ASSETS.md](../public/assets/ASSETS.md)
- Projects, the library, the Resources screen: [projects.md](projects.md) §6
- Work packages: G1–G7 in [packages.md](packages.md)

## 1. The images

| Kind | Where | Layout (ASSETS.md) | Preview |
|---|---|---|---|
| Board sprites (charsets) | content, `charsets/` | 3 × 4 frames (step, idle, step × SE, SW, NE, NW) | walking in all four directions |
| Battle sprites (battlers) | content, `battlers/` | a row of poses (6 for heroes, 4 for creatures) | each pose, the idle breathing, an attack – on a battle background |
| Faces | content, `faces/` | 48 × 48 | at 48, 24 and 14 px, and in the text box |
| Battle backgrounds | content, `battlebacks/` | 480 × 190, a floor row | the battle scene: floor line, a party and an enemy standing on it |
| Tiles (chipset blocks) | content, `chipsets/<id>.png` | 32 × 24 blocks, 8 columns | stacked blocks on a small board, in all four view rotations; animated terrain cycles |
| Decor | content, `chipsets/<id>_decor.png` | 32 × 48, anchor (16, 40), 8 columns | standing on a cell next to a character; its rotation frames in turn |
| Wall signs | content, `signs/` | 48 × 14 frames | painted onto a wall face |
| Icons (items, abilities, statuses, shop signs) | game image | 16 × 16, 16 columns, named | in an item list, a menu row, a shop window |
| Status markers | game image | 10 × 10, one row, named | side by side above a character |
| Title background | game image | 480 × 270 | the title screen with its menu |
| Window skin | game image | 48 × 48, 9-slice (8 px borders) | a text box and a menu, stretched |
| Cursors, board cursor, highlights, exit arrows, field effects, shadow | game images | see ASSETS.md §6 | on a small board (field effects animated) |
| Font | game image | 8 × 12 cells, ASCII 32–126 | a sample line in the text box |

**Content images** belong to the library or the project (projects.md §4). **Game images** are the
runtime's own (`public/assets/system/`) – a project can have its own copy of any of them (§2).

## 2. Game images per project (a game change)

A project may carry its own version of a runtime image: `assets/system/<file>.png` in the project,
listed in its `data/graphics.yaml`:

```yaml
system:
  images: [title_bg, window, icons]   # the project's own copies (assets/system/<name>.png)
  icons: { sword: 0, …, lantern: 64 } # the icon names, when the project has its own icon sheet
```

- The game (BootScene) loads a project's copy instead of its own where the list names one – in the
  browser, a play-test and a `.brpg` alike (the asset resolver, projects.md §4).
- **Icons**: the project's icon sheet may grow (rows added at the end) and its names come from
  `system.icons` instead of `icons.json` – new icons get new names, the game's names keep their
  frames. Items, abilities and statuses pick from the project's icons.
- Sound effects stay the runtime's (projects.md decision 6).

## 3. Where images are edited: one home, and where they are used

- **Graphics & music** (the Resources screen, renamed) is the home of every image: all kinds, import, new
  sheets, the tiles' rules, images nothing uses yet.
- **Where an image is used** – a hero's board sprite, an item's icon, a map's battle background, a
  tile in the map palette – a small **✎** beside it opens the same pixel editor on that sheet (and
  frame); closing it returns there, and the change shows at once.
- The **pixel editor is one workspace** over the whole editor (§5), the same from either way in
  (user question; editor's suggestion).

## 3a. Graphics screen

The Graphics screen lists every kind of §1 – Board sprites, Battle sprites, Faces, Battle
backgrounds, Tiles, Wall signs, Icons, Game images, Music – the project's own first, then the
library's or the game's (read-only).

- **Import** as now (PNG; the layout is worked out from the size), now for every kind – a tile
  sheet comes with a chipset definition (§4), a game image must have the runtime image's size.
- **New** makes a blank sheet with the kind's layout (or a copy of a library sheet to start from).
- **Edit** opens the pixel editor (§5). Saving a library image makes the project's override of it
  (projects.md §2 – same id, its uses see the change); a game image becomes the project's copy
  (§2). **Revert to library** / **to the game's** brings the original back.
- The inspector shows the kind's preview (§1) and the image's settings (frame size, floor …).

## 4. Tiles (chipsets)

A chipset is a block sheet, a decor sheet and the rules of each piece. Under **Tiles** a chipset
shows all its terrains and decor as thumbnails; a selected one gets:

- **Terrain rules**: name, block frame, animation frames, fill frame (what shows below the top
  block), walkable, water (shallow / deep), a permanent surface effect (quicksand = sticky),
  freezable, flammable and what it burns to, sink; the ship settings (flare, underlay, bulwark).
- **Decor rules**: name, frame, blocks (can't be walked through), flammable, cuttable, rotations
  (`views`: one frame per quarter turn from the frame on).
- **Preview**: the block on a small board – on its own, stacked, next to other terrain – turned
  through the four view rotations with the game's renderer; decor stands on a cell.
- **New terrain / New decor** adds a piece (a new frame at the end of the sheet, blank or copied
  from another piece) – then Edit draws it.
- A library chipset is edited in place: the first change of a rule or a sheet makes the project's
  override (`data/chipsets/lib/<id>.yaml`, both sheets in `assets/chipsets/lib/`); maps keep using
  `lib:<id>` and see the change. Maps pick the chipset in their properties.

## 5. The pixel editor

Opens in the middle of the screen with the sheet; the inspector shows the kind's preview, live.

- **Frames**: the sheet's frame grid; a strip to pick the frame, the frame zoomed to draw in. Big
  images (backgrounds, the title) are one frame, drawn zoomed and panned.
- **Tools**: pencil, eraser, fill, line, rectangle (outline / filled), picker, selection (move,
  copy, paste – also between frames), mirror and shift of the frame or selection.
- **Colours**: the game's palette (Endesga-32 and its in-between shades), the colours already in the
  sheet, any other colour; transparent.
- **Helpers per kind**: guides (the tile's diamond and side faces, decor's anchor, a sprite's feet
  line, a battler's ground, the window's 9-slice borders, the font's baseline), onion skin (the
  previous frame faint underneath) for animations, mirrored drawing for symmetric pieces.
- **History**: its own undo / redo while open. **Save** writes the PNG into the project's assets
  (like an import); **Close** without saving asks first. Revert (the project's) undoes data, not
  images already written.
- **Big images** (backgrounds, the title) pan with the middle mouse button or Space + drag.
- **Sheet size**: frames can be added (a new pose, a new tile, a new icon row) and the sheet grows
  in the kind's layout.

## 6. Decisions

1. **All images editable** (user request): content images, and the game's own images as project
   copies (§2).
2. **One layer, small tools**: the frames are 10–48 px (backgrounds 480 px); layers and effects are
   left to outside tools – Import brings their PNGs in.
3. **Previews use the game's own code** where it can run in the editor (the iso renderer, the text
   box layout, the palette), so what the editor shows is what the game shows.
4. **One home, edit where used** (§3): the Graphics screen holds every image; ✎ buttons where
   images are used open the same pixel editor.
5. **Image edits save separately** from the data (Save in the pixel editor writes the PNG); the
   project's undo covers the data (definitions, registrations), the pixel editor's undo the pixels.
