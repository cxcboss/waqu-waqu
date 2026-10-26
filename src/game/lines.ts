// What the frog mutters on the way home after an early finish. One is picked at random each time.
export const OFFWORK_LINES: string[] = [
  // 感慨
  '今天的河水，好像比昨天温柔一点。',
  '每个包裹里，都装着别人的一点期待。',
  '跳了一整天，腿已经不是自己的了。',
  '夕阳把荷叶照成了金色，真好看。',
  '原来送快递，也是在送一份心意。',
  '鸭太太的茶，闻起来比我的晚饭还香。',
  '平凡的一天，也值得好好收尾。',
  '风吹过芦苇，像在给我鼓掌。',
  // 吐槽
  '猫头鹰经理今天又要念叨了吧……',
  '谁家的包裹这么沉，装的是石头吗？',
  '运输车能不能开慢点，我又不是跳远运动员。',
  '掉了几次水？不重要，反正洗过澡了。',
  '工资还没有一片荷叶大。',
  '为什么房子都建在水上，地上不香吗？',
  '刺猬大叔签收的时候，扎到我了。',
  '加班？不存在的，青蛙准点下班。',
  '今天的步数：零。跳数：数不清。',
  '下辈子想当一片荷叶，躺着就行。',
  // 憧憬
  '攒够了钱，就去买一顶新帽子。',
  '明天一定能一次都不落水！',
  '总有一天，我要开上自己的运输车。',
  '听说海边也有快递站，好想去看看。',
  '等我当上经理，第一件事就是全员带薪午睡。',
  '明天也要元气满满地跳！',
  '想在荷叶上开一家小小的茶馆。',
  '下个月争取拿到“最佳飞跃奖”。',
  // 莫名其妙
  '刚刚那条鱼，是不是冲我眨眼了？',
  '如果月亮掉进河里，算不算漏件？',
  '我好像忘了什么……算了，大概是蚊子的事。',
  '晚饭吃什么？吃什么？呱。',
  '突然很想知道，茶壶里住着的是不是另一只茶壶。',
  '今天的云长得像一个包裹。',
  '呱呱呱呱呱。（翻译：下班真好）',
  '有只蜻蜓说要给我寄明信片，地址写的是“河上”。',
  '今晚决定和自己的影子聊聊天。',
  '帽子里好像住进了一只小螃蟹。',
];

// What the driver says when kicking a frog that has sat on the truck too long. Funny, sharp or
// encouraging, short enough to read at a glance; a day never uses the same one twice.
export const KICK_LINES: string[] = [
  '车上不是你家，下去干活！',
  '再赖着，工资我替你领了。',
  '包裹不会自己长腿跑！',
  '去吧！荷叶在等你。',
  '下去！我相信你能行！',
  '坐车不收钱，偷懒要收。',
  '这车厢快被你坐出坑了。',
  '你是快递员，不是乘客。',
  '再不动，经理要来了哦。',
  '起飞！别谢我。',
  '蛙生苦短，赶紧开跳。',
  '嫌河水凉？跳起来就不凉了。',
  '我数到三……算了，直接踢。',
  '你的腿是装饰品吗？',
  '住户等到花都谢了！',
  '去送件！回来请你喝汽水。',
  '加油！你跳得比昨天好。',
  '车厢禁止睡觉！',
  '赖车上的蛙，没有晚饭。',
  '帮你一把，不用客气。',
  '再坐下去要收停车费了。',
  '你行的，大胆跳！',
  '光看不跳，包裹会哭的。',
  '这一脚，叫爱的鼓励。',
  '别发呆，河水可不等蛙。',
  '冲呀！今天的明星就是你。',
  '摸鱼去河里摸，别在车上。',
  '走你——！',
  '跳错了也比不跳强！',
  '我开车，你送件，分工明确。',
  '怕水？那更要快点跳过去。',
  '去吧，送完早点下班！',
];

// The driver hurrying the frog back as the day runs out. A day never uses the same one twice.
export const HURRY_LINES: string[] = [
  '快回来！要收车啦！',
  '嘀嘀！末班车不等蛙！',
  '还在外面晃？要下班了！',
  '再不回来，我就套绳子了！',
  '收工了收工了，快上车！',
  '天要黑了，快回车上！',
  '我数到五，不回来就拽你！',
  '下班不等人，快跳回来！',
  '车要开了，别在外面玩！',
  '喂——！回来吃晚饭！',
  '再晚一步，就要加班啦！',
  '赶紧的，猫头鹰在等打卡！',
  '快快快，车厢给你留着！',
  '别磨蹭，我饿了！',
  '最后几秒，冲回来！',
  '迟到要扣工资哦！',
  '跳回来！就差你了！',
  '天黑河里有怪兽，快回来！',
  '还不回来？绳子准备好了。',
  '嘀——！集合啦！',
  '工作结束，回车上！',
  '要开车咯，抓紧时间！',
  '回来！今天表现不错！',
  '别恋战，下班要紧！',
  '快！我已经发动引擎了！',
  '你是想在河上过夜吗？',
  '回车上！明天再接着跳！',
  '最后一趟车，别错过！',
  '我按喇叭你听见没？',
  '快回来，给你留了虫子！',
  '时间到啦，速速归队！',
];

/** Deals lines from `pool` without repeats until they run out (then starts over). */
export function dealLine(pool: string[], used: Set<string>) {
  let left = pool.filter((l) => !used.has(l));
  if (!left.length) {
    used.clear();
    left = pool;
  }
  const l = left[Math.floor(Math.random() * left.length)];
  used.add(l);
  return l;
}

/**
 * The lost letters on the road behind the truck. A save keeps a letter's id, never its words, so a
 * letter can be reworded (or new ones added) without anyone losing the ones they found.
 */
export const LETTERS: { id: string; text: string }[] = [
  { id: 'turtle', text: '“给河湾的快递员：谢谢你每天都来。——住在桥洞的老乌龟”' },
  { id: 'owl', text: '“如果你捡到这封信，说明你很会偷懒。——猫头鹰经理”' },
  { id: 'heron', text: '“明天的荷叶会更大一点。——一只路过的鹭”' },
];

/** A letter's words, or '' for an id that isn't a letter. */
export const letterText = (id: string) => LETTERS.find((l) => l.id === id)?.text ?? '';

/** A letter as a save holds it (its id, or its words in saves from before ids) to its id; null if it's no letter we know. */
export const letterId = (v: string) => LETTERS.find((l) => l.id === v || l.text === v)?.id ?? null;
