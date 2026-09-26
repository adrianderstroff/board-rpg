import { createContext } from "preact";

/** The map being edited – for pickers that list its entities (conditions and actions on states). */
export const MapContext = createContext<string | null>(null);
