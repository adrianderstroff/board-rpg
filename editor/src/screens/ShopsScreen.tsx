import { ContentList, EntryActions } from "../forms/ContentList";
import { optionsOf } from "../forms/EffectList";
import { addEntry, deleteEntry, writeEntry } from "../forms/entries";
import { Field, ListEditor, Select, Text } from "../forms/fields";
import { ItemIcon } from "../forms/IconPicker";
import { Box } from "../forms/Section";
import { categoryLabel, type Item } from "../items/model";
import { usePersistentState } from "../persist";
import type { Project } from "../project";
import { EntryReferences, usedIn } from "../forms/References";
import type { UsageTarget } from "../references";
import type { EntityRef } from "../entities/model";
import { newShop, SHOP_TYPES, shopUsers, SHOPS_FILE, SHOPS_HEADER, type Shop } from "../shops/model";

/**
 * Shops (editor-design §10): name, sign and goods; the inspector shows the goods as the shop
 * window lists them and the entities that open the shop, with links to their maps.
 */


export function ShopsScreen({ project, openMap, goTo }: { project: Project; openMap: (map: string, entity: EntityRef) => void; goTo: (t: UsageTarget) => void }) {
  const [selected, select] = usePersistentState<string | null>("shops.selected", null);
  const raw = project.content.raw;
  const shops = raw.shops as Record<string, Shop>;
  const current = selected && shops[selected] ? selected : null;
  const dirty = project.dirtyPaths().includes(SHOPS_FILE);
  const add = (shop: Shop, label: string) => select(addEntry(project, SHOPS_FILE, SHOPS_HEADER, shop, (x) => x in project.content.raw.shops, label, "shop"));
  return (
    <>
      <main class="main">
        <div class="split">
          <ContentList
            entries={Object.entries(shops).map(([id, s]) => ({ id, name: s.name, pic: <ItemIcon icon={SHOP_TYPES.find(([t]) => t === s.type)?.[2]} scale={1} />, group: SHOP_TYPES.find(([t]) => t === s.type)?.[1], dirty }))}
            groups={SHOP_TYPES.map(([, label]) => label)}
            selected={current}
            onSelect={select}
            searchKey="shops.filter"
            placeholder="Search shops…"
            newTitle="A new shop of the project"
            newOptions={[{ label: "New shop", make: () => add(newShop(), "New shop") }]}
          />
          <div class="form-scroll">{current ? <ShopForm project={project} id={current} /> : <p class="placeholder">Select a shop, or make one with New.</p>}</div>
        </div>
      </main>
      <aside class="inspector">
        {current ? (
          <div class="item-card">
            <ShopWindow project={project} id={current} />
            <h4 class="card-heading">Opened by</h4>
            {shopUsers(raw, current).length ? (
              <ul class="placements">
                {shopUsers(raw, current).map((u) => (
                  <li key={`${u.map}/${u.entity}`}>
                    <button class="link" title="Open the map with this entity selected" onClick={() => openMap(u.map, { kind: "event", key: u.index })}>
                      {raw.maps[u.map]?.name ?? u.map}
                    </button>{" "}
                    <span class="dim">entity {u.entity}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p class="hint">No entity opens it yet – give a shopkeeper a "Shop" option on the Maps screen.</p>
            )}
            <EntryReferences project={project} collection="shops" id={current} goTo={goTo} onRenamed={select} list={false} />
            <EntryActions
              id={current}
              used={usedIn(project, "shops", current)}
              onCopy={() => {}}
              onDuplicate={() => add({ ...structuredClone(shops[current]), name: `${shops[current].name} copy` }, `Duplicate ${current}`)}
              onDelete={() => {
                if (!confirm(`Delete ${shops[current].name} (${current})?`)) return;
                deleteEntry(project, SHOPS_FILE, current);
                select(null);
              }}
            />
          </div>
        ) : (
          <p class="hint">What the shopkeepers sell (editor-design §10).</p>
        )}
      </aside>
    </>
  );
}

/** The goods as the shop window lists them. */
function ShopWindow({ project, id }: { project: Project; id: string }) {
  const raw = project.content.raw;
  const shop = raw.shops[id] as Shop;
  const type = SHOP_TYPES.find(([t]) => t === shop.type);
  return (
    <div class="shop-window">
      <div class="shop-title">
        <ItemIcon icon={type?.[2]} scale={2} />
        <b>{shop.name}</b>
      </div>
      {shop.items.map((i) => {
        const item = raw.items[i] as Item | undefined;
        return (
          <div key={i} class={`shop-row ${item ? "" : "bad-text"}`}>
            <ItemIcon icon={item?.icon} scale={1} />
            <span>{item?.name ?? `${i} (missing!)`}</span>
            <span class="dim">{item ? `${item.price} G` : ""}</span>
          </div>
        );
      })}
      {!shop.items.length && <p class="hint">Nothing for sale yet.</p>}
    </div>
  );
}

function ShopForm({ project, id }: { project: Project; id: string }) {
  const raw = project.content.raw;
  const shop = raw.shops[id] as Shop;
  const write = (next: Shop, label: string, group?: string) => writeEntry(project, SHOPS_FILE, id, shop, next, `${shop.name}: ${label}`, group);
  const items = optionsOf(raw.items);
  return (
    <div class="item-form">
      <Box title="Shop" aside={<span class="dim">{id}</span>}>
        <Field label="Name">
          <Text value={shop.name} onChange={(v) => write({ ...shop, name: v ?? "" }, "name", "name")} />
        </Field>
        <Field label="Sign">
          <div class="row">
            <ItemIcon icon={SHOP_TYPES.find(([t]) => t === shop.type)?.[2]} scale={2} />
            <Select value={shop.type} options={SHOP_TYPES.map(([t, l]) => [t, l])} title="The keeper's sign" onChange={(v) => write({ ...shop, type: (v ?? "item") as Shop["type"] }, "sign")} />
          </div>
        </Field>
      </Box>
      <Box title="Goods">
        <ListEditor
          items={shop.items}
          onChange={(v) => write({ ...shop, items: v }, "goods", "items")}
          add={() => items.find(([i]) => !shop.items.includes(i))?.[0] ?? items[0]?.[0] ?? ""}
          addLabel="+ Item"
          render={(i, set) => {
            const item = raw.items[i] as Item | undefined;
            return (
              <div class="row">
                <ItemIcon icon={item?.icon} scale={1} />
                <Select value={i} options={items} onChange={(v) => v && set(v)} />
                <span class="dim shop-price">{item ? `${item.price} G · ${categoryLabel(item.category)}` : ""}</span>
              </div>
            );
          }}
        />
        {shop.items.some((i) => (raw.items[i] as Item | undefined)?.category === "key") && <p class="hint">Quest items can be bought but not sold back.</p>}
      </Box>
    </div>
  );
}

