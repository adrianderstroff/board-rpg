import { setAssetResolver } from "../../../src/engine/assets";
import { readStored, writeStored } from "../persist";
import { assetVersion } from "../assetVersions";
import { ProjectStore } from "./ops";
import { BundledLibraryTree, bundledAssetUrl, bundledAssetUrls, bundledDemo, canOpenFolders, FolderTree, HttpTree, IdbTree, recall, remember } from "./trees";
import { LayeredTree, MemoryTree, type FileTree } from "./tree";

/**
 * The editor's storage (distribution.md §1): the dev server's repository while developing,
 * otherwise a folder the user picked (where the browser can) or the browser's own storage – the
 * library always bundled with the editor.
 */
export type StorageKind = "dev" | "folder" | "browser";

export interface EditorStorage {
  kind: StorageKind;
  /** For the project menu: "Dev server", "Folder: my-games", "Browser". */
  label: string;
  store: ProjectStore;
  /** A folder is chosen but its permission must be granted again (a click): `reopenFolder`. */
  folderWaiting?: string;
}

let current: EditorStorage | null = null;

export function storage(): EditorStorage {
  if (!current) throw new Error("The editor's storage isn't set up yet");
  return current;
}

type Dir = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: string }): Promise<string>;
  requestPermission(o: { mode: string }): Promise<string>;
};

/** A new browser storage starts with a copy of the demo. */
async function seedDemo(tree: FileTree) {
  if ((await tree.list("projects/")).length) return;
  for (const [path, text] of Object.entries(bundledDemo())) await tree.write(path, new TextEncoder().encode(text));
}

/** Picks the storage: the dev server if there is one, else the folder used last (if still allowed), else the browser. */
export async function startStorage(): Promise<EditorStorage> {
  // (a production build has no dev server to ask)
  if (import.meta.env.DEV && (await HttpTree.available())) {
    current = { kind: "dev", label: "Dev server (the repository)", store: new ProjectStore(new HttpTree()) };
  } else {
    let folderWaiting: string | undefined;
    if (readStored<string>("storage", "browser") === "folder" && canOpenFolders()) {
      const handle = await recall<Dir>("folder").catch(() => undefined);
      if (handle && (await handle.queryPermission({ mode: "readwrite" })) === "granted") {
        current = { kind: "folder", label: `Folder: ${handle.name}`, store: new ProjectStore(new LayeredTree(new BundledLibraryTree(), new FolderTree(handle))) };
      } else if (handle) folderWaiting = handle.name;
    }
    if (!current) {
      const idb = new IdbTree();
      await seedDemo(idb);
      current = { kind: "browser", label: "Browser", store: new ProjectStore(new LayeredTree(new BundledLibraryTree(), idb)), folderWaiting };
    }
  }
  setAssetResolver(contentUrl);
  return current;
}

/** Opens a folder as the storage (asks the browser; the page reloads with it). */
export async function openFolder() {
  const picker = (window as unknown as { showDirectoryPicker(o: { mode: string }): Promise<Dir> }).showDirectoryPicker;
  const handle = await picker({ mode: "readwrite" });
  await remember("folder", handle);
  writeStored("storage", "folder");
  location.reload();
}

/** The folder used last, allowed again (needs a click). */
export async function reopenFolder() {
  const handle = await recall<Dir>("folder");
  if (handle && (await handle.requestPermission({ mode: "readwrite" })) === "granted") {
    writeStored("storage", "folder");
    location.reload();
  }
}

/** Back to the browser's storage. */
export function useBrowser() {
  writeStored("storage", "browser");
  location.reload();
}

export { canOpenFolders };

// ---------- asset URLs ----------

/** The project's own asset files as blob: URLs (browser and folder storage). */
const blobs = new Map<string, string>();

/** Where a content path (library/…, projects/…) is served – undefined: as it is (the dev server has it). */
export function contentUrl(path: string): string | undefined {
  if (!current) return undefined;
  // the dev server serves the files themselves: a changed one gets its version (no stale cache)
  if (current.kind === "dev") {
    const v = assetVersion(path);
    return v ? `${path}?v=${v}` : undefined;
  }
  return blobs.get(path) ?? bundledAssetUrl(path);
}

/** The project's asset files, made into blob: URLs (after loading a project, or changing an asset). */
export async function refreshAssets(projectId: string) {
  if (!current || current.kind === "dev") return;
  const prefix = `projects/${projectId}/assets/`;
  for (const url of blobs.values()) URL.revokeObjectURL(url);
  blobs.clear();
  const tree = current.store.tree;
  for (const path of await tree.list(prefix)) {
    const data = await tree.read(path);
    if (!data) continue;
    const type = path.endsWith(".png") ? "image/png" : path.endsWith(".wav") ? "audio/wav" : "application/octet-stream";
    blobs.set(path, URL.createObjectURL(new Blob([data as BlobPart], { type })));
  }
}

/**
 * The asset URLs a play-test tab needs: the project's own (blob: URLs from here stay valid while the
 * editor is open) and – outside the dev server – every library asset as this build serves it (the
 * game next to the editor on the site only has the ones the demo uses).
 */
export function playAssetUrls(): Record<string, string> {
  if (!current || current.kind === "dev") return {};
  return { ...bundledAssetUrls(location.href), ...Object.fromEntries(blobs) };
}

/** For tests: a storage on any tree. */
export function useStorageForTests(tree: FileTree = new MemoryTree(), kind: StorageKind = "browser") {
  current = { kind, label: kind, store: new ProjectStore(tree) };
  return current;
}
