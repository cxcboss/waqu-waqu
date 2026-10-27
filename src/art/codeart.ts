// Registers the code-drawn indoor art (furniture.ts, room.ts) as sprites under the names the painted
// pictures had, with the same bounds, so the scenes place them exactly where the paintings went.
// Imported once for its side effects (game.ts). The home page and route map register their own (hub.ts, map.ts).
import * as F from './furniture';
import { TOD, type Tod, type TodName } from './kit';
import * as R from './room';
import { codeSprite } from './sprites';

const todOf = (v: string): Tod => TOD[v as TodName] ?? TOD.day;

/** Sprites drawn differently at each hour: ask for them as `name:<tod>` (see `todSprite`). */
const BY_HOUR = new Set<string>();
const hourly = (name: string, b: [number, number, number, number], draw: (c: Parameters<typeof F.bed>[0], tod: Tod) => void) => {
  BY_HOUR.add(name);
  codeSprite(name, b, (c, v) => draw(c, todOf(v)));
};

/** The sprite name to draw for `name` at this hour: with the hour for the ones that change, as is otherwise. */
export const todSprite = (name: string, tod: Tod) => (BY_HOUR.has(name) ? `${name}:${tod.name}` : name);

// the frog's room
codeSprite('home_bed', [-122, -157, 118, 14], F.bed);
codeSprite('home_desk', [-111, -158, 111, 12.5], F.desk);
codeSprite('home_ledger', [-69, -104, 69, 0], F.ledger);
codeSprite('home_wardrobe', [-82, -306, 82, 12.5], F.wardrobe);
codeSprite('home_wardrobe_open', [-82, -303, 82, 0], F.wardrobeOpen);
codeSprite('home_mailbox', [-52, -150, 62, 4], F.homeMailbox);
hourly('home_window', [-104, -125, 104, 125], F.homeWindow);
codeSprite('home_rug', [-130, -40, 130, 40], R.ragRug);

// the 16 decorations from the shop
hourly('deco_rug', [-139, -50, 139, 50], F.rug);
hourly('deco_plant', [-44, -99, 44, 4], F.plant);
codeSprite('deco_clock', [-43, -101, 43, 37.5], F.cuckoo);
codeSprite('deco_lights', [-178, -4, 178, 37.5], F.lights);
codeSprite('deco_lamp', [-50, -107, 50, 5.5], F.mushroomLamp);
codeSprite('deco_fish', [-39, -75, 39, 5.5], F.fishbowl);
codeSprite('deco_shelf', [-92, -83, 92, 19.4], F.shelf);
codeSprite('deco_record', [-60, -135, 60, 11], F.gramophone);
codeSprite('deco_curtain', [-104, -264, 104, 0], F.curtains);
hourly('deco_cushion', [-52, -83, 52, 0], F.cushion);
hourly('deco_flag', [-45, -160, 45, 0], F.pennant);
codeSprite('deco_painting', [-59, -139, 59, 0], F.painting);
codeSprite('deco_globe', [-52, -139, 52, 0], F.globe);
codeSprite('deco_teatable', [-80, -139, 80, 0], F.teaTable);
codeSprite('deco_hammock', [-118, -139, 118, 0], F.hammock);
codeSprite('deco_trophy', [-69, -167, 69, 0], F.trophyShelf);

// HQ: the office behind the counter, and the counter
hourly('hq_room', [0, -300, 750, 900], R.hqRoom);
codeSprite('hq_counter', [-14, -96, 764, 170], R.hqCounter);

// the shop
codeSprite('shop_back', [0, -220, 750, 420], R.shopBack);
codeSprite('shop_counter', [0, -96, 750, 156], R.shopCounter);
codeSprite('shop_gift', [-56, -111, 56, 0], R.giftBox);

// staff cards, one per rank
for (let i = 0; i < 7; i++) codeSprite(`badge_rank${i}`, [-125, -80, 125, 80], (c) => R.rankBadge(c, i));
