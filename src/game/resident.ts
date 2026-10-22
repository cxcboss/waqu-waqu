// A resident's day at their door. When their house drifts into view with a parcel on the way,
// the door swings open and they step out to wait; they wave the frog over, reach for the parcel,
// cheer (or scratch their head at the wrong one), pay for cash on delivery, and carry it back
// inside. If their house slips past with the parcel still on the truck, they sulk and go in.
// Each frame is one painted pose (POSES); the walking, hopping and bouncing are done here.
import { INK, P } from '../art/palette';
import { K, boxSprite, type SpriteBank } from '../art/sprites';
import { ellipse, roundRect, text } from '../art/ui';
import { clamp, easeOutBack } from '../engine/math';
import type { Ctx } from '../platform/types';
import { POSES, RESIDENT, type Pose } from './cast';
import type { House } from './level';

type Mode = 'home' | 'out' | 'stand' | 'in';
type Act = 'idle' | 'wait' | 'wave' | 'reach' | 'happy' | 'confused' | 'pay' | 'sad' | 'bye';

export interface ResidentState {
  mode: Mode;
  /** Seconds in this mode. */
  t: number;
  /** How far the door is open (0–1), and which way it's going. */
  door: number;
  doorOpen: boolean;
  /** Facing right (1) or left (-1), and the walk cycle. */
  face: number;
  step: number;
  /** Seconds to dawdle before coming out once the house is in view, so neighbors don't move in step. */
  delay: number;
  /** Out of the doorway's shadow: 0 inside, 1 fully out. */
  shown: number;
  act: Act;
  actT: number;
  /** The parcel they got, hugged on the way back in. */
  carry: { size: number; urgent: boolean; cod: boolean } | null;
  /** Had parcels coming today; done once they're all through (or lost) and they've gone in. */
  expecting: boolean;
  done: boolean;
}

/** What a resident can see of the game this frame. */
export interface ResidentView {
  /** The raft center on screen, and the screen height. */
  screenY: number;
  H: number;
  /** Parcels still meant for this house: on the truck, in the bag or adrift. */
  pending: number;
  /** One of them is in the frog's bag. */
  theirs: boolean;
  frogOn: boolean;
  frogX: number;
  frogY: number;
  /** Counting out change for their cash-on-delivery parcel. */
  paying: boolean;
  riverMid: number;
}

export function newResident(r: number): ResidentState {
  return {
    mode: 'home', t: 0, door: 0, doorOpen: false, face: 1, step: 0, delay: 0.15 + r * 0.9, shown: 0,
    act: 'idle', actT: 0, carry: null, expecting: false, done: false,
  };
}

const DOOR_T = 0.28;
const WALK = 58;

function go(h: House, mode: Mode) {
  h.res.mode = mode;
  h.res.t = 0;
}

/** Walks toward a spot on the raft; true once there. */
function walkTo(h: House, x: number, y: number, dt: number) {
  const s = h.res, def = RESIDENT[h.species];
  const dx = x - h.resident.x, dy = y - h.resident.y, d = Math.hypot(dx, dy);
  const v = WALK * def.pace * dt;
  if (d <= v) {
    h.resident.x = x;
    h.resident.y = y;
    return true;
  }
  h.resident.x += (dx / d) * v;
  h.resident.y += (dy / d) * v;
  if (Math.abs(dx) > 0.5 && def.gait !== 'scuttle') s.face = dx < 0 ? -1 : 1;
  s.step += dt * (def.gait === 'scuttle' ? 9 : 5.5) * Math.max(0.6, def.pace);
  return false;
}

export function updateResident(h: House, v: ResidentView, dt: number) {
  const s = h.res;
  s.t += dt;
  s.door = clamp(s.door + (s.doorOpen ? dt : -dt) / DOOR_T, 0, 1);
  if (v.pending > 0) s.expecting = true;
  const doorX = h.door.x, doorY = h.door.y + 2;
  const inView = v.screenY > -30 && v.screenY < v.H * 0.78;
  const wants = v.frogOn || !!h.hold || v.paying || (!s.done && v.pending > 0 && inView);

  // A parcel tossed over before they're out: they hurry into the doorway to catch it.
  if (h.hold && s.mode !== 'stand') {
    go(h, 'stand');
    s.doorOpen = true;
    s.shown = 1;
  }

  switch (s.mode) {
    case 'home':
      h.resident.x = doorX;
      h.resident.y = doorY;
      s.shown = 0;
      s.doorOpen = false;
      if (wants) {
        s.delay -= dt * (v.frogOn ? 3 : 1);
        if (s.delay <= 0) {
          go(h, 'out');
          s.face = h.spot.x < doorX ? -1 : 1;
        }
      }
      break;
    case 'out':
      s.doorOpen = true;
      if (s.door < 0.7) break;
      if (s.shown < 1) {
        s.shown = Math.min(1, s.shown + dt / 0.3);
        break;
      }
      if (walkTo(h, h.spot.x, h.spot.y, dt)) go(h, 'stand');
      break;
    case 'in':
      if (s.shown >= 1 && !walkTo(h, doorX, doorY, dt)) break;
      s.shown = Math.max(0, s.shown - dt / 0.35);
      if (s.shown > 0) break;
      s.doorOpen = false;
      if (s.door <= 0) {
        go(h, 'home');
        s.delay = 0.6;
        s.carry = null;
      }
      break;
    case 'stand':
      stand(h, v, dt);
      break;
  }
}

function stand(h: House, v: ResidentView, dt: number) {
  const s = h.res;
  const rx = h.plat.x + h.resident.x, ry = h.plat.y + h.resident.y;
  const near = Math.hypot(v.frogX - rx, v.frogY - ry);
  let act: Act;
  if (h.hold) act = h.hold.t < 0 ? 'reach' : h.hold.wrong ? 'confused' : 'happy';
  else if (v.paying) act = 'pay';
  else if (h.react && h.react.t >= 0 && h.react.t < 1.4) act = h.react.kind === 'happy' ? 'happy' : 'confused';
  else if (v.pending > 0) {
    if (v.frogOn) act = v.theirs ? 'reach' : 'idle';
    else if (v.screenY > v.H * 0.78) act = 'sad'; // slipping past with their parcel still out there
    else if (v.theirs && near < 330) act = 'wave';
    else act = 'wait';
  } else if (s.carry) act = 'bye';
  else if (s.expecting) act = 'sad';
  else act = v.frogOn ? 'idle' : 'bye';
  if (act !== s.act) {
    s.act = act;
    s.actT = 0;
  } else s.actT += dt;
  // keep hold of the right parcel to carry in
  if (h.hold && !h.hold.wrong && h.hold.t >= 0) s.carry = { size: h.hold.size, urgent: h.hold.urgent, cod: h.hold.cod };

  // look at the frog when it's close, otherwise out over the river
  const lookX = v.frogOn || near < 420 ? v.frogX : v.riverMid;
  if (Math.abs(lookX - rx) > 8) s.face = lookX < rx ? -1 : 1;

  const leaving =
    (act === 'sad' && s.actT > 1.6) ||
    (act === 'bye' && !v.frogOn && s.actT > (s.carry ? 1.2 : 0.2));
  if (leaving) {
    if (v.pending === 0 || act === 'sad') s.done = true;
    go(h, 'in');
  }
}

// ---------------------------------------------------------------- drawing

function arch(ctx: Ctx, x0: number, yb: number, w: number, hgt: number) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x0, yb);
  ctx.lineTo(x0, yb - hgt + r);
  ctx.arc(x0 + r, yb - hgt + r, r, Math.PI, 0);
  ctx.lineTo(x0 + w, yb);
  ctx.closePath();
}

/** A house with its door and the resident out front. (x, y) is the raft center on screen. */
export function drawHouse(ctx: Ctx, sp: SpriteBank, h: House, x: number, y: number, time: number) {
  sp.draw(ctx, `house_${h.type}`, x, y);
  if (h.res.door > 0) drawDoor(ctx, sp, h, x, y);
  drawResident(ctx, sp, h, x, y, time);
}

function drawDoor(ctx: Ctx, sp: SpriteBank, h: House, x: number, y: number) {
  const k = h.res.door;
  const d = h.door;
  const x0 = x + d.x - d.w / 2, yb = y + d.y;
  ctx.save();
  // the doorway: painted standing open if there's art for it, else a dark arch with lamplight inside
  if (sp.isArt(`door_${h.type}`)) sp.draw(ctx, `door_${h.type}`, x, y, 1, 1, 0, k);
  else {
    arch(ctx, x0, yb, d.w, d.h);
    ctx.globalAlpha = k;
    ctx.fillStyle = '#3A2E26';
    ctx.fill();
    ctx.clip();
    ctx.globalAlpha = 0.45 * k;
    ellipse(ctx, x0 + d.w / 2, yb - 4, d.w * 0.5, d.h * 0.32);
    ctx.fillStyle = P.gold;
    ctx.fill();
  }
  ctx.restore();
  // the door itself swings in on its hinge: the closed door cut out of the house picture, narrowing
  if (!sp.has(`house_${h.type}`)) return;
  const hs = sp.get(`house_${h.type}`);
  const kx = hs.img.width / hs.w, ky = hs.img.height / hs.h;
  const lw = d.w * (1 - 0.86 * k);
  const hingeLeft = h.spot.x > d.x;
  ctx.save();
  arch(ctx, x0, yb, d.w, d.h);
  ctx.clip();
  const lx = hingeLeft ? x0 : x0 + d.w - lw;
  ctx.drawImage(hs.img, (hs.ax + d.x - d.w / 2) * kx, (hs.ay + d.y - d.h) * ky, d.w * kx, d.h * ky, lx, yb - d.h, lw, d.h);
  ctx.globalAlpha = 0.3 * k;
  ctx.fillStyle = INK;
  ctx.fillRect(lx, yb - d.h, lw, d.h);
  ctx.restore();
}

const SCALE = 1.05;

function drawResident(ctx: Ctx, sp: SpriteBank, h: House, x: number, y: number, time: number) {
  const s = h.res;
  if (s.shown <= 0) return;
  const def = RESIDENT[h.species];
  const t = time + h.phase;
  const rx = x + h.resident.x, ry = y + h.resident.y;
  let pose: Pose = 'idle';
  let rot = 0, lift = 0, sy = 1, ox = 0;
  const walking = (s.mode === 'out' || s.mode === 'in') && s.shown >= 1;
  if (walking) {
    // two-frame walk, in the resident's own gait
    const ph = s.step % 2;
    pose = def.gait === 'glide' ? 'walk' : ph < 1 ? 'walk' : 'idle';
    if (def.gait === 'hop') {
      lift = Math.abs(Math.sin(s.step * Math.PI)) * 12;
      pose = lift > 3 ? 'walk' : 'idle';
    } else if (def.gait === 'waddle') rot = Math.sin(s.step * Math.PI) * 0.09;
    else if (def.gait !== 'glide') lift = Math.abs(Math.sin(s.step * Math.PI)) * 2.5;
  } else if (s.mode === 'in') pose = 'back';
  else if (s.mode === 'stand') {
    const a = s.actT;
    sy = 1 + Math.sin(t * 2.4) * 0.018;
    switch (s.act) {
      case 'wait':
        pose = (t % 4) < 2.4 ? 'wait' : 'idle';
        break;
      case 'wave':
      case 'bye':
        pose = 'wave';
        rot = Math.sin(t * 9) * 0.05;
        break;
      case 'reach':
        pose = 'reach';
        lift = Math.abs(Math.sin(t * 5)) * 2;
        break;
      case 'pay':
        pose = 'reach';
        break;
      case 'happy':
        pose = 'cheer';
        lift = Math.abs(Math.sin(a * 9)) * 16 * Math.max(0, 1 - a / 1.3);
        break;
      case 'confused':
        pose = 'puzzled';
        rot = 0.12 * Math.sin(Math.min(a * 6, Math.PI / 2));
        break;
      case 'sad':
        pose = 'sad';
        ox = a < 0.5 ? Math.sin(a * 40) * 2 : 0; // a little stamp of the foot
        break;
    }
  }
  const name = `r_${def.id}_${pose}`;
  const face = s.face;
  const inDoor = s.shown < 1;
  ctx.save();
  if (inDoor) {
    // still in the doorway's shadow: only what's inside the door frame shows
    const d = h.door;
    arch(ctx, x + d.x - d.w / 2, y + d.y + 2, d.w, d.h + 2);
    ctx.clip();
  }
  const k = SCALE * (inDoor ? 0.9 + 0.1 * s.shown : 1);
  ctx.translate(rx + ox, ry - lift);
  ctx.rotate(rot);
  ctx.scale(face, 1);
  sp.draw(ctx, name, 0, 0, k, k * sy, 0, inDoor ? s.shown : 1);
  ctx.restore();

  const top = def.top * K * SCALE;
  const hd = h.hold;
  if (hd && hd.t >= 0) {
    // the parcel just handed over, held up overhead (and turned about, if it isn't theirs)
    const up = easeOutBack(Math.min(1, hd.t / 0.25));
    const a = hd.t > 1.25 ? Math.max(0, (1.6 - hd.t) / 0.35) : 1;
    const shake = hd.wrong ? Math.sin(hd.t * 26) * 0.12 * Math.max(0, 1 - hd.t / 1.2) : 0;
    const hy = (def.hold ?? def.top) * K * SCALE;
    sp.draw(ctx, boxSprite(hd.size, hd.urgent, hd.cod), rx + (hd.wrong ? Math.sin(hd.t * 26) * 3 : 0), ry - lift - hy + 6 - up * 12, 0.85, 0.85, shake + rot, a);
  } else if (s.carry && (walking || s.act === 'bye') && pose !== 'back') {
    // hugging it on the way back in
    sp.draw(ctx, boxSprite(s.carry.size, s.carry.urgent, s.carry.cod), rx + face * 10, ry - lift - top * 0.18, 0.6, 0.6, rot);
  }
  if (s.mode === 'stand' && s.act === 'pay') {
    // the bill held out for the frog
    const bx = rx + face * 30, by = ry - top * 0.55 + Math.sin(t * 4) * 1.5;
    if (sp.isArt('bill')) sp.draw(ctx, 'bill', bx, by, 0.2, 0.2, face * 0.15);
    else {
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(face * 0.15);
      roundRect(ctx, -18, -10, 36, 20, 3);
      ctx.fillStyle = P.lilyLight;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }
  const r = h.react && h.react.t >= 0 ? h.react : null;
  if (s.mode === 'stand' && s.act === 'confused' && r && r.kind === 'confused' && r.t < 2) {
    const a = Math.min(1, r.t * 5) * (r.t > 1.6 ? (2 - r.t) / 0.4 : 1);
    ctx.save();
    ctx.globalAlpha = a;
    const bx = rx + face * (hd ? 40 : 20), by = ry - top - (hd ? 64 : 26);
    ellipse(ctx, bx, by, 20, 20);
    ctx.fillStyle = P.white;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, '?', bx, by + 1, 28, { bold: true });
    ctx.restore();
  }
}

/** Every sprite a set of houses needs, to load before the day starts. */
export function houseSprites(houses: House[]) {
  const out: string[] = [];
  for (const h of houses) {
    out.push(`house_${h.type}`, `door_${h.type}`, `avatar_${h.species}`);
    for (const p of POSES) out.push(`r_${h.species}_${p}`);
  }
  return out;
}
