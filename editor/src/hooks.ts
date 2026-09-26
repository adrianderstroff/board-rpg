import { useEffect, useState } from "preact/hooks";
import type { Project } from "./project";

/** Re-renders the component whenever the project changes; returns the project's version. */
export function useProject(project: Project): number {
  const [version, setVersion] = useState(project.version);
  useEffect(() => project.subscribe(() => setVersion(project.version)), [project]);
  return version;
}
