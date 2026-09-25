import type {
  AbilityDef,
  ChipsetDef,
  ClassDef,
  ConfigDef,
  DialogDef,
  EnemyDef,
  FieldEffectDef,
  GraphicsDb,
  HeroDef,
  ItemDef,
  MapDef,
  NpcDef,
  PatternDef,
  QuestDef,
  ShopDef,
  StatusDef,
} from "./types";

/** Raw content as parsed from the data files: collections are `id → definition` (id optional in files). */
export interface RawContent {
  config: ConfigDef;
  classes: Record<string, Omit<ClassDef, "id">>;
  heroes: Record<string, Omit<HeroDef, "id">>;
  patterns: Record<string, Omit<PatternDef, "id">>;
  statuses: Record<string, Omit<StatusDef, "id">>;
  fieldEffects: Record<string, Omit<FieldEffectDef, "id">>;
  abilities: Record<string, Omit<AbilityDef, "id">>;
  items: Record<string, Omit<ItemDef, "id">>;
  enemies: Record<string, Omit<EnemyDef, "id">>;
  npcs: Record<string, Omit<NpcDef, "id">>;
  shops: Record<string, Omit<ShopDef, "id">>;
  dialogs: Record<string, DialogDef>;
  quests: Record<string, Omit<QuestDef, "id">>;
  chipsets: Record<string, Omit<ChipsetDef, "id">>;
  graphics: GraphicsDb;
  maps: Record<string, Omit<MapDef, "id">>;
}

type Collection<T> = Map<string, T>;

function withIds<T>(record: Record<string, Omit<T, "id">> | undefined): Collection<T> {
  const map = new Map<string, T>();
  for (const [id, def] of Object.entries(record ?? {})) map.set(id, { ...(def as object), id } as T);
  return map;
}

export class UnknownIdError extends Error {}

/** Read-only registry of all static content with typed lookups. */
export class Database {
  readonly config: ConfigDef;
  readonly classes: Collection<ClassDef>;
  readonly heroes: Collection<HeroDef>;
  readonly patterns: Collection<PatternDef>;
  readonly statuses: Collection<StatusDef>;
  readonly fieldEffects: Collection<FieldEffectDef>;
  readonly abilities: Collection<AbilityDef>;
  readonly items: Collection<ItemDef>;
  readonly enemies: Collection<EnemyDef>;
  readonly npcs: Collection<NpcDef>;
  readonly shops: Collection<ShopDef>;
  readonly dialogs: Map<string, DialogDef>;
  readonly quests: Collection<QuestDef>;
  readonly chipsets: Collection<ChipsetDef>;
  readonly maps: Collection<MapDef>;
  readonly graphics: GraphicsDb;

  constructor(raw: RawContent) {
    this.config = raw.config;
    this.classes = withIds(raw.classes);
    this.heroes = withIds(raw.heroes);
    this.patterns = withIds(raw.patterns);
    this.statuses = withIds(raw.statuses);
    this.fieldEffects = withIds(raw.fieldEffects);
    this.abilities = withIds(raw.abilities);
    this.items = withIds(raw.items);
    this.enemies = withIds(raw.enemies);
    this.npcs = withIds(raw.npcs);
    this.shops = withIds(raw.shops);
    this.dialogs = new Map(Object.entries(raw.dialogs ?? {}));
    this.quests = withIds(raw.quests);
    this.chipsets = withIds(raw.chipsets);
    this.maps = withIds(raw.maps);
    this.graphics = raw.graphics ?? { charsets: {}, battlers: {}, faces: {}, battlebacks: {} };
  }

  private must<T>(col: Map<string, T>, id: string, kind: string): T {
    const v = col.get(id);
    if (v === undefined) throw new UnknownIdError(`Unknown ${kind} "${id}"`);
    return v;
  }

  cls = (id: string) => this.must(this.classes, id, "class");
  hero = (id: string) => this.must(this.heroes, id, "hero");
  pattern = (id: string) => this.must(this.patterns, id, "pattern");
  status = (id: string) => this.must(this.statuses, id, "status");
  fieldEffect = (id: string) => this.must(this.fieldEffects, id, "field effect");
  ability = (id: string) => this.must(this.abilities, id, "ability");
  item = (id: string) => this.must(this.items, id, "item");
  enemy = (id: string) => this.must(this.enemies, id, "enemy");
  npc = (id: string) => this.must(this.npcs, id, "npc");
  shop = (id: string) => this.must(this.shops, id, "shop");
  dialog = (id: string) => this.must(this.dialogs, id, "dialog");
  quest = (id: string) => this.must(this.quests, id, "quest");
  chipset = (id: string) => this.must(this.chipsets, id, "chipset");
  map = (id: string) => this.must(this.maps, id, "map");
}
