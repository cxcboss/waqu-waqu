#!/usr/bin/env python3
"""Pulls the test build's play statistics from Supabase and prints a report.

    python3 scripts/stats.py                 # everything
    python3 scripts/stats.py --since 2026-10-22 --build 1a2b3c4
    python3 scripts/stats.py --dump rows.json   # also save the raw rows for digging further

The project URL and publishable key are read from src/engine/telemetry.ts (or WAQU_TM_URL /
WAQU_TM_KEY). Events are described in docs/telemetry.md.
"""
import argparse
import json
import os
import re
import statistics
import sys
import urllib.parse
import urllib.request
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def config():
    url, key = os.environ.get('WAQU_TM_URL'), os.environ.get('WAQU_TM_KEY')
    if not (url and key):
        src = open(os.path.join(ROOT, 'src/engine/telemetry.ts'), encoding='utf-8').read()
        url = url or re.search(r"const ENDPOINT: string = '([^']*)'", src).group(1)
        key = key or re.search(r"const KEY: string = '([^']*)'", src).group(1)
    if not (url and key):
        sys.exit('No Supabase project configured in src/engine/telemetry.ts yet.')
    return url.rstrip('/'), key


def fetch(url, key, since=None):
    headers = {'apikey': key}
    if key.startswith('eyJ'):
        headers['Authorization'] = 'Bearer ' + key
    rows, offset = [], 0
    while True:
        q = {'select': '*', 'order': 'at.asc,id.asc', 'limit': '1000', 'offset': str(offset)}
        if since:
            q['at'] = 'gte.' + since
        req = urllib.request.Request(f'{url}/rest/v1/events?{urllib.parse.urlencode(q)}', headers=headers)
        with urllib.request.urlopen(req, timeout=60) as r:
            page = json.load(r)
        rows += page
        if len(page) < 1000:
            return rows
        offset += 1000


def med(xs):
    xs = [x for x in xs if x is not None]
    return round(statistics.median(xs), 1) if xs else '-'


def p90(xs):
    xs = sorted(x for x in xs if x is not None)
    return round(xs[min(len(xs) - 1, int(len(xs) * 0.9))], 1) if xs else '-'


def pct(a, b):
    return f'{a}/{b} ({round(100 * a / b)}%)' if b else f'{a}/0'


def top(counter, n=8):
    return ', '.join(f'{k}×{v}' for k, v in counter.most_common(n)) or '-'


def report(rows):
    rows.sort(key=lambda r: (r['pid'], r['sid'], r['ts'] or 0, int(r['id'].rsplit('-', 1)[1])))
    by_ev = defaultdict(list)
    for r in rows:
        by_ev[r['ev']].append(r)
    players = {r['pid'] for r in rows}
    sessions = {r['sid'] for r in rows}
    runs = defaultdict(list)  # (sid, run) -> rows
    for r in rows:
        if r['run']:
            runs[(r['sid'], r['run'])].append(r)
    out = []
    say = out.append

    say('# 蛙趣蛙趣 · 试玩数据')
    ats = [r.get('at') or '' for r in rows]
    say(f"{len(rows)} 条事件 · {len(players)} 位玩家 · {len(sessions)} 次打开 · {len(runs)} 局 · {min(ats)[:16]} ～ {max(ats)[:16]} UTC")
    say('版本：' + top(Counter(r['v'] for r in by_ev['open'])))

    say('\n## 设备和加载')
    opens = [r['d'] for r in by_ev['open']]
    say('系统：' + top(Counter(d.get('os') for d in opens)) + ' · 浏览器/App：' + top(Counter(d.get('browser') for d in opens)))
    say('屏幕：' + top(Counter(f"{d.get('w')}x{d.get('h')}" for d in opens), 6))
    loads = [r['d']['ms'] / 1000 for r in by_ev['loaded']]
    say(f'加载耗时 中位 {med(loads)} 秒 · 90% {p90(loads)} 秒')
    loaded = {r['sid'] for r in by_ev['loaded']}
    gave_up = {r['sid'] for r in by_ev['hide'] if r['d'].get('scene') == 'loading'} - loaded
    say(f'加载中就离开：{pct(len(gave_up), len(sessions))}')
    fps = [r['d'].get('fps') for r in by_ev['run_end'] + by_ev['run_snap'] if r['d'].get('fps')]
    say(f'帧率 中位 {med(fps)} · 最低10% {sorted(fps)[len(fps) // 10] if fps else "-"} · 卡顿帧/局 中位 {med([r["d"].get("slow") for r in by_ev["run_end"]])}')
    if by_ev['error']:
        say('报错：')
        for (msg, where), n in Counter((r['d'].get('msg'), (r['d'].get('where') or '')[:80]) for r in by_ev['error']).most_common(10):
            say(f'  - {n}× {msg} @ {where}')

    say('\n## 每位玩家走到哪')
    reached = defaultdict(lambda: {'start': set(), 'end': set(), 'pass': set()})
    for r in by_ev['run_start']:
        reached[r['day']]['start'].add(r['pid'])
    for r in by_ev['run_end']:
        if r['d'].get('how') in ('done', 'off', 'thrown'):
            reached[r['day']]['end'].add(r['pid'])
    for r in by_ev['hq']:
        if r['d'].get('pass'):
            reached[r['day']]['pass'].add(r['pid'])
    say(f'打开游戏 {len(players)} 人')
    for day in sorted(k for k in reached if k):
        x = reached[day]
        say(f"第{day}天：开始 {len(x['start'])} 人 · 跑完 {len(x['end'])} 人 · 通过 {len(x['pass'])} 人")

    say('\n## 每天的结果（按局）')
    for day in sorted({k for (_, _), v in runs.items() for k in [v[0]['day']] if k}):
        rs = [v for v in runs.values() if v[0]['day'] == day]
        ends = []
        for v in rs:
            e = [r for r in v if r['ev'] == 'run_end']
            s = [r for r in v if r['ev'] == 'run_snap']
            ends.append(e[-1]['d'] if e else dict(s[-1]['d'], how='abandoned') if s else {'how': 'abandoned'})
        hows = Counter(e['how'] for e in ends)
        full = [e for e in ends if 'total' in e]
        say(f"第{day}天 {len(rs)} 局：" + top(hows) + '（off=送完提前下班 done=跑到终点 thrown=被甩出 restart/quit=暂停菜单 abandoned=中途关掉）')
        if full:
            say(f"  送对 {med([e['delivered'] / max(1, e['total']) * 100 for e in full])}% · 送错/局 {med([e['wrong'] for e in full])} · 泡水/局 {med([e['wet'] for e in full])} · 漏送/局 {med([e['missed'] for e in full])}"
                f" · 落水/局 {med([e['falls'] for e in full])} · 跳/局 {med([e['jumps'] for e in full])} · 用时 {med([e['real'] for e in full])} 秒")
        grades = Counter(r['d']['grade'] for r in by_ev['hq'] if r['day'] == day)
        if grades:
            say('  评级：' + top(grades))
        fresh = [r['d']['stamps'] for r in by_ev['hq'] if r['day'] == day]
        if fresh:
            say('  好评章（准时/漂亮/挑战）拿到率：' + ' / '.join(f"{round(100 * sum(1 for s in fresh if s[i]) / len(fresh))}%" for i in range(3)))

    say('\n## 第1天新手引导')
    steps = defaultdict(list)
    for r in by_ev['step']:
        if r['day'] == 1:
            steps[r['d']['from']].append(r['d']['sec'])
    for k in ['intro', 'pick', 'aim', 'go', 'deliver', 'refill']:
        if steps.get(k):
            say(f'  {k}: 中位 {med(steps[k])} 秒 · 90% {p90(steps[k])} 秒 · {len(steps[k])} 次')
    say('乱点（等着做别的事时点了没用的地方）：' + top(Counter((r['day'], r['d']['where']) for r in by_ev['miss'])))
    taps = by_ev['tap']
    say(f"点了一下没拉（想跳却只是点）：{len(taps)} 次，点在：" + top(Counter(r['d'].get('under') for r in taps)) + ' · 当时步骤：' + top(Counter(r['d'].get('step') for r in taps)))
    first = {}
    for r in by_ev['jump']:
        first.setdefault((r['sid'], r['run']), r)
    fj = [r for r in first.values() if r['day'] == 1]
    if fj:
        say('第1天第一跳落在：' + top(Counter(r['d']['on'] for r in fj)) + f" · 跳中引导荷叶 {pct(sum(1 for r in fj if r['d'].get('target')), len(fj))}")

    say('\n## 跳跃')
    for day in sorted({r['day'] for r in by_ev['jump']}):
        js = [r['d'] for r in by_ev['jump'] if r['day'] == day]
        water = [j for j in js if j['on'] == 'water']
        say(f"第{day}天 {len(js)} 跳：落点 " + top(Counter(j['on'] for j in js)) + f" · 落水 {pct(len(water), len(js))}")
        if water:
            short = sum(1 for j in water if j.get('short'))
            say(f"  落水的跳：跳近了 {short} · 跳远了 {len(water) - short} · 离最近落脚点 中位 {med([j.get('near') for j in water])} · 力度 中位 {med([j['pow'] for j in water])} · 背重 中位 {med([j['w'] for j in water])}")
        say(f"  蓄力时长 中位 {med([j['held'] for j in js])} 秒 · 力度 中位 {med([j['pow'] for j in js])} · 往回跳（手指往上拉） {pct(sum(1 for j in js if j['dy'] < -20), len(js))}")
    say(f"脚累了（按太久）：{len(by_ev['tired'])} 次 · 每局 " + top(Counter(r['day'] for r in by_ev['tired'])))

    say('\n## 落水和爬岸')
    sw = [r['d'] for r in by_ev['swim_out']]
    say(f"落水 {len(by_ev['fall'])} 次 · 上岸 {len(sw)} 次，水里待 中位 {med([s['sec'] for s in sw])} 秒 · 90% {p90([s['sec'] for s in sw])} 秒 · 划水 中位 {med([s['strokes'] for s in sw])}")
    cl = [r['d'] for r in by_ev['climb']]
    if cl:
        say(f"爬岸时机：成功 {pct(sum(1 for c in cl if c['ok']), len(cl))}；按背重：" + ', '.join(
            f"重{w}: {pct(sum(1 for c in cl if c['w'] == w and c['ok']), sum(1 for c in cl if c['w'] == w))}" for w in sorted({c['w'] for c in cl})))
        # a tap right after grabbing is a swim stroke still landing, not a look at the gauge
        quick = [c for c in cl if c['wait'] < 0.6]
        say(f"  扒住后不到 0.6 秒就点（多半是游泳连点停不下来）：{pct(len(quick), len(cl))}，其中成功 {pct(sum(1 for c in quick if c['ok']), len(quick))}"
            f" · 等过 0.6 秒再点的成功 {pct(sum(1 for c in cl if c['wait'] >= 0.6 and c['ok']), len(cl) - len(quick))}")
    # counters only grow within a run, so its last summary (end or snapshot) holds the total
    last = {}
    for r in by_ev['run_snap'] + by_ev['run_end']:
        k = (r['sid'], r['run'])
        last[k] = max(last.get(k, 0), r['d'].get('climbEarly', 0))
    early = sum(last.values())
    if early:
        say(f"  扒住后 0.3 秒内被忽略的点击（新版才有）：{early}")
    say(f"捞包裹：{len(by_ev['rescue'])}（" + top(Counter(r['d']['how'] for r in by_ev['rescue'])) + f"）· 沉了 {len(by_ev['sunk'])} · 冲走 {sum(r['d'].get('gone', 0) for r in by_ev['fall'])}")
    say('落水时屏幕位置(0顶1底) 中位 ' + str(med([r['d'].get('fy') for r in by_ev['fall']])))
    new = [s for s in sw if 'gauges' in s]
    if new:
        say(f"  第四轮游泳：跳出指针出现 中位 {med([s['gauges'] for s in new])} 次/次落水 · 第一次蹬腿在落水后 中位 {med([s['wheel'] for s in new if s.get('wheel') is not None])} 秒"
            f" · 一下没蹬就上岸 {pct(sum(1 for s in new if s.get('wheel') is None), len(new))} · 出水到：" + top(Counter(s['to'] for s in new)))

    say('\n## 送件')
    dl = [r['d'] for r in by_ev['deliver']]
    wrong = [d for d in dl if not d['ok']]
    say(f"送件 {len(dl)} 次，送错 {len(wrong)}：其中正确的包裹其实就在包里（点错卡片）{sum(1 for d in wrong if d.get('hadRight'))} · 认错房子 {sum(1 for d in wrong if not d.get('hadRight'))}")
    say(f"背包满了还点 {len(by_ev['bag_full'])} 次 · 放回车上 {len(by_ev['put_back'])} 次 · 漏送 {len(by_ev['missed'])}（在包里没送到 {sum(1 for r in by_ev['missed'] if r['d'].get('inBag'))}）· 加急超时 {len(by_ev['urgent_late'])}")
    cod = [r['d'] for r in by_ev['cod']]
    if cod:
        say(f"到付找零：对 {pct(sum(1 for c in cod if c['ok']), len(cod))} · 想了 中位 {med([c['sec'] for c in cod])} 秒 · 错的选成了价格本身 {sum(1 for c in cod if not c['ok'] and c['pick'] == c['price'])} 次")

    say('\n## 危险和路面')
    say(f"进红线区 {len(by_ev['warn'])} 次 · 被甩出 {len(by_ev['thrown'])} 次（当时 " + top(Counter(f"{r['d']['state']}/{r['d'].get('on')}" for r in by_ev['thrown'])) + '）')
    say(f"跑太前车队加速 {len(by_ev['rush'])} 次 · 落到路上 " + top(Counter(r['d']['spot'] for r in by_ev['road'])) + f" · 尾气 {len(by_ev['exhaust'])} · 送完被拽回 {len(by_ev['yank'])} · 找到彩蛋信 {len(by_ev['egg'])}")

    say('\n## 司机、拽回和踢下车')
    say('司机喊话：' + top(Counter(r['d']['kind'] for r in by_ev['driver_say'])) + '（hurry=快到站 call5=送完倒数剩5秒 arrive=到站 idle_warn=催下车 kick=踢下车）')
    say(f"到站前被催 {len(by_ev['hurry'])} 次 · 到站 {len(by_ev['route_end'])} 次 · 被拽回 " + top(Counter(r['d'].get('why') for r in by_ev['yank']))
        + f" · 拽回到落车 中位 {med([r['d']['sec'] for r in by_ev['haul_land']])} 秒")
    kicked = by_ev['kicked']
    warned = [r for r in by_ev['driver_say'] if r['d']['kind'] == 'idle_warn']
    say(f"在车上发呆被催 {len(warned)} 次 · 被踢下车 {len(kicked)} 次（催了没动的 {pct(len(kicked), len(warned))}）· 踢的距离 中位 {med([r['d']['d'] for r in kicked])}")

    say('\n## 居民和房子')
    dl4 = [d for d in dl if 'house' in d]
    if dl4:
        bad = Counter(d['res'] for d in dl4 if not d['ok'])
        say(f"送件 {len(dl4)} 次（新版）· 送错最多的居民：" + (top(bad) if bad else '无') + ' · 房型出现：' + top(Counter(d['house'] for d in dl4), 6))
    else:
        say('还没有新版（带居民和房型）的送件数据')

    say('\n## 提示出现次数（越多越说明这里容易出错）')
    say(top(Counter(r['d']['key'] for r in by_ev['hint']), 16))
    idle = [r['d'] for r in by_ev['idle']]
    say(f"发呆 ≥8 秒：{len(idle)} 次，中位 {med([i['sec'] for i in idle])} 秒，当时站在：" + top(Counter(i.get('on') or i.get('state') for i in idle)))
    say(f"暂停 {len(by_ev['pause'])} 次 · 菜单：" + top(Counter(r['d']['id'] for r in by_ev['menu'])))

    say('\n## 中途离开的局（最后在干什么）')
    for v in runs.values():
        if any(r['ev'] == 'run_end' for r in v):
            continue
        last = [r for r in v if r['ev'] not in ('run_snap', 'pause', 'hide', 'show')]
        tail = ' → '.join(r['ev'] for r in last[-5:])
        say(f"  第{v[0]['day']}天 进度 {last[-1]['d'].get('p') if last else '-'} · {round(last[-1]['t'] or 0) if last else 0} 秒：{tail}")

    say('\n## 总部')
    say('结算后点：' + top(Counter(r['d']['id'] + ('' if r['d'].get('open', True) else '(未解锁)') for r in by_ev['hq_btn'])))
    say(f"看大图 {len(by_ev['photo'])} 次 · 保存 " + top(Counter(r['d']['res'] for r in by_ev['photo_save'])))
    say(f"收进相册 {sum(1 for r in by_ev['photo_keep'] if r['d'].get('on'))} 次 · 取消 {sum(1 for r in by_ev['photo_keep'] if not r['d'].get('on'))} 次")

    say('\n## 主页、总部大厅、家和福利社')
    say(f"进主页 {len(by_ev['hub'])} 次 · 去哪：" + top(Counter(r['d']['to'] for r in by_ev['hub_go'])) + f" · 看工牌 {len(by_ev['profile'])} · 改名 {len(by_ev['rename'])}")
    say(f"总部大厅 {len(by_ev['hall'])} 次 · 分页：" + top(Counter(r['d']['tab'] for r in by_ev['hall_tab'])) + f" · 看相册 {len(by_ev['album_view'])} · 移出相册 {len(by_ev['album_del'])}")
    say(f"回家 {len(by_ev['home'])} 次 · 打开：" + top(Counter(r['d']['what'] for r in by_ev['home_open'])) + f" · 挂照片 {len(by_ev['photo_hang'])} · 换装 " + top(Counter(f"{r['d']['slot']}:{r['d']['id']}" for r in by_ev['wear'])))
    buys = [r['d'] for r in by_ev['shop_buy']]
    say(f"福利社 {len(by_ev['shop'])} 次 · 买了 {len(buys)} 件，花 {sum(b.get('price') or 0 for b in buys)} 金币：" + top(Counter(b['what'] for b in buys), 10))
    say('成就：' + top(Counter(r['d']['id'] for r in by_ev['ach']), 10))
    gear = [r['d']['gear'] for r in by_ev['run_start'] if r['d'].get('gear')]
    if gear:
        say('开局时的装备等级（中位）：' + ' · '.join(f"{k} {med([g.get(k, 0) for g in gear])}" for k in sorted({k for g in gear for k in g})))
    return '\n'.join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--since', help='only rows at or after this UTC time, e.g. 2026-10-22')
    ap.add_argument('--build', help='only sessions from builds starting with this')
    ap.add_argument('--exclude', nargs='*', default=[], help='player ids to leave out (e.g. the developer)')
    ap.add_argument('--dump', help='also write the raw rows here')
    ap.add_argument('--rows', help='read rows from this file instead of the server')
    a = ap.parse_args()
    if a.rows:
        rows = json.load(open(a.rows, encoding='utf-8'))
    else:
        rows = fetch(*config(), since=a.since)
    if a.build:
        rows = [r for r in rows if (r.get('v') or '').startswith(a.build)]
    # Claude's own connection checks and test runs use player ids starting with "claude-"
    rows = [r for r in rows if r['pid'] not in set(a.exclude) and not r['pid'].startswith('claude-')]
    if a.dump:
        json.dump(rows, open(a.dump, 'w', encoding='utf-8'), ensure_ascii=False)
    if not rows:
        sys.exit('No rows yet.')
    print(report(rows))


if __name__ == '__main__':
    main()
