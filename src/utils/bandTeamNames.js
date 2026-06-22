/**
 * Suggest reading-band names from band colours.
 *
 * Two flavours, both derived from each band's colour (not its position, so they
 * work for any custom palette and band count):
 *  - suggestColourNames: plain colour labels (Blue, Rose, Forest…) — the "reset
 *    to colour names" action.
 *  - suggestTeamNames: fun, primary-school-friendly team names (Blue Crew, Pink
 *    Posse, Mellow Yellows…).
 *
 * Both de-duplicate across the ladder: the default 16-band ladder repeats some
 * colour families (three purples, two blues/greens/yellows), so each family has
 * a pool of alternatives that are handed out in turn, with a numeric suffix only
 * as a last resort.
 */

const HEX6 = /^#?([0-9a-f]{6})$/i;

/** #RRGGBB → { h: 0–360, s: 0–1, l: 0–1 }, or null if not a hex colour. */
export function hexToHsl(hex) {
  const m = HEX6.exec(String(hex == null ? '' : hex).trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

/**
 * Bucket a colour into a coarse family key used to look up names.
 * Returns one of: red, orange, yellow, green, turquoise, blue, purple, pink,
 * brown, grey, white, black.
 */
export function colourFamily(hex) {
  const hsl = hexToHsl(hex);
  if (!hsl) return 'grey';
  const { h, s, l } = hsl;

  // Near-white / near-black first — extreme lightness reads as cream/ink even
  // with a trace of saturation.
  if (l >= 0.93) return 'white';
  if (l <= 0.07) return 'black';

  // Low saturation = neutral; split by lightness.
  if (s < 0.12) {
    if (l >= 0.85) return 'white';
    if (l <= 0.2) return 'black';
    return 'grey';
  }

  // Brown = a dark or muted warm colour (reds through ambers/tans). Vivid reds,
  // oranges and yellows keep their own families; browns are the low-chroma ones
  // (peru, tan, chestnut) or the dark-and-not-neon ones (chocolate, maroon-ish).
  if ((h < 50 || h >= 345) && (l < 0.45 ? s < 0.85 : l < 0.72 && s < 0.6)) return 'brown';

  // Light reds and magentas read as pink.
  if ((h >= 330 || h < 15) && l > 0.7) return 'pink';
  if (h >= 300 && h < 330) return l > 0.75 ? 'pink' : 'purple';

  // Main hue wheel.
  if (h < 15 || h >= 330) return 'red';
  if (h < 45) return 'orange';
  if (h < 66) return 'yellow';
  if (h < 158) return 'green';
  if (h < 200) return 'turquoise';
  if (h < 255) return 'blue';
  return 'purple'; // 255–300
}

// Plain-ish colour labels per family (first entry is the canonical word).
const COLOUR_NAME_POOLS = {
  red: ['Red', 'Scarlet', 'Ruby', 'Cherry'],
  orange: ['Orange', 'Tangerine', 'Amber', 'Apricot'],
  yellow: ['Yellow', 'Sunshine', 'Gold', 'Lemon'],
  green: ['Green', 'Lime', 'Forest', 'Emerald'],
  turquoise: ['Turquoise', 'Teal', 'Aqua', 'Jade'],
  blue: ['Blue', 'Sky', 'Navy', 'Cobalt'],
  purple: ['Purple', 'Lilac', 'Violet', 'Plum'],
  pink: ['Pink', 'Rose', 'Coral', 'Blossom'],
  brown: ['Brown', 'Chestnut', 'Bronze', 'Cocoa'],
  grey: ['Grey', 'Silver', 'Slate', 'Pewter'],
  white: ['White', 'Cream', 'Snow', 'Pearl'],
  black: ['Black', 'Midnight', 'Charcoal', 'Onyx'],
};

// Fun, primary-friendly team names per family (alliterative, friendly animals).
// Busy families (blue/green/purple/pink) carry extra entries so a ladder heavy
// in one colour doesn't fall back to numbered names.
const TEAM_NAME_POOLS = {
  red: ['Red Robins', 'Red Rockets', 'Ruby Racers', 'Red Kites'],
  orange: ['Orange Owls', 'Tangerine Tigers', 'Amber Antelopes', 'Zesty Foxes'],
  yellow: ['Mellow Yellows', 'Sunshine Squad', 'Buzzing Bees', 'Yellow Ducklings'],
  green: [
    'Green Geckos',
    'Leaf Leapers',
    'Green Frogs',
    'Forest Foxes',
    'Minty Moths',
    'Green Grasshoppers',
  ],
  turquoise: ['Teal Turtles', 'Aqua Dolphins', 'Turquoise Tigers', 'Teal Terns'],
  blue: ['Blue Crew', 'Bluebirds', 'Blue Whales', 'Blue Dolphins', 'Sky Sailors', 'Ocean Otters'],
  purple: [
    'Purple Pandas',
    'Violet Voyagers',
    'Plum Penguins',
    'Purple Puffins',
    'Lilac Llamas',
    'Violet Voles',
  ],
  pink: ['Pink Posse', 'Pink Flamingos', 'Rose Robins', 'Pink Penguins', 'Rosy Rabbits'],
  brown: ['Brown Bears', 'Chestnut Chipmunks', 'Brown Owls', 'Cocoa Cubs'],
  grey: ['Grey Wolves', 'Silver Squirrels', 'Grey Geese', 'Silver Sharks'],
  white: ['Snowy Owls', 'Polar Bears', 'Cloud Crew', 'Snow Leopards'],
  black: ['Night Owls', 'Midnight Moles', 'Starlight Seals', 'Inky Penguins'],
};

/**
 * Hand out names for a band list from per-family pools, keeping every result
 * unique. Falls back to a numeric suffix once a family's pool is exhausted.
 */
function assignFromPools(bands, pools) {
  const used = new Set();
  return (Array.isArray(bands) ? bands : []).map((band) => {
    const family = colourFamily(band && band.color);
    const pool = pools[family] || pools.grey;
    let pick = pool.find((name) => !used.has(name));
    if (!pick) {
      let k = 2;
      while (used.has(`${pool[0]} ${k}`)) k += 1;
      pick = `${pool[0]} ${k}`;
    }
    used.add(pick);
    return pick;
  });
}

/** Plain colour-word names for each band (e.g. ['Blue', 'Pink', 'Green', …]). */
export const suggestColourNames = (bands) => assignFromPools(bands, COLOUR_NAME_POOLS);

/** Fun team names for each band (e.g. ['Blue Crew', 'Pink Posse', …]). */
export const suggestTeamNames = (bands) => assignFromPools(bands, TEAM_NAME_POOLS);
