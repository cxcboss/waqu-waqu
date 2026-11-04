// The friends' ranking, drawn inside WeChat's open data context (开放数据域): the only place a mini game can read
// friends' data (wx.getFriendCloudStorage). It can't share code with the game, so this is plain JS on its own.
// The game (src/platform/wx.ts, WxFriendRank) lays the shared canvas over its dialog in screenCanvas mode and
// sends: {cmd:'load'} fetch the friends' scores; {cmd:'show', x, y, w, h, dpr} draw into that box (CSS pixels on
// the screen; the canvas was just resized, which cleared it); {cmd:'hide'}. Scores are the 好评章 count under the
// key 'stamps', in WeChat's standard format: {"wxgame":{"score":N,"update_time":T},"day":D}.
// scripts/build_wx.py copies this folder into the package as opendata/ when built with --rank.

var KEY = 'stamps';
/** Row height, at a list 312 px wide (a 390 px phone); everything scales with the list's width (`u`). */
var ROW = 68;
var C = {
  bed: '#F4E9C8', row: '#FBF7EE', me: '#FBE3C4', ink: '#4A3B30', soft: '#7A6A5C', line: '#E3D3B3',
  gold: '#E8B74A', silver: '#C9C4B6', bronze: '#D49A6A', orange: '#C4633A', teal: '#BFE1D7',
};
var FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

var canvas = wx.getSharedCanvas();
var ctx = canvas.getContext('2d');
var box = null; // {x, y, w, h, dpr} while shown
var state = 'idle'; // idle | loading | ok | denied | error
var list = [];
var me = null; // {nickName, avatarUrl}
var scroll = 0;
var drag = null;
var dirty = false;
var avatars = {};
var u = 1;

function redraw() {
  if (dirty) return;
  dirty = true;
  requestAnimationFrame(function () {
    dirty = false;
    draw();
  });
}

function parse(item) {
  var score = 0, day = 0;
  var kv = item.KVDataList || [];
  for (var i = 0; i < kv.length; i++) {
    if (kv[i].key !== KEY) continue;
    try {
      var v = JSON.parse(kv[i].value);
      score = (v.wxgame && v.wxgame.score) || 0;
      day = v.day || 0;
    } catch (e) {
      /* someone's broken value: counts as 0 */
    }
  }
  return { nick: item.nickname || item.nickName || '微信好友', avatar: item.avatarUrl || '', score: score, day: day, openid: item.openid || item.openId || '' };
}

function load() {
  state = 'loading';
  redraw();
  // who "me" is, to mark my own row (allowed here, in the open data context)
  if (!me && wx.getUserInfo) {
    wx.getUserInfo({
      openIdList: ['selfOpenId'], lang: 'zh_CN',
      success: function (r) {
        me = (r.data && r.data[0]) || null;
        redraw();
      },
      fail: function () {},
    });
  }
  wx.getFriendCloudStorage({
    keyList: [KEY],
    success: function (r) {
      list = (r.data || []).map(parse).sort(function (a, b) {
        return b.score - a.score || b.day - a.day;
      });
      state = 'ok';
      scroll = 0;
      redraw();
    },
    fail: function (e) {
      var msg = String((e && e.errMsg) || '');
      state = /auth|deny|privacy/i.test(msg) ? 'denied' : 'error';
      console.warn('getFriendCloudStorage', msg);
      redraw();
    },
  });
}

function isMe(p) {
  return !!me && !!p.avatar && p.avatar === me.avatarUrl && p.nick === me.nickName;
}

function avatar(url) {
  if (!url) return null;
  var a = avatars[url];
  if (!a) {
    a = avatars[url] = { img: wx.createImage(), ok: false };
    a.img.onload = function () {
      a.ok = true;
      redraw();
    };
    a.img.src = url;
  }
  return a.ok ? a.img : null;
}

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function label(s, x, y, size, color, o) {
  o = o || {};
  ctx.font = (o.bold ? 'bold ' : '') + size + 'px ' + FONT;
  ctx.fillStyle = color;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = 'middle';
  var t = String(s);
  if (o.max) while (t.length > 1 && ctx.measureText(t).width > o.max) t = t.slice(0, -2) + '…';
  ctx.fillText(t, x, y);
}

function centred(lines, w, h) {
  for (var i = 0; i < lines.length; i++) label(lines[i], w / 2, h / 2 + (i - (lines.length - 1) / 2) * 30, i ? 13 : 16, i ? C.soft : C.ink, { align: 'center', bold: !i, max: w - 28 });
}

function maxScroll() {
  return box ? Math.max(0, list.length * ROW * u + 12 * u - box.h) : 0;
}

function draw() {
  if (!box) return;
  u = box.w / 312;
  // drawn in a 312-wide frame: w x h here are the box's size in those units
  var w = 312, h = box.h / u, k = box.dpr * u;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  rr(0, 0, w, h, 8);
  ctx.fillStyle = C.bed;
  ctx.fill();
  if (state === 'idle' || state === 'loading') return centred(['正在找也在玩的好友…'], w, h);
  if (state === 'denied') return centred(['需要允许使用「微信朋友信息」', '右上角「···」→「设置」里可以打开'], w, h);
  if (state === 'error') return centred(['好友排行没有拿到', '关掉再打开试试'], w, h);
  if (!list.length) return centred(['还没有好友在玩', '分享给朋友，一起比比谁的好评章多'], w, h);
  ctx.save();
  rr(0, 0, w, h, 8);
  ctx.clip();
  var s = Math.min(scroll, maxScroll()) / u;
  var first = Math.max(0, Math.floor(s / ROW));
  for (var i = first; i < list.length; i++) {
    var y = 6 + i * ROW - s;
    if (y > h) break;
    row(list[i], i, y, w);
  }
  ctx.restore();
}

function row(p, i, y, w) {
  var mine = isMe(p);
  rr(6, y, w - 12, ROW - 6, 9);
  ctx.fillStyle = mine ? C.me : C.row;
  ctx.fill();
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 1;
  ctx.stroke();
  var cy = y + (ROW - 6) / 2;
  // place: a medal for the first three
  var medal = i === 0 ? C.gold : i === 1 ? C.silver : i === 2 ? C.bronze : null;
  if (medal) {
    ctx.beginPath();
    ctx.arc(28, cy, 13, 0, Math.PI * 2);
    ctx.fillStyle = medal;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  label(i + 1, 28, cy + 1, 14, C.ink, { align: 'center', bold: true });
  // the friend's WeChat picture in a round frame
  var ax = 68, r = 19;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = C.teal;
  ctx.fill();
  ctx.clip();
  var img = avatar(p.avatar);
  if (img) ctx.drawImage(img, ax - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(ax, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  label(p.nick + (mine ? '（我）' : ''), 98, cy - 10, 15, C.ink, { bold: true, max: w - 98 - 84 });
  label(p.day ? '送到第 ' + p.day + ' 天' : '刚入职', 98, cy + 12, 12, C.soft);
  label(p.score, w - 40, cy, 20, C.orange, { align: 'right', bold: true });
  label('枚', w - 18, cy + 2, 13, C.soft, { align: 'right' });
}

function inside(t) {
  return box && t.clientX >= box.x && t.clientX <= box.x + box.w && t.clientY >= box.y && t.clientY <= box.y + box.h;
}

// the list scrolls with a finger dragged inside its box (touches reach both the game and this context)
wx.onTouchStart(function (e) {
  var t = e.changedTouches && e.changedTouches[0];
  if (t && inside(t)) drag = { id: t.identifier, y: t.clientY, s: Math.min(scroll, maxScroll()) };
});
wx.onTouchMove(function (e) {
  if (!drag) return;
  var ts = e.changedTouches || [];
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].identifier !== drag.id) continue;
    scroll = Math.max(0, Math.min(maxScroll(), drag.s - (ts[i].clientY - drag.y)));
    redraw();
  }
});
function end() {
  drag = null;
}
wx.onTouchEnd(end);
wx.onTouchCancel(end);

wx.onMessage(function (m) {
  if (!m || !m.cmd) return;
  if (m.cmd === 'load') load();
  else if (m.cmd === 'show') {
    box = { x: m.x, y: m.y, w: m.w, h: m.h, dpr: m.dpr || 2 };
    if (state === 'idle') load();
    else redraw();
  } else if (m.cmd === 'hide') {
    box = null;
    drag = null;
  }
});
