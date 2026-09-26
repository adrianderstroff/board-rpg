// Humanoid character definitions (heroes + NPCs) and sheet builders for
// charsets (walk sheets), battlers (side view) and faces (portraits).
import { humanoid, skeleton } from './humanoid.mjs';
import { render, Camera, shade, rotX, rotY } from './sdf.mjs';
import { Canvas, mix, dither, sheet, hex, R as cR, G as cG, B as cB } from './raster.mjs';
import { P, RAMPS, X } from './palette.mjs';

const s = shade;

// extra ramps for the harbor / elven / undead characters
const COAT = s([P.ink, P.navy, P.blueDark, P.blue], -0.3);
const SAILOR_STRIPES = (h) => (Math.floor(h.p[1] / 1.1) % 2 ? RAMPS.white : s(RAMPS.blue, -0.35));
const LILAC = [P.purple, X.purpleLight, P.magenta, P.pink];
const TEAL_PALE = [P.teal, mix(P.teal, P.cyan, 0.35), mix(P.greenDark, P.cyan, 0.45), mix(P.cyan, P.white, 0.5)];
const DEEP_BLUE = [P.ink, P.navy, P.blueDark, P.blue];
const BONE = [P.grey2, P.grey1, P.sandLight, X.sandPale];
const SHIRT_PALE = [P.grey2, P.grey1, P.sandLight, X.sandPale];
const RAG = [P.ink, P.darkBrown, P.brown, P.clay];
const ELF_BUILD = { leg: 0.66, torso: 0.72, head: 0.95, girth: 0.82, arm: 0.85 };
// temple monks / island / sea folk
const SAFFRON = RAMPS.saffron;
const MAROON = [P.ink, P.darkBrown, P.darkRed, mix(P.darkRed, P.red, 0.4)];
const ISLAND_SKIN = [P.darkBrown, P.brown, mix(P.brown, P.clay, 0.6), P.clay];
const WRAP = [P.teal, P.greenDeep, P.greenDark, P.green];
const zigzag = (x, y, z) => Math.abs(((y + 0.7 * Math.abs(Math.sin(Math.atan2(x, z) * 4))) % 2.6) - 1.3) < 0.36;
const FISH = [P.navy, P.teal, mix(P.teal, P.blue, 0.45), mix(P.greenDark, P.cyan, 0.45)];
const FISH_BELLY = [mix(P.teal, P.greenDark, 0.5), mix(P.greenDark, P.cyan, 0.45), mix(P.cyan, P.sandLight, 0.55), X.sandPale];
const FIN = [P.darkBrown, P.darkRed, P.rust, P.orange];
const KELP = [P.ink, P.teal, P.greenDeep, P.greenDark];
const GRAVE = [P.ink, P.ink, P.teal, P.greenDeep];
const GHOST_GREEN = [P.greenDark, P.green, mix(P.green, P.white, 0.5), P.white];
/** staggered scale pattern (small dark crescents) */
function scaleAt(x, y, z) {
  const a = Math.atan2(x, z) * 2.2, row = Math.floor(y * 0.9);
  const u = a + (row % 2) * 0.5, fu = u - Math.floor(u) - 0.5, fy = y * 0.9 - row;
  return fy < 0.28 && Math.abs(fu) < 0.3;
}

// ---------------------------------------------------------------- specs
// Keys: skin, hair{ramp,style}, beard{ramp,long}, build{leg,torso,head,girth,arm},
// top, sleeves, forearm, gloves, bottom, legs, boots, belt, skirt, robe, robeTrim, apron,
// vest, vneck, cape, pauldrons, scarf, hat{type,ramp,ramp2,...}, weapon{type}, wraps, wrapsLegs,
// theme (portrait background ramp), blush, smile,
// animal{ears,earTip,earInner,earH,snout}, cheeks, mask (cloth over the lower face/muzzle), tail{ramp,tip,r,side},
// capeBottom, capeRagged, flaredSleeves, sleeveLining, baggy (trousers), beltW, sashTails, creases,
// elfEars (true | {ramp,len}: long pointed ears), bones (thin skeletal limbs/ribcage+spine torso), skull{dark,glint,w} (skull face),
// skirtRagged (zigzag cut-out hem height), weapon.blade/guard (sword colours), weapon.leaf (staff tip leaf ramp),
// hat types: pointed turban hood headscarf helmet knighthelm{plume} wizardhood{height,flop} circlet topknot headband
//   tricorn{trim,size,wall,lean,y,crown} bandana{line} flowers{flower,r,at},
// hair styles: short long longfront bun ponytail spiky sides bald, weapon.gnarled (staff), battleStyle:'martial', castPose(sk), castGlow,
// fish{crest,lips,mouth,eyeRamp,pupil} (fish head: big side eyes, spiny crest, lipped jaw), armFins (forearm fin ramp),
// lei{flowers[],n,r,rx,rz,drop} (flower lei / bead necklace), bushyBrows (sprite-scale brow colour),
// recolor(c) (maps every colour of the model; eye dots are kept), outline (sprite outline colour, default ink),
// weapon.shaft (spear/staff shaft colours), weapon.coral (coral spear head ramp), weapon.skull/skullEyes (skull-topped staff).
export const CHARACTERS = {
  // Aldric – knight: open-faced steel helm with blue plume, silver armor, blue cape, sword.
  hero_knight: {
    hair: { ramp: s(RAMPS.hairBrown, -0.45), style: 'short', line: 0.12 }, build: { head: 1.1, girth: 1.08 },
    top: RAMPS.steel, sleeves: s(RAMPS.navyCloth, 0.2), legs: s(RAMPS.navyCloth, 0.2), bottom: s(RAMPS.blue, -0.5),
    boots: RAMPS.steel, gloves: RAMPS.steel, pauldrons: RAMPS.steel, cape: s(RAMPS.blue, -0.75), belt: RAMPS.leather,
    hat: { type: 'knighthelm', ramp: s(RAMPS.steel, -0.55), ramp2: s(RAMPS.steel, -1.2), plume: s(RAMPS.blue, -0.45) },
    torsoMat: (x, y, z, sk) => (z > 0.2 && Math.abs(x) < 1.3 && y < sk.shoulderY - 0.8 ? s(RAMPS.blue, -0.4) : undefined),
    weapon: { type: 'sword' }, iris: [P.navy, P.blueDark], theme: RAMPS.blue,
  },
  // Mira – wizard woman: tall floppy purple hood, wide-sleeved purple robe, long silver hair, gnarled staff with cyan orb.
  hero_magician: {
    skin: RAMPS.skin, hair: { ramp: s(RAMPS.hairWhite, 0.1), style: 'longfront', line: 0.1 }, build: { head: 1.1 },
    robe: s(RAMPS.violet, -0.1), robeTrim: s(RAMPS.violet, -0.9), top: s(RAMPS.violet, -0.1), sleeves: s(RAMPS.violet, 0),
    flaredSleeves: true, sleeveLining: [P.ink, X.purpleDark, X.purpleDark, P.purple], belt: s(RAMPS.violet, -1.1), boots: RAMPS.violet,
    hat: { type: 'wizardhood', ramp: s(RAMPS.violet, 0.05), height: 1.75, flop: 1 },
    weapon: { type: 'staff', gnarled: true, len: 10, below: 7, orb: [P.teal, P.blue, P.cyan, P.white] },
    castGlow: true, castPose: (sk) => ({ handR: [sk.shoulderX - 0.6, sk.shoulderY + 1.6, 3.4], handL: [-sk.shoulderX + 1.4, sk.shoulderY + 0.4, 4.2], weaponDir: [0, 1, 0.75] }),
    smile: true, creases: true, iris: [P.blueDark, P.blue], brows: P.grey2, theme: RAMPS.violet,
  },
  // Kit – fox thief: orange fur, white muzzle & chest tuft, dark-tipped ears, bushy tail,
  // charcoal-green cape, dark bandit scarf over the muzzle, light leather gear, dagger.
  hero_thief: {
    skin: s(RAMPS.orange, -0.15), hair: null, build: { head: 1.1, girth: 0.95 },
    animal: { ears: s(RAMPS.orange, -0.1), earTip: [P.ink, P.ink, P.darkBrown, P.darkBrown], earInner: RAMPS.white, earH: 1.55, snout: true },
    cheeks: RAMPS.white, mask: s(RAMPS.navyCloth, -0.3),
    top: s(RAMPS.leather, 0.1), sleeves: s(RAMPS.orange, -0.15), legs: s(RAMPS.leather, -0.5), bottom: RAMPS.leather,
    boots: s(RAMPS.leather, -0.9), belt: s(RAMPS.leather, -0.9), gloves: s(RAMPS.leather, -0.3),
    torsoMat: (x, y, z, sk) => (z > 0.6 && y > sk.shoulderY - 2.9 + Math.abs(x) * 0.8 ? RAMPS.white : undefined), // chest tuft
    cape: s(RAMPS.teal, 0.2), capeBottom: 5.2, capeRagged: true, capeCollar: s(RAMPS.navyCloth, -0.3),
    tail: { ramp: s(RAMPS.orange, 0), tip: RAMPS.white, r: 1.55, side: -1 },
    weapon: { type: 'dagger' }, iris: [P.gold, P.yellow], theme: RAMPS.green,
  },
  // Tarek – monk: bald, cream wrap tunic with crossed collar, wide red-brown sash with orange tails,
  // baggy maroon trousers gathered at the ankle, dark wrapped shoes; martial-arts stances.
  hero_monk: {
    skin: RAMPS.skinTan, hair: null, build: { head: 1.06, girth: 1.08, arm: 1.12 },
    top: RAMPS.cream, sleeves: RAMPS.cream, forearm: RAMPS.skinTan,
    torsoMat: (x, y, z, sk) => {
      if (z > 0.2 && y > sk.shoulderY - 2.3 + Math.abs(x) * 0.95) return RAMPS.skinTan; // open neck
      if (z > 0.2 && y > sk.hipY + 1.8 && Math.abs(x + (y - sk.shoulderY) * 0.62 + 0.3) < 0.42) return s(RAMPS.tanCloth, -0.6); // crossed collar
      return undefined;
    },
    belt: [P.darkBrown, P.brown, P.darkRed, P.rust], beltW: 1.05, sashTails: s(RAMPS.orange, 0.6),
    baggy: true, bottom: [P.ink, P.darkBrown, P.brown, P.darkRed], legs: [P.ink, P.darkBrown, P.brown, P.darkRed],
    boots: s(RAMPS.navyCloth, -0.3), battleStyle: 'martial', noBrows: false, brows: P.darkBrown,
    weapon: null, iris: [P.darkBrown, P.brown], theme: RAMPS.orange,
  },
  npc_elder: {
    hair: { ramp: RAMPS.hairWhite, style: 'sides' }, beard: { ramp: RAMPS.hairWhite, long: true }, build: { head: 1.08 },
    robe: s(RAMPS.leather, -0.2), top: s(RAMPS.leather, -0.2), robeTrim: s(RAMPS.tanCloth, 0), belt: RAMPS.tanCloth,
    boots: RAMPS.leather, weapon: { type: 'cane' }, lean: 0.12, iris: [P.darkBrown, P.brown], theme: RAMPS.leather,
  },
  npc_villager_m: {
    skin: RAMPS.skinTan, hair: { ramp: RAMPS.hairBlack, style: 'short' }, build: { head: 1.08 },
    top: RAMPS.cream, belt: RAMPS.leather, bottom: s(RAMPS.tanCloth, -0.8), boots: RAMPS.leather,
    hat: { type: 'turban', ramp: RAMPS.white }, iris: [P.darkBrown, P.brown], theme: RAMPS.tanCloth,
  },
  npc_villager_f: {
    hair: { ramp: RAMPS.hairBrown, style: 'long' }, build: { head: 1.08, girth: 0.95 },
    robe: s(RAMPS.tanCloth, -0.2), top: s(RAMPS.tanCloth, -0.2), sleeves: s(RAMPS.tanCloth, -0.2), robeTrim: s(RAMPS.red, 0), belt: s(RAMPS.red, 0),
    boots: RAMPS.leather, hat: { type: 'headscarf', ramp: s(RAMPS.red, -0.1) }, blush: RAMPS.red, iris: [P.darkBrown, P.brown], theme: RAMPS.orange,
  },
  npc_child: {
    hair: { ramp: s(RAMPS.hairBrown, -0.3), style: 'ponytail' }, build: { leg: 0.66, torso: 0.72, head: 0.95, girth: 0.82, arm: 0.85 },
    top: s(RAMPS.gold, -0.4), robe: s(RAMPS.gold, -0.4), robeHem: 1.2, robeTrim: RAMPS.cream, boots: RAMPS.leather, belt: RAMPS.red,
    blush: RAMPS.red, smile: true, iris: [P.brown, P.clay], theme: RAMPS.gold,
  },
  npc_guard: {
    skin: RAMPS.skinTan, hair: { ramp: RAMPS.hairBlack, style: 'short' }, beard: { ramp: RAMPS.hairBlack }, build: { head: 1.05, girth: 1.05 },
    top: s(RAMPS.leather, 0.2), sleeves: RAMPS.tanCloth, legs: s(RAMPS.tanCloth, -0.4), skirt: RAMPS.tanCloth, bottom: RAMPS.tanCloth,
    boots: RAMPS.leather, belt: s(RAMPS.leather, -0.8), gloves: RAMPS.leather,
    hat: { type: 'helmet', ramp: s(RAMPS.steel, -0.6), ramp2: RAMPS.gold, spike: true },
    weapon: { type: 'spear' }, iris: [P.darkBrown, P.brown], theme: RAMPS.tanCloth,
  },
  npc_smith: {
    skin: RAMPS.skinTan, hair: { ramp: RAMPS.hairBlack, style: 'short', line: 0.1 }, beard: { ramp: s(RAMPS.hairBrown, -0.6) },
    build: { head: 1.05, girth: 1.2, arm: 1.5 },
    top: s(RAMPS.iron, 0.4), sleeves: RAMPS.skinTan, apron: s(RAMPS.red, -0.3), bottom: RAMPS.leather, boots: s(RAMPS.iron, 0),
    gloves: s(RAMPS.leather, 0), weapon: { type: 'hammer' }, iris: [P.darkBrown, P.brown], theme: RAMPS.red,
  },
  npc_merchant: {
    skin: RAMPS.skin, hair: { ramp: RAMPS.hairBlack, style: 'long' }, build: { head: 1.08 },
    top: RAMPS.cream, vest: s(RAMPS.green, 0.2), bottom: s(RAMPS.green, -0.5), legs: s(RAMPS.green, -0.5), boots: RAMPS.leather,
    belt: RAMPS.gold, hat: { type: 'turban', ramp: s(RAMPS.green, 0.3), jewel: RAMPS.gold, tail: true },
    blush: RAMPS.red, smile: true, iris: [P.greenDeep, P.greenDark], theme: RAMPS.green,
  },
  npc_mage: {
    hair: { ramp: RAMPS.hairWhite, style: 'short' }, beard: { ramp: RAMPS.hairWhite, long: true }, build: { head: 1.06 },
    robe: s(RAMPS.violet, -0.1), top: s(RAMPS.violet, -0.1), sleeves: s(RAMPS.violet, -0.1), robeTrim: RAMPS.gold, belt: RAMPS.gold,
    robeMat: (x, y, z) => (starAt(x, y, z) ? RAMPS.gold : undefined),
    hat: { type: 'hood', ramp: s(RAMPS.violet, 0.1), stars: true }, boots: RAMPS.violet,
    weapon: { type: 'staff', orb: RAMPS.gold, len: 8 }, iris: [P.purple, P.magenta], theme: RAMPS.violet,
  },
  npc_innkeeper: {
    hair: { ramp: s(RAMPS.hairBrown, -0.1), style: 'bun' }, build: { head: 1.08, girth: 1.12 },
    robe: RAMPS.cream, top: RAMPS.cream, sleeves: RAMPS.cream, apron: s(RAMPS.blue, -0.3), boots: RAMPS.leather,
    blush: RAMPS.red, smile: true, iris: [P.blueDark, P.blue], theme: RAMPS.blue,
  },  // Captain Rhea – sea captain: long navy coat open at the front (gold trim & buttons), white shirt,
  // red sash, dark trousers & tall boots, gold-trimmed tricorn, auburn ponytail.
  npc_captain: {
    hair: { ramp: s(RAMPS.hairRed, 0.2), style: 'ponytail' }, build: { head: 1.08, girth: 0.97 },
    robe: COAT, top: COAT, sleeves: COAT, robeHem: 3.0, robeTrim: RAMPS.gold, belt: s(RAMPS.red, -0.2),
    robeMat: (x, y, z) => {
      if (z > 0 && y < 7.3 && Math.abs(x) < 0.55 + (7.3 - y) * 0.16) return null; // open coat front
      if (z > 0 && y < 7.3 && Math.abs(x) < 1.25 + (7.3 - y) * 0.16) return RAMPS.gold;
      return undefined;
    },
    torsoMat: (x, y, z, sk) => {
      if (z <= 0.4 || y < sk.hipY + 1.9) return undefined;
      const open = 0.8 + (y - sk.hipY) * 0.1;
      if (Math.abs(x) < open) return RAMPS.white; // shirt
      if (Math.abs(x) < open + 0.55) return RAMPS.gold; // lapel trim
      if (Math.abs(Math.abs(x) - open - 1.3) < 0.4 && Math.abs(((y - sk.hipY) % 1.7) - 0.85) < 0.4) return RAMPS.gold; // buttons
      return undefined;
    },
    legs: s(RAMPS.navyCloth, -0.2), bottom: s(RAMPS.navyCloth, -0.2), boots: s(RAMPS.leather, -1.1), gloves: RAMPS.skin, cuffs: RAMPS.gold,
    hat: { type: 'tricorn', ramp: s(RAMPS.navyCloth, 0.2), ramp2: s(RAMPS.navyCloth, 0.2), trim: RAMPS.gold, size: 0.9, wall: 0.55 },
    iris: [P.greenDeep, P.greenDark], theme: RAMPS.blue,
  },
  // sailor: blue/white striped shirt, red bandana, rolled brown trousers over bare shins, tanned.
  npc_sailor: {
    skin: RAMPS.skinTan, hair: { ramp: RAMPS.hairBlack, style: 'short' }, build: { head: 1.06, girth: 1.02, arm: 1.1 },
    top: RAMPS.white, sleeves: SAILOR_STRIPES, torsoMat: (x, y, z) => SAILOR_STRIPES({ p: [x, y, z] }),
    forearm: RAMPS.skinTan, belt: s(RAMPS.leather, -0.6), bottom: s(RAMPS.leather, 0.1),
    legs: (h) => (h.p[1] < 2.4 ? RAMPS.skinTan : h.p[1] < 3.3 ? s(RAMPS.leather, 0.6) : s(RAMPS.leather, 0.1)),
    boots: s(RAMPS.leather, -0.9), hat: { type: 'bandana', ramp: s(RAMPS.red, 0), line: 0.22 },
    iris: [P.darkBrown, P.brown], theme: RAMPS.blue,
  },
  // old dock hand: short grey hair, grey beard, knit cap, leather vest over a cream shirt, dark trousers.
  npc_sailor_b: {
    skin: RAMPS.skinTan, hair: { ramp: s(RAMPS.hairWhite, -0.5), style: 'short' }, beard: { ramp: s(RAMPS.hairWhite, -0.4) },
    build: { head: 1.05, girth: 1.12 },
    top: SHIRT_PALE, sleeves: SHIRT_PALE, vest: s(RAMPS.leather, -0.2), belt: s(RAMPS.leather, -0.9),
    bottom: s(RAMPS.navyCloth, 0.1), legs: s(RAMPS.navyCloth, 0.1), boots: s(RAMPS.leather, -0.7),
    hat: { type: 'helmet', ramp: s(RAMPS.navyCloth, 0.55), ramp2: s(RAMPS.navyCloth, 0.1) },
    iris: [P.navy, P.slate], theme: RAMPS.teal,
  },
  // elves: small folk (child-sized build) with long pointed ears
  npc_elf: {
    hair: { ramp: s(RAMPS.hairBlond, -0.55), style: 'short' }, build: ELF_BUILD, elfEars: true,
    top: s(RAMPS.green, -0.2), sleeves: s(RAMPS.green, -0.2), skirt: s(RAMPS.green, -0.2), belt: RAMPS.leather,
    cape: s(RAMPS.green, 0.35), capeBottom: 3.2, capeCollar: s(RAMPS.green, 0.35),
    legs: s(RAMPS.tanCloth, -0.3), bottom: s(RAMPS.tanCloth, -0.3), boots: RAMPS.leather,
    smile: true, iris: [P.greenDeep, P.greenDark], theme: RAMPS.green,
  },
  npc_elf_b: {
    hair: { ramp: s(RAMPS.hairWhite, 0.2), style: 'long' }, build: { ...ELF_BUILD, girth: 0.78 }, elfEars: true,
    robe: LILAC, top: LILAC, sleeves: LILAC, robeHem: 1.2, robeTrim: s(RAMPS.violet, -0.4), belt: s(RAMPS.violet, -0.6), boots: RAMPS.violet,
    hat: { type: 'flowers', ramp: s(RAMPS.green, -0.3), flower: [P.magenta, P.pink, P.pink, P.white], r: 0.3, at: [-0.9, 0, 0.9, 1.9, -1.9, 3.1] },
    blush: RAMPS.red, smile: true, iris: [P.purple, P.magenta], theme: RAMPS.violet,
  },
  // Sylwen – elf elder: long white hair, pale teal robe with gold trim, wooden staff sprouting a leaf.
  npc_elf_elder: {
    hair: { ramp: RAMPS.hairWhite, style: 'long' }, build: ELF_BUILD, elfEars: true,
    robe: TEAL_PALE, top: TEAL_PALE, sleeves: TEAL_PALE, robeHem: 0.8, robeTrim: RAMPS.gold, belt: RAMPS.gold, boots: RAMPS.leather,
    hat: { type: 'circlet', ramp: RAMPS.gold, jewel: RAMPS.green },
    weapon: { type: 'staff', leaf: s(RAMPS.green, 0.3), len: 7, below: 4.4 }, creases: true, iris: [P.greenDeep, P.greenDark], theme: RAMPS.green,
  },
  // Faelar – elf magic-shop keeper: deep blue star-patterned robe and pointed hood, staff with a cyan orb.
  npc_elf_mage: {
    hair: { ramp: s(RAMPS.hairWhite, -0.1), style: 'short' }, build: ELF_BUILD, elfEars: true,
    robe: DEEP_BLUE, top: DEEP_BLUE, sleeves: DEEP_BLUE, robeHem: 0.8, robeTrim: RAMPS.gold, belt: RAMPS.gold, boots: DEEP_BLUE,
    robeMat: (x, y, z) => (starAt(x, y * 1.4, z) ? RAMPS.gold : undefined),
    hat: { type: 'hood', ramp: s(DEEP_BLUE, 0.2), stars: true },
    weapon: { type: 'staff', orb: [P.teal, P.blue, P.cyan, P.white], len: 6.5, below: 4.4 }, iris: [P.blueDark, P.blue], theme: RAMPS.blue,
  },
  // animated skeleton warrior: bone body (skull, ribcage, thin limbs), tattered loincloth, rusty sword.
  enemy_skeleton: {
    skin: s(BONE, 0.45), hair: null, noBrows: true, bones: true, skull: { dark: P.ink, glow: P.red, w: 2 }, build: { head: 0.98, girth: 0.8, arm: 0.85 },
    top: BONE, sleeves: BONE, forearm: BONE, gloves: BONE, legs: BONE, boots: BONE,
    torsoMat: (x, y, z, sk) => {
      if (y < sk.hipY + 2.2) return undefined;
      if (z > -0.6 && Math.abs(x) > 0.5 && Math.floor((sk.shoulderY + 0.4 - y) * 0.95) % 2 === 1) return RAMPS.ink; // gaps between ribs
      return BONE;
    },
    bottom: RAG, belt: s(RAMPS.leather, -0.9),
    skirt: RAG, skirtRagged: 1.1,
    weapon: { type: 'sword', blade: [P.sand, P.tan, P.clay, P.rust, P.brown], guard: P.brown, len: 8 },
    iris: [P.red, P.red], theme: RAMPS.navyCloth,
  },
  // ---- Temple Mountain monks: shaved heads, outer robe draped over the left shoulder (right shoulder shows the
  // under-robe), long robe with the under-robe peeking out at the hem, bead necklace, sandals.
  npc_monk: monkSpec({ outer: SAFFRON, under: MAROON }),
  npc_monk_b: monkSpec({ outer: MAROON, under: s(RAMPS.saffron, -0.3), build: { head: 1.1, girth: 0.88, arm: 0.95 }, skin: RAMPS.skin, iris: [P.brown, P.clay] }),
  // old abbot: white beard & long white eyebrows, golden robe with a red sash and red shoulder drape, wooden staff.
  npc_monk_old: {
    ...monkSpec({ outer: s(RAMPS.red, -0.1), under: s(RAMPS.gold, 0.1), build: { head: 1.08 }, skin: RAMPS.skin }),
    beard: { ramp: RAMPS.hairWhite, long: true }, bushyBrows: P.white, brows: P.white, lean: 0.1,
    robe: s(RAMPS.gold, 0.1), robeTrim: s(RAMPS.gold, -0.6), belt: s(RAMPS.red, -0.2), beltW: 0.9, sashTails: s(RAMPS.red, 0),
    weapon: { type: 'staff', orb: RAMPS.wood, len: 8, below: 6.4 }, creases: true, theme: RAMPS.gold,
  },
  // Old Mora – island elder: brown skin, grey hair in a bun, flower lei, green wrap dress with an orange zigzag print.
  npc_islander: {
    skin: ISLAND_SKIN, hair: { ramp: s(RAMPS.hairWhite, -0.55), style: 'bun' }, build: { head: 1.08, girth: 1.06 }, lean: 0.06,
    robe: WRAP, top: WRAP, sleeves: ISLAND_SKIN, robeHem: 1.0, robeTrim: s(RAMPS.orange, -0.2), belt: s(RAMPS.orange, -0.1),
    robeMat: (x, y, z) => (zigzag(x, y, z) ? s(RAMPS.orange, 0.1) : undefined),
    torsoMat: (x, y, z, sk) => (y > sk.shoulderY - 1.2 && z > -0.5 ? ISLAND_SKIN : zigzag(x, y, z) ? s(RAMPS.orange, 0.1) : undefined),
    boots: ISLAND_SKIN,
    lei: { flowers: [s(RAMPS.red, 0.6), RAMPS.white, RAMPS.gold, s(RAMPS.red, 0.6), RAMPS.white, s(RAMPS.orange, 0.5)], n: 14, r: 0.72 },
    smile: true, creases: true, brows: P.grey2, iris: [P.darkBrown, P.brown], theme: RAMPS.green,
  },
  // fish-folk warrior: blue-green scaly skin with a pale belly, fish head (big side eyes, spiny red crest, lips),
  // finned forearms, kelp loincloth, coral-tipped spear.
  enemy_fishfolk: {
    skin: FISH, hair: null, noBrows: true, build: { head: 1.02, girth: 1.02, arm: 1.05 },
    fish: { crest: FIN, lips: s(FISH_BELLY, -0.3), mouth: P.navy },
    armFins: FIN, top: FISH, sleeves: FISH, legs: FISH, boots: s(FISH, -0.2),
    torsoMat: (x, y, z, sk) => {
      if (z > 1.1 && Math.abs(x) < 1.7 && y < sk.shoulderY - 0.9) return FISH_BELLY;
      return scaleAt(x, y, z) ? s(FISH, -0.7) : undefined;
    },
    bottom: KELP, belt: s(KELP, -0.6), skirt: KELP, skirtRagged: 1.5,
    weapon: { type: 'spear', coral: [P.darkRed, P.red, P.pink, X.skinPale], shaft: [P.darkBrown, P.brown, P.brown, P.clay], len: 14, dir: [0.2, 1, 0.12] },
    iris: [P.gold, P.yellow], theme: RAMPS.teal,
  },
  // bone acolyte – undead magician of the final boss: skull face with green-glinting sockets, tattered dark-green
  // hooded robe with wide sleeves, bony hands & feet, bone staff crowned by a glowing green skull, faint green rim.
  enemy_bone_acolyte: {
    skin: s(BONE, 0.45), hair: null, noBrows: true, skull: { dark: P.ink, glow: P.green, glint: P.green, w: 2 }, build: { head: 0.98, girth: 0.9, arm: 0.9 },
    robe: GRAVE, top: GRAVE, sleeves: GRAVE, flaredSleeves: true, sleeveLining: RAMPS.ink, gloves: BONE, boots: BONE, legs: BONE, bottom: GRAVE, robeHem: 0.5,
    robeMat: (x, y) => (y < 0.5 + 1.3 * Math.abs(Math.sin(Math.atan2(x, 1) * 3 + x * 1.7)) ? null : undefined), // tattered hem
    robeTrim: s(GRAVE, -0.6), belt: s(RAMPS.leather, -1), beltW: 0.45,
    hat: { type: 'hood', ramp: s(GRAVE, 0.1) },
    weapon: { type: 'staff', shaft: [P.grey2, P.grey1, X.sandPale, P.grey1], skull: GHOST_GREEN, skullEyes: P.teal, len: 8, below: 6 },
    castGlow: true, outline: P.teal, iris: [P.green, P.green], theme: RAMPS.green,
  },
};
// ---- the heroes' fears: dark shadow twins (violet-black, glowing eyes, violet rim)
CHARACTERS.enemy_shadow_knight = shadowTwin('hero_knight');
CHARACTERS.enemy_shadow_mage = shadowTwin('hero_magician');
CHARACTERS.enemy_shadow_thief = shadowTwin('hero_thief');
CHARACTERS.enemy_shadow_monk = shadowTwin('hero_monk');

function monkSpec({ outer, under, build = { head: 1.06 }, skin = RAMPS.skinTan, iris = [P.darkBrown, P.brown] }) {
  const g = build.girth ?? 1;
  return {
    skin, hair: null, build, brows: P.darkBrown,
    robe: outer, robeHem: 0.8, robeTrim: under, belt: s(outer, -0.5), beltW: 0.45,
    top: outer, sleeves: (h) => (h.p[0] < 0 ? outer : under), forearm: skin,
    torsoMat: (x, y, z, sk) => {
      const edge = x - (0.3 * g + (sk.shoulderY - y) * 0.62);
      if (edge < -0.45) return undefined; // outer robe over the left shoulder, diagonally across the chest
      if (edge < 0) return s(outer, -0.6); // folded edge of the drape
      return under;
    },
    lei: { flowers: [RAMPS.wood], n: 16, r: 0.34, rx: 2.4, rz: 2.5, drop: 2.6 }, // prayer beads
    boots: (h) => (h.p[1] < 0.55 ? s(RAMPS.leather, -0.6) : skin), // sandals
    iris, theme: RAMPS.orange,
  };
}

// shadow twins: every colour mapped by brightness onto a violet-black ramp (value structure kept so the
// silhouette details of the hero stay readable), glowing eyes kept as-is, violet rim instead of the ink outline.
const SHADOW = [P.ink, hex('2b1a3e'), X.purpleDark, P.purple, X.purpleLight];
const GLOW = new Set([P.hotRed, P.pink]); // glow colours survive the shadow recolour
export function shadowColor(c) {
  if (GLOW.has(c)) return c;
  const L = (0.3 * cR(c) + 0.59 * cG(c) + 0.11 * cB(c)) / 255;
  return SHADOW[Math.min(SHADOW.length - 1, Math.floor(L ** 0.9 * SHADOW.length * 1.05))];
}
function shadowTwin(heroId, { eyes = P.hotRed } = {}) {
  const h = CHARACTERS[heroId];
  return { ...h, recolor: shadowColor, eyes, iris: [eyes, eyes], outline: P.purple, theme: RAMPS.violet, shadowOf: heroId };
}

function starAt(x, y, z) {
  const a = Math.atan2(x, z) * 3.2, gy = y * 0.6;
  const cx = Math.floor(a), cy = Math.floor(gy);
  const h = ((cx * 928371 + 17) ^ (cy * 689287 + 5)) >>> 0;
  if (h % 3 !== 0) return false;
  const fx = a - cx - 0.5, fy = gy - cy - 0.5;
  return fx * fx + fy * fy < 0.06;
}

// ---------------------------------------------------------------- charsets
export const CHARSET_W = 24, CHARSET_H = 32;
const YAW_SE = 0.62, YAW_NE = Math.PI - 0.62;

/** Render `fn(camera)` frames with a per-sheet vertical anchor so feet land on y=31. */
export function fitOy(renderAt, targetBottom = 31) {
  const probe = renderAt(30);
  const bb = probe.bbox();
  return 30 + (targetBottom - bb.y1);
}

export function charsetFrames(spec) {
  const pose = (step, extra = {}) => ({ step, lean: spec.lean ?? 0, headTurn: 0.05, ...extra });
  const draw = (yaw, step, oy) => render(humanoid(spec, pose(step)), { w: CHARSET_W, h: CHARSET_H, cam: new Camera({ yaw, pitch: 0.3, ox: 12, oy }), outline: spec.outline });
  const oy = fitOy((o) => draw(YAW_SE, 0, o));
  const rowSE = [-1, 0, 1].map((st) => draw(YAW_SE, st, oy));
  const rowNE = [-1, 0, 1].map((st) => draw(YAW_NE, st, oy));
  return [rowSE, rowSE.map((f) => f.mirrorX()), rowNE, rowNE.map((f) => f.mirrorX())];
}
export function charsetSheet(spec) { return sheet(charsetFrames(spec), CHARSET_W, CHARSET_H); }

// ---------------------------------------------------------------- battlers (heroes face left)
export const BATTLER_W = 32, BATTLER_H = 32;

function heroBattlePoses(spec) {
  const sk = skeleton(spec.build);
  const { shoulderY: S, hipY: H, shoulderX: SX } = sk;
  const w = spec.battleWeapon ?? spec.weapon;
  const wt = w?.type;
  const ready = {
    sword: { handR: [SX + 0.4, H + 3.2, 3.2], weaponDir: [0.1, 0.9, 0.7] },
    staff: { handR: [SX + 0.6, H + 3, 2.2], weaponDir: [0, 1, 0.12] },
    dagger: { handR: [SX + 0.5, H + 2.4, 3.2], weaponDir: [0, 0.2, 1] },
    claw: { handR: [SX + 0.2, H + 4, 3.6], handL: [-SX + 1.2, H + 3.2, 3.2], weaponDir: [0, 0.2, 1] },
  }[wt] ?? {};
  if (spec.battleStyle === 'martial') {
    // guard stance, straight punch, raised-fist ki pose
    const guard = { feet: [2.2, -2.0], handR: [SX - 0.6, S - 1.6, 3.2], handL: [-SX + 1.4, S - 0.6, 4.4], headTurn: 0 };
    return [
      guard,
      { ...guard, bob: -0.7, handR: [SX - 0.6, S - 2.2, 3.0], handL: [-SX + 1.4, S - 1.2, 4.2] },
      { feet: [3.4, -2.8], lean: 0.18, handR: [SX - 1.6, S - 0.4, 7.4], handL: [-SX + 0.4, H + 2.6, -1.2], headTurn: 0 },
      { feet: [2.0, -2.0], handR: [SX - 0.8, S + 5.6, 1.2], handL: [-SX + 1.8, S - 1.4, 3.8], headTurn: 0 },
      { feet: [-0.6, -2.4], lean: -0.32, handR: [SX + 1.4, H + 4.5, -3.0], handL: [-SX - 1.4, H + 4.5, -3.0], headTurn: 0, hurt: true },
      { ko: true },
    ];
  }
  const base = { feet: [1.4, -1.4], headTurn: 0, ...ready };
  return [
    base,
    { ...base, bob: -0.7, handR: ready.handR ? [ready.handR[0], ready.handR[1] - 0.6, ready.handR[2]] : undefined },
    { feet: [3.2, -2.4], lean: 0.25, handR: [SX - 0.5, S + 0.2, 6.0], handL: [-SX - 0.6, H + 1.5, -2.5], weaponDir: wt === 'staff' ? [0, 0.4, 1] : [0, -0.2, 1], headTurn: 0 },
    spec.castPose ? { feet: [1.2, -1.2], headTurn: 0, glow: !!spec.castGlow, ...spec.castPose(sk) }
      : { feet: [1.2, -1.2], handR: [SX - 0.8, S + 5.2, 1.8], handL: [-SX + 0.8, S + 5.2, 1.8], weaponDir: [0, 1, 0.15], headTurn: 0, glow: !!spec.castGlow },
    { feet: [-0.6, -2.4], lean: -0.32, handR: [SX + 1.4, H + 4.5, -3.0], handL: [-SX - 1.4, H + 4.5, -3.0], weaponDir: [0, 0.3, -1], headTurn: 0, hurt: true },
    { ko: true },
  ];
}

export function heroBattlerFrames(spec) {
  const yaw = -1.2;
  const poses = heroBattlePoses(spec);
  const bspec = { ...spec, weapon: spec.battleWeapon ?? spec.weapon };
  return poses.map((p) => {
    if (p.ko) {
      const sk = skeleton(spec.build);
      const pose = { rot: rotX(-Math.PI / 2), pivot: [0, 0, 0], offset: [0, 2.3, 11.5], feet: [0, 0], weaponDir: [0, 0.2, 1] };
      const m = humanoid({ ...bspec, closedEyes: true, weapon: null }, pose);
      const f = render(m, { w: BATTLER_W, h: BATTLER_H, cam: new Camera({ yaw, pitch: 0.35, ox: 16, oy: 28 }), outline: spec.outline });
      return bottomAlign(f, 31);
    }
    const m = humanoid({ ...bspec, closedEyes: !!p.hurt }, p);
    const f = render(m, { w: BATTLER_W, h: BATTLER_H, cam: new Camera({ yaw, pitch: 0.2, ox: 17, oy: 29 }), outline: spec.outline });
    return bottomAlign(f, 31);
  });
}

/** Shift a frame vertically so its lowest opaque pixel is on row `y`. */
export function bottomAlign(f, y) {
  const bb = f.bbox();
  return bb ? f.shifted(0, y - bb.y1) : f;
}

// ---------------------------------------------------------------- faces
export const FACE = 48;
export function portraitBackground(theme, size = FACE) {
  const c = new Canvas(size, size);
  const top = mix(theme[1], P.navy, 0.35), bot = mix(theme[0], P.ink, 0.35);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const t = y / (size - 1);
      c.set(x, y, dither(x, y, t) ? bot : top);
    }
  // soft vignette ring
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size * 0.42) / (size * 0.62);
      if (d > 0.9 && dither(x, y, Math.min(1, (d - 0.9) * 4))) c.set(x, y, mix(bot, P.ink, 0.5));
    }
  return c;
}

export function faceFrame(spec, { yaw = 0.32, scale = 2.35, bg = true } = {}) {
  const sk = skeleton(spec.build);
  const cam0 = new Camera({ yaw, pitch: 0.12, scale, ox: 0, oy: 0 });
  const hp = cam0.project(sk.head);
  const cam = new Camera({ yaw, pitch: 0.12, scale, ox: 24 - hp[0] - 1, oy: 22 - hp[1] });
  const pose = { detail: true, headTurn: 0.1, handR: [sk.shoulderX + 0.8, sk.hipY + 1, 0.4], handL: [-sk.shoulderX - 0.8, sk.hipY + 1, 0.4] };
  const f = render(humanoid({ ...spec, weapon: null }, pose), { w: FACE, h: FACE, cam, dither: 0.5 });
  if (!bg) return f;
  const out = portraitBackground(spec.theme ?? RAMPS.navyCloth);
  out.blit(f, 0, 0);
  return out;
}

export const FACE_IDS = {
  hero_knight: 'hero_knight', hero_magician: 'hero_magician', hero_thief: 'hero_thief', hero_monk: 'hero_monk',
  elder: 'npc_elder', smith: 'npc_smith', merchant: 'npc_merchant', mage: 'npc_mage', innkeeper: 'npc_innkeeper',
  child: 'npc_child', guard: 'npc_guard', villager_m: 'npc_villager_m', villager_f: 'npc_villager_f',
};

export const GENERIC_SPEC = {
  skin: [P.ink, P.ink, P.darkBrown, P.brown], hair: null, closedEyes: false, noBrows: true,
  top: s(RAMPS.leather, -0.4), sleeves: s(RAMPS.leather, -0.4), hat: { type: 'hood', ramp: s(RAMPS.leather, -0.2) },
  iris: [P.gold, P.yellow], theme: RAMPS.navyCloth, beard: null,
};
