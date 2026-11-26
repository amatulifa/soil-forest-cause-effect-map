/* Soil–Forest Cause–Effect Map: drawing and tools.
   The content (boxes, arrows, sources) is in data/network.js; this file does not need editing to change it. */
(function () {
'use strict';
var NET = window.CEM_NETWORK;
if (!NET) return;
window.CEM_APP = true;

var $ = function (q) { return document.querySelector(q); };
var $$ = function (q) { return Array.prototype.slice.call(document.querySelectorAll(q)); };
var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

/* ---------- data ---------- */
var CATS = NET.categories, REFS = NET.refs || {}, BY = {};
var ALLN = NET.nodes.filter(function (n) {
  var ok = n.id && CATS[n.cat] && !BY[n.id];
  if (ok) BY[n.id] = n; else if (window.console) console.warn('Skipped a box with a missing or repeated id, or an unknown category:', n);
  return ok;
});
ALLN.forEach(function (n, i) { n.i = i; n.short = n.label.replace(/-\|/g, '').replace(/\|/g, ' '); n.name = n.name || n.short; });
var ALLE = NET.edges.filter(function (e) {
  var ok = BY[e.f] && BY[e.t] && e.f !== e.t && ['+', '-', '0'].indexOf(e.s) >= 0;
  if (!ok && window.console) console.warn('Skipped an arrow with an unknown box or sign:', e);
  return ok;
});
ALLE.forEach(function (e, k) {
  e.k = k; e.sv = e.s === '+' ? 1 : e.s === '-' ? -1 : 0; e.r = e.r || [];
  e.r.forEach(function (r) { if (!REFS[r] && window.console) console.warn('Unknown reference key "' + r + '" on arrow ' + e.f + ' → ' + e.t); });
});
var NM = function (id) { return BY[id].name; };
var CLS = function (v) { return v === 1 ? 'up' : v === -1 ? 'down' : 'mix'; };
var GLY = function (v) { return v === 1 ? '↑' : v === -1 ? '↓' : '±'; };
var SGN = function (s) { return s === '+' ? '+' : s === '-' ? '−' : '±'; };
var lc = function (t) { return t.length > 1 && /[a-z]/.test(t.charAt(1)) ? t.charAt(0).toLowerCase() + t.slice(1) : t; };

/* short reference label: "Surname year", "Surname & Surname year" or "Surname et al. year" */
var SHORT = {};
Object.keys(REFS).forEach(function (k) {
  var c = REFS[k], y = (c.match(/\((\d{4}[a-z]?)\)/) || [, ''])[1], au = c.split(' (')[0], parts = au.split(/\.,\s/);
  var n = /et al/.test(au) ? 3 : Math.round(((au.match(/,/g) || []).length + 1) / 2), s1 = au.split(',')[0];
  SHORT[k] = n <= 1 ? s1 + ' ' + y : n === 2 && parts[1] ? s1 + ' & ' + parts[1].split(',')[0] + ' ' + y : s1 + ' et al. ' + y;
});
var refLinks = function (r) { return r.map(function (k) { return REFS[k] ? '<a href="#ref-' + k + '" title="' + esc(REFS[k]) + '">' + esc(SHORT[k]) + '</a>' : ''; }).filter(Boolean).join('; '); };

/* ---------- state ---------- */
var DEF_DEPTH = 4, HIDE = {}, DEPTH = DEF_DEPTH, DIR = 1, ST = { kind: null }, CAP = 50000;
var NODES, OUT, IN, ON = {};
function build() {
  NODES = ALLN.filter(function (n) { return !HIDE[n.cat]; });
  ON = {}; NODES.forEach(function (n) { ON[n.id] = 1; });
  OUT = {}; IN = {}; NODES.forEach(function (n) { OUT[n.id] = []; IN[n.id] = []; });
  ALLE.forEach(function (e) { if (ON[e.f] && ON[e.t]) { OUT[e.f].push(e.k); IN[e.t].push(e.k); } });
}

/* ---------- chains ---------- */
function pathsFrom(src) {
  var res = {}, seen = {}, n = 0; seen[src] = 1;
  (function dfs(v, sg, es) {
    OUT[v].forEach(function (k) {
      var e = ALLE[k]; if (seen[e.t] || n > CAP) return;
      var p = es.concat(k), s = sg * e.sv; n++;
      (res[e.t] = res[e.t] || []).push({ s: s, e: p });
      if (p.length < DEPTH) { seen[e.t] = 1; dfs(e.t, s, p); delete seen[e.t]; }
    });
  })(src, 1, []);
  res._capped = n > CAP;
  return res;
}
function pathsTo(dst) {
  var res = {}, seen = {}, n = 0; seen[dst] = 1;
  (function dfs(v, sg, es) {
    IN[v].forEach(function (k) {
      var e = ALLE[k]; if (seen[e.f] || n > CAP) return;
      var p = [k].concat(es), s = sg * e.sv; n++;
      (res[e.f] = res[e.f] || []).push({ s: s, e: p });
      if (p.length < DEPTH) { seen[e.f] = 1; dfs(e.f, s, p); delete seen[e.f]; }
    });
  })(dst, 1, []);
  res._capped = n > CAP;
  return res;
}
function tally(list, d) {
  var t = { up: 0, dn: 0, mx: 0, n: list.length };
  list.forEach(function (p) { var s = p.s * d; if (s === 1) t.up++; else if (s === -1) t.dn++; else t.mx++; });
  t.v = t.up && !t.dn && !t.mx ? 1 : t.dn && !t.up && !t.mx ? -1 : 0;
  /* direction of the shortest chains, used when the chains disagree */
  var m = Math.min.apply(null, list.map(function (p) { return p.e.length; })), ss = {};
  list.forEach(function (p) { if (p.e.length === m) ss[p.s * d] = 1; });
  var ks = Object.keys(ss); t.short = ks.length === 1 ? +ks[0] : 0;
  return t;
}
var byLen = function (a, b) { return a.e.length - b.e.length; };
function loops() {
  var out = [], idx = {};
  NODES.forEach(function (n, i) { idx[n.id] = i; });
  NODES.forEach(function (sn, si) {
    var seen = {}; seen[sn.id] = 1;
    (function dfs(v, es) {
      OUT[v].forEach(function (k) {
        var e = ALLE[k];
        if (e.t === sn.id) { out.push(es.concat(k)); return; }
        if (idx[e.t] < si || seen[e.t] || es.length + 1 >= DEPTH) return;
        seen[e.t] = 1; dfs(e.t, es.concat(k)); delete seen[e.t];
      });
    })(sn.id, []);
  });
  return out.map(function (es) { var s = 1; es.forEach(function (k) { s *= ALLE[k].sv; }); return { e: es, s: s }; })
    .sort(function (a, b) { return a.e.length - b.e.length || b.s - a.s; });
}

/* ---------- drawing ---------- */
var svg = $('#ring'), wrap = $('#ringwrap'), PW = 112, PH = 36, POS = {}, G = null;
function geom(W, H) {
  var cx = W / 2, cy = H / 2, rx = cx - PW / 2 - 14, ry = cy - PH / 2 - 14, S = 8000, pts = [];
  for (var i = 0; i < S; i++) {
    /* a superellipse: a rounded rectangle that uses the corners of the drawing */
    var t = -Math.PI / 2 + i / S * 2 * Math.PI, c = Math.cos(t), sn = Math.sin(t), e = 2 / 5;
    pts.push([cx + rx * (c < 0 ? -1 : 1) * Math.pow(Math.abs(c), e), cy + ry * (sn < 0 ? -1 : 1) * Math.pow(Math.abs(sn), e)]);
  }
  return { W: W, H: H, cx: cx, cy: cy, pts: pts };
}
/* distance in box units: 1 means two boxes just clear each other side by side or one above the other */
var cheb = function (a, b) { return Math.max(Math.abs(a[0] - b[0]) / (PW + 10), Math.abs(a[1] - b[1]) / (PH + 8)); };
function greedy(g, s) {
  var out = [g.pts[0]], last = g.pts[0];
  for (var i = 1; i < g.pts.length; i++) if (cheb(g.pts[i], last) >= s) { out.push(g.pts[i]); last = g.pts[i]; }
  while (out.length > 1 && cheb(out[out.length - 1], out[0]) < s) out.pop();
  return out;
}
/* the widest even spacing that still fits N boxes; grows the drawing until that spacing is at least 1 */
function layout(W, N) {
  var H = Math.round(W * 0.55), g, best;
  for (var k = 0; k < 40; k++) {
    g = geom(W, H); var lo = 0.5, hi = 4; best = null;
    for (var it = 0; it < 22; it++) { var m = (lo + hi) / 2, r = greedy(g, m); if (r.length >= N) { lo = m; best = r; } else hi = m; }
    if (best && lo >= 1) break;
    H = Math.round(H * 1.04);
  }
  g.slots = (best || greedy(g, 1)).slice(0, N);
  return g;
}
function rim(p, c, pad) {
  var dx = c.x - p.x, dy = c.y - p.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  var t = Math.min((PW / 2 + pad) / Math.max(Math.abs(ux), 1e-6), (PH / 2 + pad) / Math.max(Math.abs(uy), 1e-6));
  return { x: p.x + ux * t, y: p.y + uy * t };
}
function edgeD(e) {
  var p = POS[e.f], q = POS[e.t], mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, c = { x: mx + (G.cx - mx) * 0.5, y: my + (G.cy - my) * 0.5 };
  var a = rim(p, c, 2), b = rim(q, c, 4);
  return 'M' + a.x.toFixed(1) + ' ' + a.y.toFixed(1) + 'Q' + c.x.toFixed(1) + ' ' + c.y.toFixed(1) + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
}
function draw() {
  var W = Math.max(860, Math.round(wrap.clientWidth - 2)), N = NODES.length, H;
  G = layout(W, N); H = G.H;
  NODES.forEach(function (n, i) { var pt = G.slots[i]; POS[n.id] = { x: pt[0], y: pt[1] }; });
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
  svg.style.minWidth = W + 'px';
  var mk = function (id, col) { return '<marker id="' + id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M0 0L10 5L0 10z" fill="' + col + '"/></marker>'; };
  var s = '<defs>' + mk('ap', 'var(--pos)') + mk('am', 'var(--neg)') + mk('az', 'var(--dep)') + '</defs><g class="eds">';
  var act = ALLE.filter(function (e) { return ON[e.f] && ON[e.t]; });
  act.forEach(function (e) {
    s += '<path class="ed ' + (e.s === '+' ? 'p' : e.s === '-' ? 'm' : 'z') + '" data-k="' + e.k + '" d="' + edgeD(e) + '" marker-end="url(#' + (e.s === '+' ? 'ap' : e.s === '-' ? 'am' : 'az') + ')"/>';
  });
  s += '</g><g class="hits">';
  act.forEach(function (e) { s += '<path class="hit" data-k="' + e.k + '" d="' + edgeD(e) + '"><title>' + esc(NM(e.f) + ' ' + SGN(e.s) + ' ' + NM(e.t) + ': ' + e.n) + '</title></path>'; });
  s += '</g><g class="nds">';
  NODES.forEach(function (n) {
    var p = POS[n.id], lines = n.label.split('|'), col = CATS[n.cat].color, txt = '';
    lines.forEach(function (ln, i) { txt += '<text x="0" y="' + (lines.length === 1 ? 4.5 : i === 0 ? -2 : 11) + '" text-anchor="middle">' + esc(ln) + '</text>'; });
    s += '<g class="nd" data-id="' + n.id + '" transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')" tabindex="0" role="button" aria-label="' + esc(n.name) + '">' +
      '<rect class="bx" x="' + (-PW / 2) + '" y="' + (-PH / 2) + '" width="' + PW + '" height="' + PH + '" rx="9" stroke="' + col + '"/>' +
      '<rect class="cb" x="' + (-PW / 2 + 9) + '" y="' + (-PH / 2 - 1.5) + '" width="' + (PW - 18) + '" height="4" rx="2" fill="' + col + '"/>' + txt +
      '<g class="bd" style="display:none"><circle cx="' + (PW / 2 - 2) + '" cy="' + (-PH / 2 + 1) + '" r="10.5"/><text x="' + (PW / 2 - 2) + '" y="' + (-PH / 2 + 5.5) + '" text-anchor="middle"></text></g></g>';
  });
  svg.innerHTML = s + '</g>';
  apply();
}
svg.addEventListener('click', function (ev) {
  var nd = ev.target.closest && ev.target.closest('.nd'), hit = ev.target.closest && ev.target.closest('.hit');
  if (nd) selectNode(nd.getAttribute('data-id'), true);
  else if (hit) selectEdge(+hit.getAttribute('data-k'));
});
svg.addEventListener('keydown', function (ev) {
  var nd = ev.target.closest && ev.target.closest('.nd');
  if (nd && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); selectNode(nd.getAttribute('data-id'), true); }
});
/* hovering a box with nothing selected shows its direct arrows */
var hov = null;
svg.addEventListener('mouseover', function (ev) {
  var nd = ev.target.closest && ev.target.closest('.nd'), id = nd ? nd.getAttribute('data-id') : null;
  if (id === hov || ST.kind) return; hov = id; paint();
});
svg.addEventListener('mouseleave', function () { if (hov) { hov = null; paint(); } });

/* ---------- view ---------- */
var VIEW = null;
function compute() {
  var v = { hi: {}, on: {}, keep: null, badge: {}, sel: {}, end: {} };
  var keepAll = function (obj) { v.keep = v.keep || {}; Object.keys(obj).forEach(function (id) { v.keep[id] = 1; }); };
  if (ST.kind === 'node') {
    var id = ST.id; v.sel[id] = 1; v.keep = {}; v.keep[id] = 1;
    if (ST.mode === 'direct') {
      OUT[id].concat(IN[id]).forEach(function (k) { v.hi[k] = 1; v.keep[ALLE[k].f] = v.keep[ALLE[k].t] = 1; });
    } else {
      var P = ST.mode === 'effects' ? pathsFrom(id) : pathsTo(id), d = ST.mode === 'effects' ? DIR : 1;
      v.P = P;
      Object.keys(P).forEach(function (o) {
        if (o === '_capped') return;
        var t = tally(P[o], d); v.badge[o] = t.v; v.keep[o] = 1;
        P[o].forEach(function (p) { p.e.forEach(function (k) { v.on[k] = 1; }); });
      });
      (ST.mode === 'effects' ? OUT[id] : IN[id]).forEach(function (k) { v.hi[k] = 1; });
    }
  } else if (ST.kind === 'trace') {
    v.end[ST.a] = v.end[ST.b] = 1; v.keep = {}; v.keep[ST.a] = v.keep[ST.b] = 1;
    v.list = (pathsFrom(ST.a)[ST.b] || []).slice().sort(byLen);
    var show = ST.pick != null && v.list[ST.pick] ? [v.list[ST.pick]] : v.list;
    show.forEach(function (p) { p.e.forEach(function (k) { v.hi[k] = 1; v.keep[ALLE[k].f] = v.keep[ALLE[k].t] = 1; }); });
    /* boxes along the chains show how they change */
    if (show.length) {
      var acc = {};
      show.forEach(function (p) { var s = DIR; p.e.forEach(function (k) { s *= ALLE[k].sv; var t = ALLE[k].t; acc[t] = acc[t] || {}; acc[t][s] = 1; }); });
      Object.keys(acc).forEach(function (t) { var ks = Object.keys(acc[t]); v.badge[t] = ks.length === 1 ? +ks[0] : 0; });
    }
  } else if (ST.kind === 'edge') {
    var e = ALLE[ST.k]; v.hi[ST.k] = 1; v.sel[e.f] = v.sel[e.t] = 1; v.keep = {}; v.keep[e.f] = v.keep[e.t] = 1;
  } else if (ST.kind === 'loops') {
    v.L = loops();
    if (ST.pick != null && v.L[ST.pick]) { v.keep = {}; v.L[ST.pick].e.forEach(function (k) { v.hi[k] = 1; v.keep[ALLE[k].f] = 1; }); }
  }
  if (!ST.kind && hov && ON[hov]) {
    v.sel[hov] = 1; v.keep = {}; v.keep[hov] = 1;
    OUT[hov].concat(IN[hov]).forEach(function (k) { v.hi[k] = 1; v.keep[ALLE[k].f] = v.keep[ALLE[k].t] = 1; });
  }
  return v;
}
function paint() {
  var v = ST.kind ? VIEW : compute(), any = Object.keys(v.hi).length || Object.keys(v.on).length || v.keep;
  $$('#ring .ed').forEach(function (p) {
    var k = p.getAttribute('data-k'), hi = !!v.hi[k], on = !hi && !!v.on[k];
    p.classList.toggle('hi', hi); p.classList.toggle('on', on); p.classList.toggle('lo', !!any && !hi && !on);
  });
  $$('#ring .nd').forEach(function (g) {
    var id = g.getAttribute('data-id'), b = g.querySelector('.bd'), bv = v.badge[id];
    g.classList.toggle('sel', !!v.sel[id]); g.classList.toggle('end', !!v.end[id]);
    g.classList.toggle('fade', !!(v.keep && !v.keep[id]));
    if (bv === undefined || v.sel[id]) b.style.display = 'none';
    else { b.style.display = ''; b.setAttribute('class', 'bd ' + CLS(bv)); b.querySelector('text').textContent = GLY(bv); }
  });
}
function apply() {
  VIEW = compute(); paint(); panel(); sync(); hash(); jump();
}
/* on narrow screens the panel sits below the map: offer a button to get to the results */
function jump() {
  var b = $('#jump'), r = P$.getBoundingClientRect();
  b.hidden = !(ST.kind && window.innerWidth <= 1100 && r.top > window.innerHeight - 60);
}
window.addEventListener('scroll', function () { if (!$('#jump').hidden) jump(); }, { passive: true });
$('#jump').addEventListener('click', function () { P$.scrollIntoView({ behavior: 'smooth', block: 'start' }); this.hidden = true; });

/* ---------- panel ---------- */
var P$ = $('#panel');
function head(n) {
  return '<span class="tag" style="--cc:' + CATS[n.cat].color + '"><i></i>' + esc(CATS[n.cat].name) + '</span><h3>' + esc(n.name) + '</h3><p>' + esc(n.d || '') + '</p>' +
    (n.m ? '<p class="meas"><b>Measured as:</b> ' + esc(n.m) + '</p>' : '');
}
function arrowLi(k, side) {
  var e = ALLE[k], o = side === 'in' ? e.f : e.t;
  return '<li><span class="g ' + CLS(e.sv) + '">' + SGN(e.s) + '</span><span>' + (side === 'in' ? 'from ' : 'to ') + '<button type="button" class="lk" data-node="' + o + '">' + esc(NM(o)) + '</button>' +
    '<small>' + esc(e.n) + '</small>' + (e.c ? '<span class="cond">Holds: ' + esc(e.c) + '</span>' : '') +
    (e.r.length ? '<span class="src">' + refLinks(e.r) + ' · <button type="button" class="lk" style="font-weight:400" data-edge="' + k + '">arrow details</button></span>' : '') + '</span></li>';
}
function chain(p, d) {
  var e0 = ALLE[p.e[0]], s = d, h = esc(NM(e0.f)) + ' <i class="' + CLS(d) + '">' + GLY(d) + '</i>';
  p.e.forEach(function (k) { var e = ALLE[k]; s *= e.sv; h += ' → ' + esc(NM(e.t)) + ' <i class="' + CLS(s) + '">' + GLY(s) + '</i>'; });
  return h;
}
function steps(p, d) {
  var s = d;
  return '<ol>' + p.e.map(function (k) {
    var e = ALLE[k], a = s; s *= e.sv;
    return '<li><b>' + esc(NM(e.f)) + ' ' + GLY(a) + ' → ' + esc(lc(NM(e.t))) + ' ' + GLY(s) + '.</b> ' + esc(e.n) + (e.c ? ' <span class="cond">Holds: ' + esc(e.c) + '</span>' : '') +
      (e.r.length ? '<span class="src">' + refLinks(e.r) + '</span>' : '') + '</li>';
  }).join('') + '</ol>';
}
var cnt = function (t) {
  var a = [];
  if (t.up) a.push(t.up + ' raise' + (t.up === 1 ? 's' : '') + ' it');
  if (t.dn) a.push(t.dn + ' lower' + (t.dn === 1 ? 's' : '') + ' it');
  if (t.mx) a.push(t.mx + ' depend' + (t.mx === 1 ? 's' : '') + ' on conditions');
  return t.n + ' chain' + (t.n === 1 ? '' : 's') + ': ' + a.join(', ');
};
function groupBlock(P, d, ids, title, clsv, from) {
  if (!ids.length) return '';
  return '<h4>' + title + ' (' + ids.length + ')</h4><ul class="plist">' + ids.map(function (o) {
    var L = P[o].slice().sort(byLen), t = tally(L, d);
    return '<li><span class="g ' + clsv + '">' + GLY(t.v) + '</span><span><button type="button" class="lk" data-trace="' + (from ? o + ',' + ST.id : ST.id + ',' + o) + '">' + esc(NM(o)) + '</button>' +
      '<small>' + cnt(t) + '.' + (t.v === 0 && t.short ? ' The most direct chain' + (t.up + t.dn + t.mx > 1 ? 's ' : ' ') + (t.short === 1 ? 'raise' : 'lower') + ' it.' : '') +
      ' Shortest: ' + chain(L[0], from ? 1 : d) + '</small></span></li>';
  }).join('') + '</ul>';
}
function panel() {
  var h = '';
  if (ST.kind === 'node') {
    var n = BY[ST.id]; h = head(n);
    if (ST.mode === 'direct') {
      var ins = IN[n.id], outs = OUT[n.id];
      h += ins.length ? '<h4>Arrows into it (' + ins.length + ')</h4><ul class="plist">' + ins.map(function (k) { return arrowLi(k, 'in'); }).join('') + '</ul>' : '<p class="more">No arrows lead into this box: it is a starting point of the map.</p>';
      h += outs.length ? '<h4>Arrows out of it (' + outs.length + ')</h4><ul class="plist">' + outs.map(function (k) { return arrowLi(k, 'out'); }).join('') + '</ul>' : '<p class="more">No arrows lead out of this box: it is an end point of the map.</p>';
    } else {
      var P = VIEW.P, eff = ST.mode === 'effects', d = eff ? DIR : 1, ids = Object.keys(P).filter(function (o) { return o !== '_capped'; });
      ids.sort(function (a, b) { return P[a].slice().sort(byLen)[0].e.length - P[b].slice().sort(byLen)[0].e.length || NM(a).localeCompare(NM(b)); });
      var up = [], dn = [], mx = [];
      ids.forEach(function (o) { var v = tally(P[o], d).v; (v === 1 ? up : v === -1 ? dn : mx).push(o); });
      if (eff) {
        h += '<p class="sum">If <b>' + esc(lc(n.name)) + '</b> ' + (DIR === 1 ? 'increases' : 'decreases') + ', chains of up to ' + DEPTH + ' arrows reach <b>' + ids.length + '</b> of the other ' + (NODES.length - 1) + ' boxes. Click a box below to see its chains.</p>';
        if (!ids.length) h += '<p class="more">No arrows lead out of this box.</p>';
        h += groupBlock(P, d, up, 'Goes up', 'up') + groupBlock(P, d, dn, 'Goes down', 'down') + groupBlock(P, d, mx, 'Chains disagree', 'mix');
      } else {
        h += '<p class="sum">Boxes that change <b>' + esc(lc(n.name)) + '</b> through chains of up to ' + DEPTH + ' arrows: <b>' + ids.length + '</b>. The sign shows what an <i>increase</i> in each of them does.</p>';
        if (!ids.length) h += '<p class="more">No arrows lead into this box: it is a starting point of the map.</p>';
        h += groupBlock(P, 1, up, 'Raise it', 'up', true) + groupBlock(P, 1, dn, 'Lower it', 'down', true) + groupBlock(P, 1, mx, 'Chains disagree', 'mix', true);
      }
      if (P._capped) h += '<p class="more">Very many chains: the list stopped at ' + CAP + '. Choose a shorter longest chain for a complete count.</p>';
    }
  } else if (ST.kind === 'trace') {
    var L = VIEW.list, t = tally(L, DIR);
    h = '<span class="tag">Trace</span><h3>' + esc(NM(ST.a)) + ' → ' + esc(lc(NM(ST.b))) + '</h3>';
    if (!L.length) h += '<p class="sum">No chain of up to ' + DEPTH + ' arrows leads from ' + esc(lc(NM(ST.a))) + ' to ' + esc(lc(NM(ST.b))) + (Object.keys(HIDE).length ? ' with the hidden categories left out' : '') + '.</p>';
    else {
      h += '<p class="sum">If <b>' + esc(lc(NM(ST.a))) + '</b> ' + (DIR === 1 ? 'increases' : 'decreases') + ': ' + cnt(t) + '. ' +
        (t.v === 1 ? 'All chains agree: it goes <b>up</b>.' : t.v === -1 ? 'All chains agree: it goes <b>down</b>.' : 'The chains disagree, so the net effect depends on which is stronger.' +
        (t.short ? ' The most direct ' + (t.short === 1 ? 'route raises' : 'route lowers') + ' it; longer chains are usually weaker, but not always.' : '')) + '</p>';
      var lim = 60;
      h += '<p class="more">Click a chain to highlight it alone and read each step.</p>' + L.slice(0, lim).map(function (p, i) {
        return '<details class="ch" data-pick="' + i + '"' + (ST.pick === i ? ' open' : '') + '><summary class="chain">' + chain(p, DIR) + '</summary>' + steps(p, DIR) + '</details>';
      }).join('') + (L.length > lim ? '<p class="more">Showing the ' + lim + ' shortest of ' + L.length + ' chains.</p>' : '');
    }
    h += '<div class="acts"><button type="button" class="btn" data-node="' + ST.a + '">Effects of ' + esc(lc(NM(ST.a))) + '</button><button type="button" class="btn" data-swap="1">Swap direction</button></div>';
  } else if (ST.kind === 'edge') {
    var e = ALLE[ST.k];
    h = '<span class="tag">Arrow</span><h3>' + esc(NM(e.f)) + ' ' + SGN(e.s) + ' ' + esc(lc(NM(e.t))) + '</h3>' +
      '<p class="sum">' + (e.s === '+' ? 'More ' + esc(lc(NM(e.f))) + ' raises ' + esc(lc(NM(e.t))) + '.' : e.s === '-' ? 'More ' + esc(lc(NM(e.f))) + ' lowers ' + esc(lc(NM(e.t))) + '.' : 'The effect of ' + esc(lc(NM(e.f))) + ' on ' + esc(lc(NM(e.t))) + ' depends on conditions.') + '</p>' +
      '<p>' + esc(e.n) + '</p>' + (e.c ? '<p class="meas"><b>Holds:</b> ' + esc(e.c) + '</p>' : '') +
      (e.r.length ? '<h4>Sources</h4><ul class="refs" style="padding-left:18px">' + e.r.filter(function (k) { return REFS[k]; }).map(function (k) { return '<li>' + esc(REFS[k]) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="acts"><button type="button" class="btn" data-node="' + e.f + '">' + esc(NM(e.f)) + '</button><button type="button" class="btn" data-node="' + e.t + '">' + esc(NM(e.t)) + '</button></div>';
  } else if (ST.kind === 'loops') {
    var LL = VIEW.L, nr = LL.filter(function (l) { return l.s === 1; }).length, nb = LL.filter(function (l) { return l.s === -1; }).length;
    h = '<span class="tag">Feedback loops</span><h3>' + LL.length + ' loops of up to ' + DEPTH + ' arrows</h3>' +
      '<p class="sum"><span class="rb r">R</span>' + nr + ' reinforcing: a change comes back stronger. <span class="rb b" style="margin-left:6px">B</span>' + nb + ' balancing: it comes back opposed.' +
      (LL.length - nr - nb ? ' <span class="rb d" style="margin-left:6px">±</span>' + (LL.length - nr - nb) + ' depend on conditions.' : '') + '</p><div style="display:grid;gap:6px">' +
      LL.map(function (l, i) {
        var ids = l.e.map(function (k) { return ALLE[k].f; });
        return '<button type="button" class="loopbtn" data-loop="' + i + '" aria-pressed="' + (ST.pick === i) + '"><span class="rb ' + (l.s === 1 ? 'r">R' : l.s === -1 ? 'b">B' : 'd">±') + '</span>' +
          ids.map(function (id) { return esc(NM(id)); }).join(' → ') + ' → ' + esc(NM(ids[0])) + '</button>';
      }).join('') + '</div>';
    if (!LL.length) h += '<p class="more">No loops with the current settings.</p>';
  } else {
    h = '<h3>Start here</h3><p>Click a box on the map or choose one above. You will see everything it changes through chains of arrows, and the panel lists the results.</p>' +
      '<ul class="plist">' +
      '<li><span class="g up">↑</span><span><b>Effects</b><small>What happens downstream if the box increases or decreases.</small></span></li>' +
      '<li><span class="g down">↓</span><span><b>Causes</b><small>Everything that raises or lowers the box.</small></span></li>' +
      '<li><span class="g mix">±</span><span><b>Trace</b><small>Every chain between two boxes, with the mechanism of each step.</small></span></li>' +
      '<li><span class="g up">R</span><span><b>Feedback loops</b><small>Chains that come back to where they started.</small></span></li></ul>' +
      '<h4>Try</h4><p><button type="button" class="lk" data-try="node:con:effects">Effects of more conifers</button><br>' +
      '<button type="button" class="lk" data-try="node:ph:causes">What drives soil pH</button><br>' +
      '<button type="button" class="lk" data-try="trace:dep:ewm">Acid deposition → earthworms</button><br>' +
      '<button type="button" class="lk" data-try="trace:trf:soc">Machine traffic → soil carbon</button><br>' +
      '<button type="button" class="lk" data-try="loops">Feedback loops</button></p>';
  }
  P$.innerHTML = h;
}
P$.addEventListener('click', function (ev) {
  var b = ev.target.closest('[data-node],[data-trace],[data-edge],[data-loop],[data-swap],[data-try]');
  if (!b) return;
  var ds = b.dataset;
  if (ds.node) selectNode(ds.node);
  else if (ds.trace) { var ab = ds.trace.split(','); trace(ab[0], ab[1]); }
  else if (ds.edge) selectEdge(+ds.edge);
  else if (ds.loop) { var i = +ds.loop; ST.pick = ST.pick === i ? null : i; VIEW = compute(); paint(); $$('.loopbtn').forEach(function (x) { x.setAttribute('aria-pressed', String(+x.dataset.loop === ST.pick)); }); }
  else if (ds.swap) trace(ST.b, ST.a);
  else if (ds.try) {
    var t = ds.try.split(':');
    if (t[0] === 'node') { ST = { kind: 'node', id: t[1], mode: t[2] }; DIR = 1; apply(); }
    else if (t[0] === 'trace') { DIR = 1; trace(t[1], t[2]); }
    else showLoops();
  }
});
P$.addEventListener('toggle', function (ev) {
  var d = ev.target; if (!d.classList || !d.classList.contains('ch') || ST.kind !== 'trace') return;
  var i = +d.dataset.pick;
  if (d.open) { $$('#panel details.ch').forEach(function (o) { if (o !== d) o.open = false; }); ST.pick = i; }
  else if (ST.pick === i) ST.pick = null;
  VIEW = compute(); paint();
}, true);

/* ---------- actions ---------- */
function selectNode(id, fromMap) {
  if (!ON[id]) return;
  /* clicking the selected box on the map again clears the selection */
  if (fromMap && ST.kind === 'node' && ST.id === id) { ST = { kind: null }; apply(); return; }
  ST = { kind: 'node', id: id, mode: ST.kind === 'node' ? ST.mode : 'effects' }; apply();
}
function selectEdge(k) { var e = ALLE[k]; if (!e || !ON[e.f] || !ON[e.t]) return; ST = { kind: 'edge', k: k }; apply(); }
function trace(a, b) { if (!ON[a] || !ON[b] || a === b) return; ST = { kind: 'trace', a: a, b: b, pick: null }; apply(); }
function showLoops() { ST = ST.kind === 'loops' ? { kind: null } : { kind: 'loops', pick: null }; apply(); }
function say(t) { var m = $('#msg'); m.textContent = t; clearTimeout(say.t); say.t = setTimeout(function () { m.textContent = ''; }, 3500); }

/* ---------- controls ---------- */
function options(withEmpty) {
  var h = withEmpty ? '<option value="">' + withEmpty + '</option>' : '';
  Object.keys(CATS).forEach(function (c) {
    var ns = NODES.filter(function (n) { return n.cat === c; });
    if (ns.length) h += '<optgroup label="' + esc(CATS[c].name) + '">' + ns.map(function (n) { return '<option value="' + n.id + '">' + esc(n.name) + '</option>'; }).join('') + '</optgroup>';
  });
  return h;
}
function fillSelects() {
  $('#pick').innerHTML = options('— choose a box —');
  $('#tf').innerHTML = options('from …'); $('#tt').innerHTML = options('to …');
}
function sync() {
  $('#pick').value = ST.kind === 'node' ? ST.id : '';
  $$('#mode button').forEach(function (b) { b.setAttribute('aria-pressed', String(ST.kind === 'node' && ST.mode === b.dataset.m)); });
  var dirOn = (ST.kind === 'node' && ST.mode === 'effects') || ST.kind === 'trace';
  $$('#dir button').forEach(function (b) { b.disabled = !dirOn; b.setAttribute('aria-pressed', String(dirOn && +b.dataset.d === DIR)); });
  if (ST.kind === 'trace') { $('#tf').value = ST.a; $('#tt').value = ST.b; }
  $('#loopsBtn').setAttribute('aria-pressed', String(ST.kind === 'loops'));
  $('#depth').value = String(DEPTH);
  $$('#chips .chip').forEach(function (b) { b.setAttribute('aria-pressed', String(!HIDE[b.dataset.c])); });
}
$('#pick').addEventListener('change', function () { var v = this.value; if (v) { ST = { kind: 'node', id: v, mode: ST.kind === 'node' ? ST.mode : 'effects' }; apply(); } else { ST = { kind: null }; apply(); } });
$$('#mode button').forEach(function (b) { b.addEventListener('click', function () {
  var id = ST.kind === 'node' ? ST.id : ST.kind === 'edge' ? ALLE[ST.k].f : ST.kind === 'trace' ? ST.a : $('#pick').value;
  if (!id) { say('Choose a box first.'); return; }
  ST = { kind: 'node', id: id, mode: b.dataset.m }; apply();
}); });
$$('#dir button').forEach(function (b) { b.addEventListener('click', function () { DIR = +b.dataset.d; VIEW = compute(); paint(); panel(); sync(); hash(); }); });
$('#tgo').addEventListener('click', function () {
  var a = $('#tf').value, b = $('#tt').value;
  if (!a || !b) { say('Choose both boxes.'); return; }
  if (a === b) { say('Choose two different boxes.'); return; }
  trace(a, b);
});
$('#loopsBtn').addEventListener('click', showLoops);
$('#depth').innerHTML = [3, 4, 5, 6, 7, 8].map(function (d) { return '<option value="' + d + '">' + d + ' arrows</option>'; }).join('');
$('#depth').addEventListener('change', function () { DEPTH = +this.value; if (ST.kind === 'loops' || ST.kind === 'trace') ST.pick = null; apply(); });
$('#reset').addEventListener('click', function () { HIDE = {}; DEPTH = DEF_DEPTH; DIR = 1; ST = { kind: null }; build(); fillSelects(); draw(); });
Object.keys(CATS).forEach(function (c) {
  var b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.c = c; b.style.setProperty('--cc', CATS[c].color);
  b.innerHTML = '<i></i>' + esc(CATS[c].name);
  b.addEventListener('click', function () {
    if (HIDE[c]) delete HIDE[c]; else {
      if (Object.keys(CATS).filter(function (x) { return !HIDE[x]; }).length <= 1) { say('At least one category must stay visible.'); return; }
      HIDE[c] = 1;
    }
    build(); fillSelects();
    if (ST.kind === 'node' && !ON[ST.id] || ST.kind === 'trace' && (!ON[ST.a] || !ON[ST.b]) || ST.kind === 'edge' && (!ON[ALLE[ST.k].f] || !ON[ALLE[ST.k].t])) ST = { kind: null };
    if (ST.kind === 'loops') ST.pick = null;
    draw();
  });
  $('#chips').appendChild(b);
});
document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && ST.kind && !/INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) { ST = { kind: null }; apply(); } });

/* ---------- share and download ---------- */
function hash() {
  var a = [];
  if (ST.kind === 'node') { a.push('box=' + ST.id, 'view=' + ST.mode); if (ST.mode === 'effects' && DIR === -1) a.push('dir=down'); }
  else if (ST.kind === 'trace') { a.push('trace=' + ST.a + ',' + ST.b); if (DIR === -1) a.push('dir=down'); }
  else if (ST.kind === 'edge') a.push('arrow=' + ALLE[ST.k].f + ',' + ALLE[ST.k].t);
  else if (ST.kind === 'loops') a.push('loops');
  var h = Object.keys(HIDE); if (h.length) a.push('hide=' + h.join(','));
  if (DEPTH !== DEF_DEPTH) a.push('depth=' + DEPTH);
  try { history.replaceState(null, '', a.length ? '#' + a.join('&') : location.pathname + location.search); } catch (e) {}
}
function readHash() {
  var q = {};
  location.hash.replace(/^#/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : decodeURIComponent(kv.slice(i + 1)); });
  if (q.hide) q.hide.split(',').forEach(function (c) { if (CATS[c]) HIDE[c] = 1; });
  if (Object.keys(HIDE).length >= Object.keys(CATS).length) HIDE = {};
  if (q.depth && +q.depth >= 3 && +q.depth <= 8) DEPTH = +q.depth;
  if (q.dir === 'down') DIR = -1;
  build();
  if (q.box && ON[q.box]) ST = { kind: 'node', id: q.box, mode: ['effects', 'causes', 'direct'].indexOf(q.view) >= 0 ? q.view : 'effects' };
  else if (q.trace) { var t = q.trace.split(','); if (ON[t[0]] && ON[t[1]] && t[0] !== t[1]) ST = { kind: 'trace', a: t[0], b: t[1], pick: null }; }
  else if (q.arrow) { var r = q.arrow.split(','), e = ALLE.filter(function (x) { return x.f === r[0] && x.t === r[1]; })[0]; if (e && ON[e.f] && ON[e.t]) ST = { kind: 'edge', k: e.k }; }
  else if ('loops' in q) ST = { kind: 'loops', pick: null };
}
$('#share').addEventListener('click', function () {
  var url = location.href, done = function () { say('Link copied. It opens this exact view.'); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, function () { window.prompt('Copy this link:', url); });
  else window.prompt('Copy this link:', url);
});
$('#svgBtn').addEventListener('click', function () {
  var src = svg, cl = src.cloneNode(true), a = src.querySelectorAll('*'), b = cl.querySelectorAll('*');
  var props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'display'];
  for (var i = 0; i < a.length; i++) {
    var cs = getComputedStyle(a[i]), st = props.map(function (p) { var v = cs.getPropertyValue(p); return v ? p + ':' + v : ''; }).filter(Boolean).join(';');
    b[i].setAttribute('style', st);
    if (b[i].getAttribute('fill') && b[i].getAttribute('fill').indexOf('var(') === 0) b[i].setAttribute('fill', cs.getPropertyValue('fill'));
    if (b[i].getAttribute('stroke') && b[i].getAttribute('stroke').indexOf('var(') === 0) b[i].setAttribute('stroke', cs.getPropertyValue('stroke'));
  }
  var hits = cl.querySelector('.hits'); if (hits) hits.parentNode.removeChild(hits);
  $$('#ring marker path').forEach(function (p, i) { cl.querySelectorAll('marker path')[i].setAttribute('fill', getComputedStyle(p).getPropertyValue('fill')); });
  cl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  cl.removeAttribute('style'); cl.removeAttribute('class');
  var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', getComputedStyle(document.body).backgroundColor);
  cl.insertBefore(bg, cl.firstChild);
  var blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(cl)], { type: 'image/svg+xml' });
  var l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'soil-forest-cause-effect-map.svg';
  document.body.appendChild(l); l.click(); setTimeout(function () { URL.revokeObjectURL(l.href); l.remove(); }, 500);
  say('SVG of the current view downloaded.');
});

/* ---------- tables ---------- */
function stats() {
  $('#stats').innerHTML = '<span><b>' + ALLN.length + '</b>boxes</span><span><b>' + ALLE.length + '</b>arrows</span><span><b>' + Object.keys(REFS).length + '</b>sources</span><span><b>' + Object.keys(CATS).length + '</b>categories</span>';
}
function arrowTable() {
  var rows = ALLE.map(function (e) {
    var txt = (NM(e.f) + ' ' + NM(e.t) + ' ' + e.n + ' ' + (e.c || '') + ' ' + e.r.map(function (k) { return SHORT[k] || ''; }).join(' ')).toLowerCase();
    return '<tr data-k="' + e.k + '" data-txt="' + esc(txt) + '" style="cursor:pointer"><td>' + esc(NM(e.f)) + '</td><td class="sg"><span class="g ' + CLS(e.sv) + '">' + SGN(e.s) + '</span></td><td>' + esc(NM(e.t)) + '</td>' +
      '<td>' + esc(e.n) + (e.c ? '<br><small>Holds: ' + esc(e.c) + '</small>' : '') + '</td><td><small>' + refLinks(e.r) + '</small></td></tr>';
  });
  $('#atab tbody').innerHTML = rows.join('');
  var f = function () {
    var q = $('#afilter').value.trim().toLowerCase(), n = 0;
    $$('#atab tbody tr').forEach(function (r) { var ok = !q || q.split(/\s+/).every(function (w) { return r.dataset.txt.indexOf(w) >= 0; }); r.hidden = !ok; if (ok) n++; });
    $('#acount').textContent = n + ' of ' + ALLE.length + ' arrows';
  };
  $('#afilter').addEventListener('input', f); f();
  $('#atab tbody').addEventListener('click', function (ev) {
    if (ev.target.closest('a')) return;
    var r = ev.target.closest('tr'); if (!r) return;
    var e = ALLE[+r.dataset.k];
    if (!ON[e.f] || !ON[e.t]) { HIDE = {}; build(); fillSelects(); ST = { kind: 'edge', k: e.k }; draw(); }
    else selectEdge(e.k);
    $('#map').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
function refList() {
  var use = {};
  ALLE.forEach(function (e) { e.r.forEach(function (k) { use[k] = (use[k] || 0) + 1; }); });
  $('#reflist').innerHTML = Object.keys(REFS).sort(function (a, b) { return REFS[a].localeCompare(REFS[b]); }).map(function (k) {
    var title = (REFS[k].split(/\)\.\s/)[1] || '').split('. ')[0];
    return '<li id="ref-' + k + '">' + esc(REFS[k]) + ' <small>· ' + (use[k] || 0) + ' arrow' + (use[k] === 1 ? '' : 's') +
      (title ? ' · <a href="https://scholar.google.com/scholar?q=' + encodeURIComponent(title) + '" target="_blank" rel="noopener">find it</a>' : '') + '</small></li>';
  }).join('');
  var url = location.origin && location.origin !== 'null' ? location.origin + location.pathname : 'https://github.com/';
  $('#cite').textContent = 'Ramzan, W., Jameel, A. (' + new Date().getFullYear() + '). Soil–Forest Cause–Effect Map: an interactive map of causes and effects in temperate forest soils. ' + url;
}

/* links to sections scroll without replacing the view stored in the address */
document.addEventListener('click', function (ev) {
  var a = ev.target.closest && ev.target.closest('a[href^="#"]'); if (!a) return;
  var id = a.getAttribute('href').slice(1), el = id ? document.getElementById(id) : null;
  if (!id) { ev.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (el) { ev.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); if (el.tagName === 'LI') { el.style.background = 'var(--sel)'; setTimeout(function () { el.style.background = ''; }, 1600); } }
});
/* a view link pasted into an open tab */
window.addEventListener('hashchange', function () {
  HIDE = {}; DEPTH = DEF_DEPTH; DIR = 1; ST = { kind: null };
  readHash(); fillSelects(); draw();
});

/* ---------- start ---------- */
readHash();
fillSelects(); stats(); arrowTable(); refList();
draw();
var lastW = wrap.clientWidth, rt = null;
window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (Math.abs(wrap.clientWidth - lastW) > 30) { lastW = wrap.clientWidth; draw(); } }, 200); });
/* on narrow screens start with the middle of the ring in view */
if (wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2;
})();
