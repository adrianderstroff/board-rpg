// 16x16 icons, 16 columns. Each icon is drawn with simple primitives and
// then outlined (1px dark). Light from the top-left.
import { Canvas, grid, mix } from './raster.mjs';
import { P, X } from './palette.mjs';

export const ICON_NAMES = [
  'sword', 'staff', 'dagger', 'claw', 'armor', 'robe', 'vest', 'ring', 'anklet', 'amulet', 'band',
  'potion', 'hipotion', 'ether', 'antidote', 'eyedrops', 'remedy', 'feather', 'bomb', 'shard', 'powder', 'glue',
  'scroll', 'key', 'charm', 'coin',
  'status_poison', 'status_sleep', 'status_stun', 'status_blind', 'status_slow', 'status_haste', 'status_protect',
  'status_regen', 'status_hidden', 'status_stuck',
  'type_magic', 'type_swordart', 'type_skill', 'type_ki', 'type_party',
  'sign_weapon', 'sign_item', 'sign_magic', 'sign_inn',
  'heart', 'star', 'fire', 'ice', 'thunder', 'earth', 'holy', 'shell',
  // appended later – keep existing indices stable
  'status_flying', 'status_defend', 'status_empower', 'status_bolster',
];

// ---------------------------------------------------------------- helpers
const O = P.ink;
function px(c, pts, col) { for (const [x, y] of pts) c.set(x, y, col); }
/** Draw from an ASCII template with a key map. */
function tpl(c, rows, map, ox = 0, oy = 0) {
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (map[ch] != null) c.set(ox + x, oy + y, map[ch]); }));
}
/** shaded disc: light top-left */
function ball(c, cx, cy, r, ramp) {
  c.ellipse(cx, cy, r, r, (x, y, nx, ny) => {
    const l = -nx * 0.6 - ny * 0.8;
    return l > 0.55 ? ramp[3] : l > 0.05 ? ramp[2] : l > -0.5 ? ramp[1] : ramp[0];
  });
}
function blade(c, x0, y0, x1, y1) {
  c.line(x0, y0, x1, y1, P.grey1);
  c.line(x0 + 1, y0, x1 + 1, y1, P.grey2);
  c.line(x0, y0 - 1, x1, y1 - 1, P.white);
}
function bottle(c, liquid, { big = false, cork = P.clay } = {}) {
  const cx = 8, cy = big ? 10 : 10.5, r = big ? 5 : 4.2;
  ball(c, cx, cy, r, [P.grey3, P.grey2, P.grey1, P.white]);
  // liquid
  c.ellipse(cx, cy + 0.5, r - 1, r - 1.2, (x, y, nx, ny) => (ny < -0.35 ? null : nx < -0.2 && ny < 0.3 ? liquid[2] : ny > 0.45 ? liquid[0] : liquid[1]));
  c.fillRect(6, big ? 2 : 3, 4, big ? 4 : 3, P.grey2);
  c.fillRect(6, big ? 2 : 3, 1, big ? 4 : 3, P.grey1);
  c.fillRect(6, big ? 1 : 2, 4, 2, cork);
  c.set(6, big ? 8 : 9, P.white); c.set(6, big ? 9 : 10, P.white);
}
function signBoard(c) {
  c.fillRect(7, 11, 2, 5, P.brown);
  c.fillRect(1, 2, 14, 10, P.clay);
  c.fillRect(1, 2, 14, 1, P.tan);
  c.fillRect(1, 11, 14, 1, P.brown);
  c.fillRect(1, 2, 1, 10, P.tan);
  c.fillRect(14, 2, 1, 10, P.brown);
}
function star5(c, cx, cy, R, r, col, inner = null) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  c.polygon(pts, col);
  if (inner) c.polygon(pts.map(([x, y]) => [cx + (x - cx) * 0.5 - 0.5, cy + (y - cy) * 0.5 - 0.5]), inner);
}
function heart(c, cx, cy, s, ramp) {
  c.ellipse(cx - 2.2 * s, cy - 1.5 * s, 2.6 * s, 2.5 * s, ramp[1]);
  c.ellipse(cx + 2.2 * s, cy - 1.5 * s, 2.6 * s, 2.5 * s, ramp[1]);
  c.polygon([[cx - 4.8 * s, cy - 1 * s], [cx + 4.8 * s, cy - 1 * s], [cx, cy + 5 * s]], ramp[1]);
  c.ellipse(cx - 2.6 * s, cy - 2.2 * s, 1.1 * s, 1 * s, ramp[2]);
  c.polygon([[cx + 4.4 * s, cy - 0.6 * s], [cx + 1.5 * s, cy + 3.5 * s], [cx, cy + 5 * s], [cx + 3.5 * s, cy - 0.5 * s]], ramp[0]);
}
function flame(c, cx, by, h, w, cols) {
  c.polygon([[cx - w, by], [cx - w * 0.8, by - h * 0.45], [cx - w * 0.2, by - h * 0.7], [cx, by - h], [cx + w * 0.4, by - h * 0.55], [cx + w, by - h * 0.35], [cx + w, by]], cols[0]);
  c.ellipse(cx, by - w * 0.8, w, w * 0.9, cols[0]);
  c.polygon([[cx - w * 0.55, by], [cx - w * 0.4, by - h * 0.4], [cx, by - h * 0.62], [cx + w * 0.55, by - h * 0.3], [cx + w * 0.55, by]], cols[1]);
  c.ellipse(cx, by - w * 0.6, w * 0.55, w * 0.55, cols[1]);
  c.ellipse(cx, by - w * 0.45, w * 0.3, w * 0.35, cols[2]);
}
function hourglass(c, sandTop, sandBot) {
  c.fillRect(3, 1, 10, 2, P.brown); c.fillRect(3, 13, 10, 2, P.brown);
  c.polygon([[4, 3], [12, 3], [8.5, 8], [7.5, 8]], P.grey1);
  c.polygon([[7.5, 8], [8.5, 8], [12, 13], [4, 13]], P.grey1);
  if (sandTop) c.polygon([[5.5, 5], [10.5, 5], [8.3, 8], [7.7, 8]], sandTop);
  if (sandBot) c.polygon([[8, 10], [11, 13], [5, 13]], sandBot);
  c.line(8, 8, 8, 12, sandBot ?? P.gold);
}

// ---------------------------------------------------------------- icons
const I = {};
I.sword = (c) => {
  blade(c, 5, 10, 13, 2);
  c.line(3, 8, 7, 12, P.gold); c.line(3, 9, 6, 12, P.tan);
  c.line(2, 13, 4, 11, P.brown); c.set(1, 14, P.gold);
};
I.staff = (c) => {
  c.line(2, 14, 10, 6, P.clay); c.line(3, 14, 11, 6, P.brown);
  ball(c, 11.5, 4.5, 3, [P.darkRed, P.red, P.pink, P.white]);
  c.set(9, 8, P.gold); c.set(10, 7, P.gold);
};
I.dagger = (c) => {
  blade(c, 7, 9, 12, 4);
  c.line(4, 8, 8, 12, P.gold);
  c.line(4, 12, 6, 10, P.brown); c.line(3, 13, 4, 12, P.darkBrown);
};
I.claw = (c) => {
  c.fillRect(3, 9, 8, 5, P.brown); c.fillRect(3, 9, 8, 1, P.clay);
  for (let i = 0; i < 3; i++) { const x = 5 + i * 3; c.line(x, 9, x + 3, 2, P.grey1); c.line(x + 1, 9, x + 4, 3, P.grey2); c.set(x + 3, 2, P.white); }
};
I.armor = (c) => {
  c.polygon([[3, 3], [6, 2], [8, 4], [10, 2], [13, 3], [13, 9], [11, 14], [5, 14], [3, 9]], P.grey2);
  c.polygon([[3, 3], [6, 2], [8, 4], [8, 14], [5, 14], [3, 9]], P.grey1);
  c.line(8, 4, 8, 13, P.grey3); c.line(4, 8, 12, 8, P.grey3);
  c.fillRect(1, 3, 3, 4, P.grey1); c.fillRect(12, 3, 3, 4, P.grey2);
  c.set(5, 4, P.white); c.set(4, 5, P.white);
};
I.robe = (c) => {
  c.polygon([[5, 1], [11, 1], [13, 5], [12, 6], [14, 15], [2, 15], [4, 6], [3, 5]], X.purpleLight);
  c.polygon([[5, 1], [8, 1], [8, 15], [2, 15], [4, 6], [3, 5]], P.magenta);
  c.polygon([[6, 1], [10, 1], [8, 5]], P.ink);
  c.line(8, 5, 8, 14, P.gold); c.line(3, 13, 13, 13, P.gold);
};
I.vest = (c) => {
  c.polygon([[4, 1], [7, 1], [7, 14], [3, 14], [2, 6]], P.clay);
  c.polygon([[9, 1], [12, 1], [14, 6], [13, 14], [9, 14]], P.brown);
  c.fillRect(7, 3, 2, 11, P.sandLight);
  c.set(6, 6, P.gold); c.set(6, 9, P.gold); c.line(4, 2, 4, 12, P.tan);
};
I.ring = (c) => {
  c.ellipse(8, 10, 5, 4.5, P.gold); c.ellipse(8, 10.2, 3, 2.6, 0);
  c.ellipse(8, 10.2, 3, 2.6, null);
  // clear inner
  for (let y = 7; y < 14; y++) for (let x = 5; x < 12; x++) { const nx = (x + 0.5 - 8) / 3, ny = (y + 0.5 - 10.2) / 2.6; if (nx * nx + ny * ny < 1) c.set(x, y, 0); }
  c.line(4, 9, 6, 7, P.yellow);
  ball(c, 8, 4.5, 2.4, [P.blueDark, P.blue, P.cyan, P.white]);
};
I.anklet = (c) => {
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const x = 8 + Math.cos(a) * 5.5, y = 8 + Math.sin(a) * 3.2; c.set(Math.round(x), Math.round(y), i % 2 ? P.gold : P.yellow); c.set(Math.round(x) + 1, Math.round(y), P.tan); }
  ball(c, 8, 12, 1.8, [P.greenDeep, P.greenDark, P.green, P.white]);
};
I.amulet = (c) => {
  c.line(3, 1, 8, 7, P.gold); c.line(13, 1, 8, 7, P.tan);
  c.polygon([[8, 6], [12, 10], [8, 15], [4, 10]], P.gold);
  c.polygon([[8, 8], [10, 10], [8, 13], [6, 10]], P.red); c.set(7, 9, P.pink);
};
I.band = (c) => {
  c.ellipse(8, 8, 6, 4, P.navy); c.ellipse(8, 7, 6, 4, P.blueDark);
  for (let y = 5; y < 11; y++) for (let x = 3; x < 14; x++) { const nx = (x + 0.5 - 8) / 4.2, ny = (y + 0.5 - 7.5) / 2.2; if (nx * nx + ny * ny < 1) c.set(x, y, 0); }
  c.fillRect(7, 9, 3, 3, P.gold); c.set(7, 9, P.yellow);
  c.line(3, 6, 5, 4, P.blue);
};
I.potion = (c) => bottle(c, [P.darkRed, P.red, P.pink]);
I.hipotion = (c) => bottle(c, [P.rust, P.orange, P.gold], { big: true });
I.ether = (c) => bottle(c, [P.blueDark, P.blue, P.cyan]);
I.antidote = (c) => bottle(c, [P.greenDeep, P.greenDark, P.green]);
I.eyedrops = (c) => {
  c.polygon([[6, 7], [10, 7], [11, 14], [5, 14]], P.grey1);
  c.fillRect(6, 9, 4, 5, P.cyan); c.fillRect(6, 9, 1, 5, P.white);
  c.fillRect(7, 3, 2, 4, P.grey2); c.ellipse(8, 2.5, 2, 1.8, P.red);
  c.ellipse(12.5, 11, 1.2, 1.6, P.blue); c.set(12, 10, P.cyan);
};
I.remedy = (c) => {
  c.fillRect(2, 5, 12, 9, P.white); c.fillRect(2, 5, 12, 2, P.grey1); c.fillRect(13, 5, 1, 9, P.grey2);
  c.fillRect(7, 7, 2, 6, P.red); c.fillRect(5, 9, 6, 2, P.red);
  c.fillRect(5, 3, 6, 2, P.grey2);
};
I.feather = (c) => {
  c.polygon([[13, 1], [15, 3], [9, 10], [4, 13], [6, 8]], P.orange);
  c.polygon([[13, 1], [11, 6], [6, 11], [6, 8]], P.gold);
  c.polygon([[15, 3], [12, 7], [7, 11], [9, 10]], P.red);
  c.line(13, 2, 2, 14, P.yellow);
  c.set(2, 14, P.brown); c.set(3, 13, P.brown);
};
I.bomb = (c) => {
  ball(c, 7, 10, 5, [P.ink, P.navy, P.slate, P.grey3]);
  c.fillRect(8, 3, 3, 3, P.grey3);
  c.line(10, 3, 12, 1, P.clay);
  px(c, [[13, 0], [12, 1], [14, 1], [13, 2]], P.yellow); c.set(13, 1, P.white);
  c.set(5, 8, P.grey2);
};
I.shard = (c) => {
  c.polygon([[8, 1], [12, 6], [9, 15], [5, 10], [5, 5]], P.cyan);
  c.polygon([[8, 1], [8, 15], [5, 10], [5, 5]], mix(P.cyan, P.white, 0.6));
  c.polygon([[8, 1], [12, 6], [9, 15], [8, 15]], P.blue);
  c.line(8, 3, 7, 8, P.white);
  c.set(13, 2, P.white); c.set(3, 12, P.white);
};
I.powder = (c) => {
  c.polygon([[4, 6], [12, 6], [14, 14], [2, 14]], P.sand);
  c.polygon([[4, 6], [8, 6], [7, 14], [2, 14]], P.sandLight);
  c.fillRect(5, 4, 6, 2, P.clay); c.fillRect(6, 2, 4, 2, P.sand);
  c.line(5, 5, 11, 5, P.purple);
  px(c, [[12, 2], [2, 3], [14, 7], [13, 4]], P.magenta); c.set(3, 1, P.pink);
};
I.glue = (c) => {
  c.polygon([[3, 6], [13, 6], [12, 14], [4, 14]], P.clay);
  c.polygon([[3, 6], [8, 6], [7, 14], [4, 14]], P.tan);
  c.ellipse(8, 6, 5.5, 2, P.greenDark); c.ellipse(7, 5.5, 3, 1, P.green);
  c.fillRect(10, 7, 2, 4, P.greenDark); c.set(10, 11, P.greenDark);
  c.line(9, 1, 12, 5, P.brown);
};
I.scroll = (c) => {
  c.fillRect(3, 3, 10, 10, P.sandLight); c.fillRect(3, 11, 10, 2, P.sand);
  c.ellipse(3, 8, 1.8, 6, P.sand); c.ellipse(13, 8, 1.8, 6, P.clay);
  for (const y of [5, 7, 9]) c.line(5, y, 11, y, P.clay);
  c.fillRect(7, 12, 2, 3, P.red);
};
I.key = (c) => {
  c.ellipse(5, 5, 3.6, 3.6, P.gold); c.ellipse(5, 5, 1.3, 1.3, 0);
  for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) if ((x + 0.5 - 5) ** 2 + (y + 0.5 - 5) ** 2 < 1.6) c.set(x, y, 0);
  c.line(7, 7, 13, 13, P.gold); c.line(8, 7, 14, 13, P.tan);
  c.fillRect(11, 13, 2, 2, P.gold); c.fillRect(9, 11, 2, 2, P.gold);
  c.set(3, 3, P.yellow); c.set(4, 2, P.yellow);
};
I.charm = (c) => {
  c.line(8, 0, 8, 3, P.red);
  heart(c, 8, 7.5, 0.95, [P.greenDeep, P.greenDark, P.green]);
  c.fillRect(7, 12, 2, 3, P.red); c.set(6, 15, P.red); c.set(9, 15, P.red);
  c.set(8, 7, P.gold);
};
I.coin = (c) => {
  c.ellipse(8, 8, 6, 6, P.tan);
  c.ellipse(7.5, 7.5, 5.5, 5.5, P.gold);
  c.ellipse(7.5, 7.5, 3.6, 3.6, P.tan); c.ellipse(7.3, 7.3, 3.2, 3.2, P.gold);
  c.fillRect(7, 5, 1, 5, P.yellow);
  c.line(4, 4, 5, 3, P.white);
};
I.status_poison = (c) => {
  c.ellipse(8, 10, 5, 5, P.purple);
  c.polygon([[8, 1], [12, 8], [4, 8]], P.purple);
  c.ellipse(7, 9.5, 3, 3.5, X.purpleLight); c.ellipse(6.5, 8.5, 1.2, 1.5, P.magenta);
  c.set(10, 12, X.purpleDark); c.set(6, 6, P.pink);
  px(c, [[12, 3], [13, 4]], P.green);
};
I.status_sleep = (c) => {
  tpl(c, ['#####', '...#.', '..#..', '.#...', '#####'], { '#': P.white }, 2, 7);
  tpl(c, ['####', '..#.', '.#..', '####'], { '#': P.grey1 }, 9, 3);
  tpl(c, ['###', '.#.', '###'], { '#': P.grey2 }, 12, 0);
};
I.status_stun = (c) => {
  star5(c, 5, 5, 4, 1.8, P.yellow, P.white);
  star5(c, 11.5, 9, 3.2, 1.4, P.gold, P.yellow);
  star5(c, 5, 12.5, 2.4, 1.1, P.orange, P.gold);
};
I.status_blind = (c) => {
  c.ellipse(8, 8, 6.5, 3.8, P.white);
  ball(c, 8, 8, 2.6, [P.navy, P.blueDark, P.blue, P.cyan]); c.set(8, 8, P.ink);
  c.line(2, 13, 14, 3, P.red); c.line(2, 14, 14, 4, P.darkRed);
};
I.status_slow = (c) => hourglass(c, P.grey3, P.grey2) || (c.line(12, 6, 12, 12, P.blue), c.line(11, 11, 13, 11, P.blue), c.set(12, 12, P.cyan));
I.status_haste = (c) => {
  c.polygon([[3, 3], [9, 8], [3, 13]], P.gold); c.polygon([[8, 3], [14, 8], [8, 13]], P.yellow);
  c.line(3, 3, 8, 7, P.white); c.line(8, 3, 13, 7, P.white);
};
I.status_protect = (c) => {
  c.polygon([[2, 2], [14, 2], [14, 8], [8, 15], [2, 8]], P.blue);
  c.polygon([[2, 2], [8, 2], [8, 15], [2, 8]], P.cyan);
  c.polygon([[4, 4], [8, 4], [8, 12], [4, 8]], mix(P.cyan, P.white, 0.5));
  c.line(8, 3, 8, 14, P.blueDark);
};
I.status_regen = (c) => {
  heart(c, 8, 8, 1, [P.greenDeep, P.greenDark, P.green]);
  c.fillRect(7, 4, 2, 7, P.white); c.fillRect(5, 6, 6, 2, P.white);
};
I.status_hidden = (c) => {
  c.ellipse(8, 7, 5, 5, P.grey3);
  c.polygon([[3, 8], [13, 8], [15, 15], [1, 15]], P.grey3);
  c.ellipse(8, 7.5, 3, 3.2, P.slate);
  c.set(7, 7, P.grey1); c.set(9, 7, P.grey1);
  c.line(4, 4, 6, 2, P.grey2);
};
I.status_stuck = (c) => {
  c.ellipse(8, 12, 7, 3, P.greenDark);
  c.ellipse(8, 11.5, 5, 2, mix(P.greenDark, P.brown, 0.4));
  c.fillRect(6, 3, 4, 8, P.grey1); c.fillRect(6, 3, 1, 8, P.white);
  c.ellipse(5, 9, 1.6, 2.4, P.greenDark); c.ellipse(11, 8, 1.6, 3, P.greenDark);
  c.set(4, 11, P.green); c.set(11, 6, P.green);
};
I.type_magic = (c) => {
  c.line(2, 14, 9, 7, P.brown); c.line(3, 14, 10, 7, P.clay);
  star5(c, 11, 5, 4.5, 2, P.magenta, P.pink);
  px(c, [[3, 3], [14, 12], [5, 7]], P.white);
};
I.type_swordart = (c) => {
  blade(c, 3, 13, 12, 3);
  c.line(1, 11, 5, 15, P.gold);
  for (let i = 0; i < 8; i++) { const a = -0.2 + i * 0.22; c.set(Math.round(8 + Math.cos(a) * 6.5), Math.round(9 - Math.sin(a) * 6.5), i < 6 ? P.cyan : P.blue); }
};
I.type_skill = (c) => {
  c.ellipse(8, 8, 6, 6, P.greenDark);
  c.ellipse(8, 8, 4, 4, P.green);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.fillRect(Math.round(8 + Math.cos(a) * 6.5) - 1, Math.round(8 + Math.sin(a) * 6.5) - 1, 2, 2, P.greenDark); }
  c.ellipse(8, 8, 1.8, 1.8, P.teal);
  c.set(6, 5, P.white);
};
I.type_ki = (c) => {
  flame(c, 8, 15, 14, 5.5, [P.rust, P.orange, P.gold]);
  c.ellipse(8, 10, 2.5, 2.5, P.yellow); c.set(8, 10, P.white);
};
I.type_party = (c) => {
  const head = (x, y, col) => { c.ellipse(x, y, 2.3, 2.3, P.skinLight); c.ellipse(x, y + 5, 3.2, 2.5, col); c.set(x - 1, y - 1, X.skinPale); };
  head(4, 5, P.blue); head(12, 5, P.red); head(8, 8, P.green);
};
I.sign_weapon = (c) => { signBoard(c); blade(c, 4, 9, 11, 3); c.line(3, 7, 6, 10, P.gold); c.set(3, 10, P.brown); };
I.sign_item = (c) => {
  signBoard(c);
  c.ellipse(8, 8, 3, 2.8, P.grey1); c.ellipse(8, 8.5, 2.2, 1.8, P.red); c.fillRect(7, 3, 2, 3, P.grey2); c.set(7, 7, P.white);
};
I.sign_magic = (c) => { signBoard(c); star5(c, 8, 7.2, 4.3, 1.9, P.gold, P.yellow); };
I.sign_inn = (c) => {
  signBoard(c);
  c.fillRect(3, 8, 10, 2, P.brown); c.fillRect(3, 5, 2, 4, P.brown);
  c.fillRect(5, 7, 8, 1, P.white); c.fillRect(9, 6, 4, 2, P.blue); c.fillRect(5, 6, 3, 1, P.white);
};
I.heart = (c) => heart(c, 8, 8, 1.15, [P.darkRed, P.red, P.pink]);
I.star = (c) => star5(c, 8, 8.5, 7, 3, P.gold, P.yellow);
I.fire = (c) => flame(c, 8, 15, 14, 5.5, [P.red, P.orange, P.yellow]);
I.ice = (c) => {
  const col = P.cyan;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    const dx = Math.cos(a) * 6.5, dy = Math.sin(a) * 6.5;
    c.line(8 - dx, 8 - dy, 8 + dx, 8 + dy, col);
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, x = 8 + Math.cos(a) * 4.5, y = 8 + Math.sin(a) * 4.5;
    c.line(x, y, x + Math.cos(a + 0.9) * 2, y + Math.sin(a + 0.9) * 2, P.white);
    c.line(x, y, x + Math.cos(a - 0.9) * 2, y + Math.sin(a - 0.9) * 2, P.white);
  }
  c.set(8, 8, P.white);
};
I.thunder = (c) => {
  c.polygon([[9, 0], [4, 8], [8, 8], [5, 15], [13, 6], [9, 6], [12, 0]], P.yellow);
  c.polygon([[9, 0], [4, 8], [7, 8], [10, 1]], P.white);
  c.line(9, 7, 6, 13, P.gold);
};
I.earth = (c) => {
  c.polygon([[1, 14], [6, 4], [9, 9], [11, 6], [15, 14]], P.clay);
  c.polygon([[1, 14], [6, 4], [7, 14]], P.tan);
  c.polygon([[11, 6], [15, 14], [12, 14]], P.brown);
  c.polygon([[5, 6], [6, 4], [7.5, 6.5]], P.sandLight);
  c.line(1, 14, 15, 14, P.greenDark);
};
I.holy = (c) => {
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; c.line(8, 8, 8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, k % 2 ? P.gold : P.yellow); }
  c.ellipse(8, 8, 3.8, 3.8, P.yellow); c.ellipse(7.5, 7.5, 2.2, 2.2, P.white);
};
I.shell = (c) => {
  for (let i = 0; i < 4; i++) {
    const y = 3 + i * 3, w = 6 - i * 0.8;
    c.ellipse(8, y + 1, w, 2.2, i % 2 ? P.clay : P.tan);
    c.line(8 - w + 1, y, 8 + w - 2, y, P.sand);
  }
  c.polygon([[6, 14], [10, 14], [8, 16]], P.brown);
};

I.status_flying = (c) => {
  // white wing (feathers hanging down-left) with motion lines
  tpl(c, [
    '.............ww.',
    '...........wwww.',
    '.........wwwwwg.',
    '.......wwwwwwgg.',
    '.....wwwwwwwwg..',
    '...wwwwwwwwwgg..',
    '..wwwwgwwwwgg...',
    '...wwg.wwwgg....',
    '....wg..wwg.....',
    '.....g...wg.....',
    '..........g.....',
  ], { w: P.white, g: P.grey2 }, 1, 2);
  c.line(0, 12, 3, 12, P.grey1); c.line(1, 14, 5, 14, P.grey1); c.line(0, 4, 2, 4, P.grey1);
};
I.status_defend = (c) => {
  c.polygon([[2, 1], [14, 1], [14, 8], [8, 15], [2, 8]], P.grey2);
  c.polygon([[2, 1], [8, 1], [8, 15], [2, 8]], P.grey1);
  c.line(3, 2, 3, 7, P.white); c.line(3, 2, 7, 2, P.white);
  c.polygon([[8, 1], [14, 1], [14, 8], [8, 15]], P.grey3 === undefined ? P.grey2 : P.grey2);
  c.line(13, 2, 13, 8, P.grey3);
  c.fillRect(7, 4, 3, 8, P.gold); c.fillRect(4, 6, 9, 3, P.gold);
  c.fillRect(7, 4, 1, 8, P.yellow); c.fillRect(4, 6, 9, 1, P.yellow);
};

I.status_empower = (c) => {
  // red fist-and-arrow: strength up
  c.polygon([[8, 1], [14, 7], [10, 7], [10, 14], [6, 14], [6, 7], [2, 7]], P.red);
  c.polygon([[8, 1], [8, 14], [6, 14], [6, 7], [2, 7]], P.hotRed);
  c.line(8, 2, 4, 6, P.white); c.line(10, 8, 10, 13, P.darkRed);
};
I.status_bolster = (c) => {
  // grey stone shield with a green up arrow: defence up
  c.polygon([[2, 1], [14, 1], [14, 8], [8, 15], [2, 8]], P.slate);
  c.polygon([[2, 1], [8, 1], [8, 15], [2, 8]], P.grey3);
  c.polygon([[8, 3], [12, 7], [10, 7], [10, 12], [6, 12], [6, 7], [4, 7]], P.green);
  c.line(8, 3, 5, 6, P.white);
};

// ---------------------------------------------------------------- 10x10 status icons
export const STATUS_NAMES = ['poison', 'sleep', 'stun', 'blind', 'slow', 'haste', 'protect', 'regen', 'hidden', 'stuck', 'flying', 'defend', 'empower', 'bolster'];
// 8x8 templates; a 1px #181425 outline is added around them (10x10 total).
const ST = {
  poison: [['...p....', '..pp....', '..pPp...', '.pPPpp..', '.pPpppp.', '.ppppqp.', '.pppqqp.', '..pqqq..'], { p: P.magenta, P: P.pink, q: P.purple }],
  sleep: [['....bbbb', '......b.', '....bbbb', 'wwwww...', '...w....', '..w.....', '.w......', 'wwwww...'], { w: P.white, b: P.grey1 }],
  stun: [['...yy...', '...yy...', 'yyyWWyyy', '.yWWWWy.', '..yWWy..', '.yyyyyy.', '.yy..yy.', '.y....y.'], { y: P.gold, W: P.yellow }],
  blind: [['.......r', '..www.r.', '.wwbbrw.', 'wwbbrbww', 'wwbrbbww', '.wrbbww.', '.rwww...', 'r.......'], { w: P.white, b: P.blueDark, r: P.hotRed }],
  slow: [['tttttttt', '.gsssssg', '..gsssg.', '...gs...', '...gs...', '..gcccg.', '.gcccccg', 'tttttttt'].map((r) => r.slice(0, 8)), { t: P.clay, g: P.grey1, s: P.blue, c: P.cyan }],
  haste: [['y...y...', 'yy..yy..', '.yY..yY.', '..yY..yY', '..yY..yY', '.yY..yY.', 'yy..yy..', 'y...y...'], { y: P.gold, Y: P.yellow }],
  protect: [['bbbbbbbb', 'bCCbbbbB', 'bCbbbbbB', 'bCbbbbbB', '.bbbbbB.', '.bbbbbB.', '..bbbB..', '...bB...'], { b: P.blue, C: P.cyan, B: P.blueDark }],
  regen: [['..gggg..', '..gwwg..', 'gggwwggg', 'gwwwwwwg', 'gwwwwwwg', 'gggwwggg', '..gwwg..', '..gggg..'], { g: P.greenDark, w: P.green }],
  hidden: [['..ssss..', '.sSssss.', '.sSkkks.', 'sSkwkwks', 'sskkkkss', 'ssskksss', 'ssssssss', 'ssssssss'], { s: P.grey3, S: P.grey2, k: P.navy, w: P.grey1 }],
  stuck: [['...mm...', '..mMmm..', '..mmmm.m', '.mMmmmmm', 'mMmmmmmm', 'mmmmmmmd', 'mmmmmddd', '.dddddd.'], { m: P.clay, M: P.tan, d: P.brown }],
  flying: [['......ww', '....wwwg', '..wwwwwg', 'wwwwwwg.', '.wwwgwg.', '..wg.g..', '..g.....', '........'], { w: P.white, g: P.grey1 }],
  empower: [['...rr...', '..rRRr..', '.rRRRRr.', 'rrrRRrrr', '...RR...', '...RR...', '...rr...', '...rr...'], { r: P.red, R: P.hotRed }],
  bolster: [['ssssssss', 'sSssgsss', 'sssgggss', 'ssgggggs', '.sssgss.', '.sssgss.', '..ssss..', '...ss...'], { s: P.slate, S: P.grey2, g: P.green }],
  defend: [['ssssssss', 'sSsyysss', 'syyyyyyq', 'syyyyyyq', '.ssyysq.', '.ssyysq.', '..sssq..', '...sq...'], { s: P.grey2, S: P.white, y: P.gold, q: P.grey3 }],
};
export function statusIconSheet() {
  const img = new Canvas(10 * STATUS_NAMES.length, 10);
  STATUS_NAMES.forEach((n, i) => {
    const c = new Canvas(10, 10);
    tpl(c, ST[n][0], ST[n][1], 1, 1);
    img.blit(c.outline(P.ink), i * 10, 0, { blend: false });
  });
  return { img, json: Object.fromEntries(STATUS_NAMES.map((n, i) => [n, i])) };
}

export function iconFrames() {
  return ICON_NAMES.map((n) => {
    const c = new Canvas(16, 16);
    I[n](c);
    return c.outline(P.ink);
  });
}
export function iconSheet() {
  const frames = iconFrames();
  return { img: grid(frames, 16, 16, 16), json: Object.fromEntries(ICON_NAMES.map((n, i) => [n, i])) };
}
