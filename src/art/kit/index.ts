// 河湾手账 kit: everything for drawing the game's scenery and UI in code, in the same storybook style as
// the painted characters (ink outlines in P.ink, colored-pencil shading, paper grain, warm palette).
// Pure Canvas 2D, so it works the same in a browser and in the WeChat mini game.
export * from './canvas';
export * from './color';
export * from './ink';
export * from './paper';
export * from './tod';
export * from './scenery';
export { icon, glyph, ICON_NAMES, type IconName, type IconOpts } from './icons';
export { medal, MEDAL_IDS } from './medal';
export { frame, frameOpening, FRAME_KINDS, type FrameKind } from './frame';
export * from './widgets';
