/** Small line icons for the editor's main sections (24×24 viewBox, drawn with currentColor). */

const paths: Record<string, string> = {
  maps: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15",
  heroes: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z M9 12l2 2 4-4",
  enemies: "M12 3c-5 0-8 3-8 7 0 3 2 5 3 5v3h10v-3c1 0 3-2 3-5 0-4-3-7-8-7z M9 11h.01 M15 11h.01 M10 18v3 M14 18v3",
  npcs: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3 3-5 6-5s6 2 6 5 M17 11a2.5 2.5 0 1 0 0-5 M18 15c2 .5 3 2 3 5",
  items: "M10 3h4 M10 3v5l-5 9a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-9V3 M7 14h10",
  abilities: "M12 3l2 6 6 .5-4.5 4 1.5 6-5-3.5-5 3.5 1.5-6L4 9.5 10 9z",
  quests: "M6 3h10l3 3v15H6z M16 3v3h3 M9 10h7 M9 14h7 M9 18h4",
  dialogs: "M4 5h16v11H9l-5 4z M8 9h8 M8 12h5",
  shops: "M4 9l2-5h12l2 5 M4 9h16v11H4z M4 9c0 2 2 3 4 3s4-1 4-3c0 2 2 3 4 3s4-1 4-3 M10 20v-5h4v5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L6 7.5 4 7 3 10l2 1v2l-2 1 1 3 2-.5L7.5 18 7 20l3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z",
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={paths[name] ?? ""} />
    </svg>
  );
}
