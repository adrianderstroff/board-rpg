/**
 * Images changed in the editor (a pixel edit, a new frame): their version, so URLs and caches see
 * the new picture; `assetsVersion()` counts all changes (canvases reload their sheets when it moves).
 */
const versions = new Map<string, number>();
let total = 0;

/** An asset file changed (path as content refers to it: projects/<id>/assets/…). */
export function assetChanged(path: string) {
  versions.set(path, (versions.get(path) ?? 0) + 1);
  total++;
}

export const assetVersion = (path: string) => versions.get(path);
export const assetsVersion = () => total;
