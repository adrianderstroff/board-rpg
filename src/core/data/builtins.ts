/**
 * Library content the rules themselves rely on (projects.md §2): the Defend command's status, the
 * party abilities the board menu and the AI use, … Every project uses a library, so these are
 * `lib:` ids – the one place the code names library content.
 */
export const BUILTIN = {
  /** Battle: the Defend command. */
  defending: "lib:defending",
  /** Hidden heroes show themselves when they attack. */
  hidden: "lib:hidden",
  /** The board's party commands (menu and AI). */
  joinParty: "lib:join_party",
  leaveParty: "lib:leave_party",
  /** Exploring: anyone who knows it can steal for the party. */
  steal: "lib:steal",
  /** How villagers wander when their NPC names no pattern. */
  npcMove: "lib:walk1",
  /** Field effects with their own sound. */
  burning: "lib:burning",
  frozen: "lib:frozen",
} as const;
