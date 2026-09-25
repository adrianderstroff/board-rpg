// Endesga-32 palette with descriptive names, plus shading ramps (dark -> light).
import { hex } from './raster.mjs';

const E32 = {
  rust: 'be4a2f', tan: 'd77643', sandLight: 'ead4aa', sand: 'e4a672', clay: 'b86f50', brown: '733e39', darkBrown: '3e2731',
  darkRed: 'a22633', red: 'e43b44', orange: 'f77622', gold: 'feae34', yellow: 'fee761',
  green: '63c74d', greenDark: '3e8948', greenDeep: '265c42', teal: '193c3e',
  blueDark: '124e89', blue: '0099db', cyan: '2ce8f5', white: 'ffffff',
  grey1: 'c0cbdc', grey2: '8b9bb4', grey3: '5a6988', slate: '3a4466', navy: '262b44', ink: '181425',
  hotRed: 'ff0044', purple: '68386c', magenta: 'b55088', pink: 'f6757a', skinLight: 'e8b796', skin: 'c28569',
};

/** Packed colors by name. */
export const P = Object.fromEntries(Object.entries(E32).map(([k, v]) => [k, hex(v)]));
export const OUTLINE = P.ink;

// A handful of extra in-between shades, used sparingly (kept on E32 hues).
export const X = {
  purpleLight: hex('8a4f8e'),
  purpleDark: hex('45283c'),
  skinDark: hex('9a5e4a'),
  skinPale: hex('f3d0b2'),
  sandPale: hex('f4e6c8'),
};

export const RAMPS = {
  skin: [P.brown, P.skin, P.skinLight, X.skinPale],
  skinTan: [P.darkBrown, P.brown, P.skin, P.skinLight],
  steel: [P.slate, P.grey3, P.grey2, P.grey1, P.white],
  iron: [P.ink, P.navy, P.slate, P.grey3],
  gold: [P.brown, P.tan, P.gold, P.yellow],
  blue: [P.navy, P.blueDark, P.blue, P.cyan],
  navyCloth: [P.ink, P.navy, P.slate, P.grey3],
  violet: [X.purpleDark, P.purple, X.purpleLight, P.magenta],
  green: [P.teal, P.greenDeep, P.greenDark, P.green],
  red: [P.darkBrown, P.darkRed, P.red, P.pink],
  orange: [P.brown, P.rust, P.orange, P.gold],
  saffron: [P.rust, P.tan, P.orange, P.gold],
  leather: [P.darkBrown, P.brown, P.clay, P.tan],
  tanCloth: [P.brown, P.clay, P.sand, P.sandLight],
  cream: [P.clay, P.sand, P.sandLight, X.sandPale],
  white: [P.grey3, P.grey2, P.grey1, P.white],
  hairBlack: [P.ink, P.navy, P.slate, P.grey3],
  hairBrown: [P.darkBrown, P.brown, P.clay, P.tan],
  hairBlond: [P.tan, P.gold, P.yellow, P.white],
  hairRed: [P.darkBrown, P.darkRed, P.rust, P.tan],
  hairWhite: [P.grey3, P.grey2, P.grey1, P.white],
  wood: [P.darkBrown, P.brown, P.clay, P.tan],
  sand: [P.clay, P.sand, P.sandLight, X.sandPale],
  scorpion: [P.brown, P.clay, P.sand, P.sandLight],
  emperor: [P.ink, P.darkBrown, P.darkRed, P.red],
  condor: [P.ink, P.darkBrown, P.brown, P.clay],
  condorHead: [P.darkRed, P.pink, P.skinLight, X.skinPale],
  teal: [P.ink, P.teal, P.greenDeep, P.greenDark],
  ink: [P.ink, P.ink, P.navy, P.slate],
};
