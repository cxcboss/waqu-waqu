// Web entry: browser platform adapter + the shared game.
import { Game } from './game/game';
import { PlayScene } from './game/play';
import { HubScene } from './game/hub';
import { WebPlatform } from './platform/web';

const q = new URLSearchParams(location.search);
// Play statistics: ?tm=off keeps this device out of them for good (?tm=on lets it back in);
// nothing is collected on a local dev server or a preview build (/preview/, /preview-play/ …) unless asked with ?tm=on.
const tm = q.get('tm');
const dev = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname) || location.protocol === 'file:' || /\/preview[\w-]*\//.test(location.pathname);
const game = new Game(new WebPlatform(), { toggle: tm === 'on' || tm === 'off' ? tm : null, dev });
// ?day=N jumps straight into a day (handy for testing).
const day = Number(q.get('day'));
void game.start(() => (day >= 1 ? new PlayScene(game, day) : new HubScene(game)), day >= 1 ? { jump: day } : {});
(window as unknown as { __game: Game }).__game = game;
// the page's own splash gives way to the game's loading screen once that has drawn
requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('boot')?.remove()));
// keep downloaded art and sound on the device: the second visit (and a bad connection) skips the network
if ('serviceWorker' in navigator && location.protocol === 'https:' && !dev) window.addEventListener('load', () => void navigator.serviceWorker.register('sw.js').catch(() => undefined));
