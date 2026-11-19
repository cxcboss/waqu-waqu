// Web entry: browser platform adapter + the shared game.
import { DAYS, YEAR_END } from './game/config';
import type { AutoplayOptions } from './game/autopilot';
import { EndingScene } from './game/ending';
import { Game } from './game/game';
import { HqScene } from './game/hq';
import { PlayScene } from './game/play';
import { HubScene } from './game/hub';
import { UNLOCK_ALL, applyUnlockAll } from './game/unlock';
import { WebPlatform } from './platform/web';

declare const __AUTO_DEMO__: boolean;
const AUTO_DEMO = typeof __AUTO_DEMO__ !== 'undefined' && __AUTO_DEMO__;

const q = new URLSearchParams(location.search);
// Play statistics: ?tm=off keeps this device out of them for good (?tm=on lets it back in);
// nothing is collected on a local dev server or a preview build (/preview/, /preview-play/ …) unless asked with ?tm=on.
// Both demo builds (all-unlocked and auto-play) keep telemetry off unless it's asked for with ?tm=on.
const tm = q.get('tm');
const dev = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname) || location.protocol === 'file:' || /\/preview[\w-]*\//.test(location.pathname);
const controls = AUTO_DEMO && q.get('art') !== '1' ? document.getElementById('trial-tools') : null;
if (controls) controls.hidden = false;
const platform = new WebPlatform(controls);
const game = new Game(platform, { toggle: tm === 'on' || tm === 'off' ? tm : null, dev: dev || UNLOCK_ALL || AUTO_DEMO }, UNLOCK_ALL);
if (UNLOCK_ALL) {
  applyUnlockAll(game.save);
  game.writeSave();
  document.title = '蛙趣送包裹 · 试玩版';
}
// ?day=N jumps straight into a day (handy for testing): any day on a dev host or with ?tm=off,
// otherwise only one this device has already unlocked, so a link can't skip the route.
const n = Math.floor(Number(q.get('day')));
const asked = n >= 1 ? Math.min(n, DAYS.length) : null;
const day = asked !== null && (dev || tm === 'off' || asked <= game.save.day) ? asked
  : UNLOCK_ALL && q.get('day') === '0' ? 0 : null;
// ?art=1 on a dev server opens the art board (every piece of the code-drawn kit; &tod=night picks the hour)
if (dev && q.get('art') === '1') void import('./game/artboard').then((m) => game.start(() => new m.ArtboardScene(game, q.get('tod'))));
else void game.start(() => (day !== null ? new PlayScene(game, day) : new HubScene(game)), day !== null ? { jump: day } : {});
(window as unknown as { __game: Game }).__game = game;
if (controls) void import('./game/autopilot').then(({ CourierAutoplay, center, tap }) => {
  const menu = controls.querySelector<HTMLDetailsElement>('#trial-settings')!;
  const autoplay = controls.querySelector<HTMLInputElement>('#autoplay')!;
  const mistakes = controls.querySelector<HTMLInputElement>('#autoplay-mistakes')!;
  const options: AutoplayOptions = { speed: 'normal', mistakes: false };
  for (const speed of ['slowest', 'slow', 'normal', 'fast', 'fastest'] as const) {
    const radio = controls.querySelector<HTMLInputElement>(`input[value="${speed}"]`)!;
    radio.addEventListener('change', () => { if (radio.checked) options.speed = speed; });
  }
  mistakes.addEventListener('change', () => { options.mistakes = mistakes.checked; });
  let active = false;
  let nextDay = day ?? 1;
  let retries = 0;
  let play: PlayScene | null = null;
  let courier: InstanceType<typeof CourierAutoplay> | null = null;

  const setActive = (on: boolean) => {
    active = on;
    autoplay.checked = on;
    controls.dataset.autoplay = String(on);
    if (!on && play) {
      courier?.cancel(play);
      play = null;
      courier = null;
    }
  };
  setActive(q.get('auto') === '1');
  autoplay.addEventListener('change', () => {
    game.audio.unlock();
    game.audio.kick();
    if (!active && game.interactiveScene?.id === 'hub') {
      nextDay = 1;
      retries = 0;
    }
    setActive(autoplay.checked);
  });
  document.addEventListener('pointerdown', (e) => {
    if (menu.open && !menu.contains(e.target as Node)) menu.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !menu.open) return;
    menu.open = false;
    menu.querySelector('summary')?.focus();
    e.stopPropagation();
  }, true);
  document.getElementById('game')?.addEventListener('pointerdown', () => {
    if (active) setActive(false);
  }, true);

  const begin = () => game.go(new PlayScene(game, Math.min(nextDay, game.save.day)), true);
  const frame = () => {
    requestAnimationFrame(frame);
    if (autoplay.disabled && game.ready) autoplay.disabled = false;
    if (!active || document.hidden) return;
    const scene = game.interactiveScene;
    if (scene instanceof PlayScene) {
      if (scene !== play) {
        play = scene;
        courier = new CourierAutoplay(retries, scene.day, options);
        nextDay = play.day;
      }
      courier?.update(scene);
    } else if (scene instanceof HqScene) {
      const result = scene.autoplayReport;
      if (!result) return;
      retries = result.pass ? 0 : retries + 1;
      nextDay = !result.pass ? result.day : result.day === DAYS.length ? 0 : result.day + 1;
      if (result.button) tap(scene, center(result.button));
      else begin();
    } else if (scene instanceof EndingScene) {
      nextDay = YEAR_END + 1;
      const p = scene.autoplayPage;
      if (p) tap(scene, p);
    } else if (scene) begin();
  };
  requestAnimationFrame(frame);
});
// the page's own splash gives way to the game's loading screen once that has drawn
requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('boot')?.remove()));
// Keep downloaded art and sound on the device. Bumping the cache name in sw.js clears an older
// deploy; reload once when a device that already had a worker picks up the new one.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !dev) {
  const hadWorker = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => void navigator.serviceWorker.register('sw.js').catch(() => undefined));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadWorker) return;
    reloaded = true;
    location.reload();
  });
}
