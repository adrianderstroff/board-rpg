import { useEffect, useState } from "preact/hooks";
import { useProject } from "./hooks";
import { playtest } from "./playtest";
import type { Project } from "./project";
import { MapsScreen } from "./screens/MapsScreen";
import { ResourcesScreen } from "./screens/ResourcesScreen";
import { ItemsScreen } from "./screens/ItemsScreen";
import { HeroesScreen } from "./screens/HeroesScreen";
import { EnemiesScreen } from "./screens/EnemiesScreen";
import { NpcsScreen } from "./screens/NpcsScreen";
import { AbilitiesScreen } from "./screens/AbilitiesScreen";
import { ShopsScreen } from "./screens/ShopsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { QuestsScreen } from "./screens/QuestsScreen";
import { DialogsScreen } from "./screens/DialogsScreen";
import type { UsageTarget } from "./references";
import { knownFlags } from "./forms/ConditionEditor";
import type { EntityRef } from "./entities/model";
import { Icon } from "./icons";
import { usePersistentState, writeStored } from "./persist";
import { IssuesButton, ProjectMenu } from "./ProjectMenu";

/** Navigation entries; the ones without a screen yet are shown greyed out (editor-design §12). */
const SCREENS = [
  { id: "maps", label: "Maps" },
  { id: "resources", label: "Resources" },
  { id: "heroes", label: "Heroes" },
  { id: "enemies", label: "Enemies" },
  { id: "npcs", label: "NPCs" },
  { id: "items", label: "Items" },
  { id: "abilities", label: "Abilities" },
  { id: "quests", label: "Quests" },
  { id: "dialogs", label: "Dialogs" },
  { id: "shops", label: "Shops" },
  { id: "settings", label: "Settings" },
] as const;

type ScreenId = (typeof SCREENS)[number]["id"];

export function App({ project }: { project: Project }) {
  useProject(project);
  // where the user was is remembered across reloads (a hot reload while working on the editor)
  const [screen, setScreen] = usePersistentState<ScreenId>("screen", "maps");
  const maps = project.paths("data/maps/").map((p) => p.replace(/^data\/maps\//, "").replace(/\.yaml$/, ""));
  const [storedMap, setMap] = usePersistentState<string | null>("map", null);
  // the first map is open right away (if there is one, and the remembered one is gone)
  const map = storedMap && maps.includes(storedMap) ? storedMap : (maps[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    project.dropped.length ? `Unsaved changes to ${project.dropped.join(", ")} were dropped: the file changed on disk` : null,
  );
  const dirty = project.dirtyPaths();

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

  // unsaved work is kept in the browser (Project's session): store the latest before the page goes
  useEffect(() => {
    const onHide = () => project.persistNow();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [project]);


  /** Shows a map in Entity mode with one entity selected (MapsScreen reads these when it opens). */
  const openMap = (m: string, entity: EntityRef) => {
    writeStored("maps.mode", "entity");
    writeStored("maps.tab", "edit");
    writeStored("maps.selected", entity);
    setMap(m);
    setScreen("maps");
  };

  /** Goes to where something is used: a map entity, or an entry of a content screen. */
  const goTo = (t: UsageTarget) => {
    if (t.screen === "maps") {
      if (t.entity) openMap(t.map, t.entity);
      else {
        setMap(t.map);
        setScreen("maps");
      }
      return;
    }
    if (t.id) writeStored(`${t.screen}.selected`, t.id);
    setScreen(t.screen);
  };

  const flags = knownFlags(project.content.raw);
  return (
    <div class="shell">
      {/* suggestions for every flag field */}
      <datalist id="known-flags">
        {flags.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <div class="toolbar">
        <ProjectMenu project={project} />
        <span class="sep" />
        {/* the main sections, as icons (their names on hover) */}
        <nav class="nav" aria-label="Sections">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              class={`icon-button ${screen === s.id ? "on" : ""} ${"pkg" in s ? "soon" : ""}`}
              onClick={() => setScreen(s.id)}
              title={"pkg" in s ? `${s.label} (coming with ${s.pkg})` : s.label}
              aria-label={s.label}
            >
              <Icon name={s.id} />
            </button>
          ))}
        </nav>
        <span class="sep" />
        <button class="primary" onClick={() => playtest(project, "play")} title="Run the game from the title screen with the current content">
          ▶ Play
        </button>
        <button
          class="primary"
          disabled={!map}
          onClick={() => map && playtest(project, "quick", map)}
          title={map ? "Start right on this map with its Quick Play settings (F5)" : "Select a map first"}
        >
          ▶ Quick Play
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
        <IssuesButton project={project} />
      </div>
      {screen === "maps" ? (
        <MapsScreen project={project} selected={map} onSelect={setMap} />
      ) : screen === "resources" ? (
        <ResourcesScreen project={project} />
      ) : screen === "heroes" ? (
        <HeroesScreen project={project} />
      ) : screen === "enemies" ? (
        <EnemiesScreen project={project} />
      ) : screen === "npcs" ? (
        <NpcsScreen
          project={project}
          openMap={openMap}
        />
      ) : screen === "abilities" ? (
        <AbilitiesScreen project={project} />
      ) : screen === "shops" ? (
        <ShopsScreen project={project} openMap={openMap} />
      ) : screen === "settings" ? (
        <SettingsScreen project={project} openMap={openMap} />
      ) : screen === "quests" ? (
        <QuestsScreen project={project} goTo={goTo} />
      ) : screen === "dialogs" ? (
        <DialogsScreen project={project} goTo={goTo} />
      ) : screen === "items" ? (
        <ItemsScreen project={project} />
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
