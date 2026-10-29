// WeChat mini game entry: the wx platform adapter + the shared game. Built by scripts/build_wx.py (npm run build:wx).
import { Game } from './game/game';
import { HubScene } from './game/hub';
import { WxPlatform } from './platform/wx';

/** Whether play statistics are sent (npm run build:wx -- --tm): only once their server is a 服务器域名 of the mini game. */
declare const __WX_TM__: boolean;

declare const wx: { getLaunchOptionsSync?: () => { scene?: number } };
declare const GameGlobal: Record<string, unknown>;

const game = new Game(new WxPlatform(), { dev: !__WX_TM__ });
void game.start(() => new HubScene(game), { scene: wx.getLaunchOptionsSync?.().scene ?? 0 });
// for the console in WeChat DevTools
GameGlobal.__game = game;
