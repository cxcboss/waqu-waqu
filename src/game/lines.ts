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

/**
 * The old turtle's letters to 阿灰, the friend who went to sea when they were young: written now and
 * then over the years and never sent, kept in a tin under the bridge until the spring flood washed them
 * down the river. One lies on each day's river, days 1–30 (levelfeats.ts puts it on a pad off to the
 * side); they're read in the mailbox at home. A save keeps the numbers of the ones found (1–30), so the
 * words can change.
 */
export const STORY: { title: string; text: string }[] = [
  { title: '柳湾的船', text: '阿灰：你走的那天，柳湾的柳树刚冒芽。我在岸边站到天黑，船早就看不见了。我决定给你写信，等知道你在哪儿，再一起寄给你。' },
  { title: '学跳荷叶', text: '阿灰：今天我学会了从这片荷叶跳到那片荷叶，只掉进水里三次。你要是在，一定笑我笨。' },
  { title: '慢邮差', text: '阿灰：河湾来了个邮差，是只小蜗牛，一封信要送半个月。我的信先攒着，不交给他。' },
  { title: '柳絮', text: '阿灰：柳絮飞得满河都是，像下雪。你说海边的雪是咸的，是真的吗？' },
  { title: '小书架', text: '阿灰：我在桥洞里搭了个小书架，最下面一层放给你的信。已经有五封了。' },
  { title: '憋气比赛', text: '阿灰：荷花开满了一整塘。小时候我们在这儿比憋气，你总赢——你嘴巴里偷偷藏了一大口气，别以为我不知道。' },
  { title: '乌龟船', text: '阿灰：我驮着兔子一家过了河。原来乌龟背也能当船，你走之前我怎么没想到？' },
  { title: '青瓷碗', text: '阿灰：兔家办喜事，我送了一只青瓷碗，一路上走得特别慢，生怕碰坏了。慢，原来也是一种本事。' },
  { title: '冰棍', text: '阿灰：太热了，冰棍还没到嘴边就化了。你在船上，有没有冰棍吃？' },
  { title: '快递站', text: '阿灰：猫头鹰在河湾开了家快递站。我问它能不能把信送到海上，它眨了眨眼睛，没说话。' },
  { title: '急流', text: '阿灰：雨季来了，峡谷里的水急得吓人，我抱着石头才没被冲走。你那边的浪，是不是比这还大？' },
  { title: '水坝', text: '阿灰：河狸师傅修了一座水坝，开闸的时候哗啦啦的，像你打呼噜。' },
  { title: '雨天', text: '阿灰：下了一整天雨，石头滑得站不住。我躲在桥洞里给你写信，墨水被雨点打花了好几个字。' },
  { title: '漩涡', text: '阿灰：漩涡湾里有几片荷叶一直在转，转啊转，就像我想你的时候。' },
  { title: '打雷', text: '阿灰：昨夜打雷，整条河都亮了一下。那一下我好像看见了你的船，可惜只是一截木头。' },
  { title: '枫叶', text: '阿灰：枫叶红了，落在水上像一只只小船。我挑了最好看的一片，夹在这封信里。' },
  { title: '帽子', text: '阿灰：起风了，我的帽子被吹到了对岸。要是你在，一扇翅膀就帮我捡回来了。' },
  { title: '唠叨', text: '阿灰：猫头鹰今年亲自跟车，嘴里一直念"下一家、下一家"。它比以前唠叨多了。我们都老了。' },
  { title: '萤火虫', text: '阿灰：萤火虫照着回家的路。你走的那晚也有萤火虫，你说它们是天上掉下来的星星。' },
  { title: '一沓信', text: '阿灰：河湾的包裹多得堆成了山。我没有包裹要寄，只有这一沓信，越攒越厚。' },
  { title: '浮冰', text: '阿灰：下雪了。河上漂着一块块浮冰，我站在上面转了三圈，头都晕了。' },
  { title: '薄冰', text: '阿灰：薄冰一踩就咔嚓响，我走得小心翼翼。上了年纪，做什么都小心翼翼的。' },
  { title: '安静', text: '阿灰：熊宝宝在隔壁冬眠，我连咳嗽都捂着嘴。今年冬天真安静，安静得能听见雪落下来。' },
  { title: '两杯茶', text: '阿灰：我煮了一壶热茶，倒了两杯。一杯给我，一杯给你。你那杯放凉了，我也喝了。' },
  { title: '暴风雪', text: '阿灰：暴风雪，什么都看不见。我数着信，一封、两封……二十五封。我的字越写越歪了。' },
  { title: '栈桥', text: '阿灰：港口修好了，栈桥一直伸到河中间。我常坐在栈桥尽头，看每一艘进港的船。' },
  { title: '起重机', text: '阿灰：码头的起重机把一船船货吊上岸。要是能把你也吊回来就好了。' },
  { title: '海鸥', text: '阿灰：海鸥从海边飞来，我问它认不认识一只叫阿灰的鹈鹕。它叼走了我的面包，什么也没说。' },
  { title: '老水手', text: '阿灰：听集市上的人说，上游住着一位退休的老水手，爱集邮，大嘴巴。会是你吗？' },
  { title: '除夕', text: '阿灰：除夕了，烟花把整条河都照亮。我老了，游不动去上游那么远的路。要是有谁捡到这些信，请替我把第一封送给你。' },
];

/** The first letter, the one written the day 阿灰 left: 第0号快递 takes it up the river to him. */
export const FIRST_LETTER = '阿灰：你今天就要走了。我嘴笨，说不出口，只好写下来——河湾永远是你的家，我会一直在桥洞等你。到了海边，记得给我寄一张有大船的邮票。';

/** A letter's words, or '' for an id that isn't a letter. */
export const letterText = (id: string) => LETTERS.find((l) => l.id === id)?.text ?? '';

/** A letter as a save holds it (its id, or its words in saves from before ids) to its id; null if it's no letter we know. */
export const letterId = (v: string) => LETTERS.find((l) => l.id === v || l.text === v)?.id ?? null;
