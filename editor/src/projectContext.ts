import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { Project } from "./project";

/** The project being edited, for deep forms that change more than their own value (teleport targets). */
export const ProjectContext = createContext<Project | null>(null);

export function useProjectContext(): Project {
  const p = useContext(ProjectContext);
  if (!p) throw new Error("No project");
  return p;
}
