// Little stories for the river news (河湾动态): what was in the parcels, mix-ups, soaked boxes.
// Keyed by species, with a fallback for residents who don't have their own lines yet.
import { pick } from '../engine/math';

/** What a resident found in a parcel. `{who}` is replaced with their name. */
const OPENED: Record<string, string[]> = {
  duck: [
    '{who}拆开包裹：一罐新茶。她说下次请你进屋喝一杯。',
    '{who}收到一副防水老花镜，终于能在雨天看报纸了。',
    '{who}的包裹里是一盒桂花糕，香味飘了半条河。',
    '{who}买了新茶壶盖，旧的那个被大风刮跑了。',
    '{who}收到一本《鸭子的一百种坐姿》，看得津津有味。',
  ],
  rabbit: [
    '{who}拆开包裹，是一条白色头纱！婚礼越来越近了。',
    '{who}的包裹里是一大袋胡萝卜干，说是婚礼备的零食。',
    '{who}收到印好的请柬，说也给你留了一张。',
    '{who}买的跳绳到了，一口气跳了三百下。',
    '{who}收到一面小镜子，照了整整一下午。',
  ],
  hedgehog: [
    '{who}又收到一包气球。他说再攒几个就能飞起来了。',
    '{who}的包裹是一个打气筒……他到底想飞去哪儿？',
    '{who}买了一双防扎手套，说是送给邻居们的。',
    '{who}收到一本《飞行入门》，翻到第二页就睡着了。',
    '{who}的新风筝到了，可惜今天没有风。',
  ],
};
const OPENED_ANY = [
  '{who}拆开包裹，正是想要的东西，开心得在门口转了一圈。',
  '{who}收到包裹，说这是这个月最开心的一件事。',
  '{who}拆包裹拆了半天，里面还套着一个更小的包裹。',
];

/** Things that end up at the wrong door. */
const THINGS = ['一罐茶叶', '一条头纱', '一包气球', '一本菜谱', '一双雨靴', '一盒饼干', '一个闹钟', '一顶草帽'];
const MIXUPS = [
  '{who}收到了别人的包裹，里面是{thing}。「我没买过这个呀……」',
  '{who}拆开一看是{thing}，愣了一会儿，说先替邻居收着。',
  '{who}对着{thing}研究了半天，还是没想明白这是谁的。',
];
const SOAKED = [
  '{who}的包裹泡了水，{thing}湿透了。{who}说没关系（其实很心疼）。',
  '{who}等了一天的包裹掉进了河里，听说鱼群收下了{thing}。',
];

const fill = (s: string, who: string, thing = '') => s.split('{who}').join(who).split('{thing}').join(thing);

export function openedLine(who: string, species: string, r: () => number) {
  return fill(pick(OPENED[species] ?? OPENED_ANY, r), who);
}

export function mixupLine(who: string, r: () => number) {
  return fill(pick(MIXUPS, r), who, pick(THINGS, r));
}

export function soakedLine(who: string, r: () => number) {
  return fill(pick(SOAKED, r), who, pick(THINGS, r));
}
