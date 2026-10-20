// Web entry: browser platform adapter + the shared game.
import { Game } from './game/game';
import { PlayScene } from './game/play';
import { TitleScene } from './game/title';
import { WebPlatform } from './platform/web';

const game = new Game(new WebPlatform());
// ?day=N jumps straight into a day (handy for testing).
const day = Number(new URLSearchParams(location.search).get('day'));
void game.start(() => (day >= 1 ? new PlayScene(game, day) : new TitleScene(game)));
(window as unknown as { __game: Game }).__game = game;
