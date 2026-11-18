// Douyin (抖音) mini game entry: the tt platform adapter + the shared game. Built by scripts/build_tt.py (npm run build:tt).
import { Game } from './game/game';
import { HubScene } from './game/hub';
import { TtPlatform } from './platform/tt';

/** Whether play statistics are sent (npm run build:tt -- --tm): only once their server is a 服务器域名 of the mini game. */
declare const __TT_TM__: boolean;

declare const GameGlobal: Record<string, unknown>;
declare const tt: { getLaunchOptionsSync?: () => { scene?: string } };

const game = new Game(new TtPlatform(), { dev: !__TT_TM__ });
void game.start(() => new HubScene(game), { scene: tt.getLaunchOptionsSync?.().scene ?? '' });
// for the console in Douyin DevTools
GameGlobal.__game = game;
