import { useEffect, useState } from "preact/hooks";
import { useProject } from "./hooks";
import { playtest } from "./playtest";
import type { Project } from "./project";
import { MapsScreen } from "./screens/MapsScreen";

/** Navigation entries; the ones without a screen yet are shown greyed out (editor-design §12). */
const SCREENS = [
  { id: "maps", label: "Maps" },
  { id: "heroes", label: "Heroes", pkg: "E6" },
  { id: "enemies", label: "Enemies", pkg: "E6" },
  { id: "npcs", label: "NPCs", pkg: "E6" },
  { id: "items", label: "Items", pkg: "E5" },
  { id: "abilities", label: "Abilities", pkg: "E8" },
  { id: "quests", label: "Quests", pkg: "E7" },
  { id: "dialogs", label: "Dialogs", pkg: "E7" },
  { id: "shops", label: "Shops", pkg: "E8" },
  { id: "settings", label: "Settings", pkg: "E8" },
] as const;

type ScreenId = (typeof SCREENS)[number]["id"];

export function App({ project }: { project: Project }) {
  useProject(project);
  const [screen, setScreen] = useState<ScreenId>("maps");
  const [map, setMap] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = project.dirtyPaths();
  const { problems } = project.content;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await project.save();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // keyboard: Ctrl+S save, Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo, F5 quick play
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (mod && !typing && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) project.redo();
        else project.undo();
      } else if (mod && !typing && e.key.toLowerCase() === "y") {
        e.preventDefault();
        project.redo();
      } else if (e.key === "F5" && map) {
        e.preventDefault();
        playtest(project, "quick", map);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // don't lose unsaved work by closing the tab
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (project.dirtyPaths().length) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [project]);

  const mapName = map ? (project.content.db?.maps.get(map)?.name ?? map) : null;

  return (
    <div class="shell">
      <div class="toolbar">
        <span class="title">Board RPG Editor</span>
        <button class="primary" onClick={() => playtest(project, "play")} title="Run the game from the title screen with the current content">
          ▶ Play
        </button>
        <button
          class="primary"
          disabled={!map}
          onClick={() => map && playtest(project, "quick", map)}
          title={map ? "Start right on this map with its Quick Play settings (F5)" : "Select a map first"}
        >
          ▶ Quick Play{mapName ? `: ${mapName}` : ""}
        </button>
        <span class="sep" />
        <button disabled={!dirty.length || busy} onClick={save} title={dirty.join("\n") || "Nothing to save"}>
          Save{dirty.length ? ` (${dirty.length})` : ""}
        </button>
        <button disabled={!dirty.length || busy} onClick={() => confirm("Throw away all unsaved changes?") && project.revert()}>
          Revert
        </button>
        <span class="sep" />
        <button disabled={!project.canUndo} onClick={() => project.undo()} title={project.undoLabel ? `Undo ${project.undoLabel} (Ctrl+Z)` : "Undo"}>
          ↶
        </button>
        <button disabled={!project.canRedo} onClick={() => project.redo()} title="Redo (Ctrl+Y)">
          ↷
        </button>
        <span class="spacer" />
        {error && <span class="badge bad">{error}</span>}
        <button class={`badge ${problems.length ? "bad" : "good"}`} onClick={() => setShowProblems(!showProblems)}>
          {problems.length ? `${problems.length} problem${problems.length > 1 ? "s" : ""}` : "no problems"}
        </button>
      </div>
      {showProblems && problems.length > 0 && (
        <div class="popover">
          <ul class="problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      <nav class="nav">
        {SCREENS.map((s) => (
          <button
            key={s.id}
            class={`${screen === s.id ? "active" : ""} ${"pkg" in s ? "soon" : ""}`}
            onClick={() => setScreen(s.id)}
            title={"pkg" in s ? `Coming with ${s.pkg}` : undefined}
          >
            {s.label}
          </button>
        ))}
      </nav>
      {screen === "maps" ? (
        <MapsScreen project={project} selected={map} onSelect={setMap} />
      ) : (
        <>
          <main class="main">
            <div class="placeholder">
              <h2>{SCREENS.find((s) => s.id === screen)!.label}</h2>
              This screen comes with work package {(SCREENS.find((s) => s.id === screen) as { pkg?: string }).pkg} (see docs/editor-design.md).
            </div>
          </main>
          <aside class="inspector" />
        </>
      )}
    </div>
  );
}
