'use strict';
/* Pokerbot dashboard front end: plain JS, no build step. */

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = {
  st: null, rev: null, page: 'competition', round: null, roundId: '', bot: null, botVer: 'all', q: '',
  mode: { comp: 'bb', round: 'actual', bot: 'chips' },
};

// ------------------------------------------------------------------ icons
const I = {
  dots: '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E5261C" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  sync: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/></svg>',
  paste: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/></svg>',
  upload: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/></svg>',
  check: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 12 5 5L20 6"/></svg>',
  alert: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
  suits: [
    '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#9AAE23" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 2C9 6 4 9 4 13.5A4 4 0 0 0 11 16l-1.5 5h5L13 16a4 4 0 0 0 7-2.5C20 9 15 6 12 2z"/></svg>',
    '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#5B3FD9" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>',
    '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2E8B57" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l6.5 9-6.5 9-6.5-9z"/></svg>',
  ],
  sched: [
    '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5z"/>',
    '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 9 1.5 1.5L12 8"/><path d="M14 9.5h3"/><path d="m8 15 1.5 1.5L12 14"/><path d="M14 15.5h3"/>',
    '<path d="M4 7h16l-1.5 12a2 2 0 0 1-2 1.8h-9a2 2 0 0 1-2-1.8z"/><path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3"/>',
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M9 10v10"/>',
    '<ellipse cx="12" cy="12" rx="6.5" ry="3.5"/><circle cx="5" cy="5.5" r="1.3"/><circle cx="12" cy="4" r="1.3"/><circle cx="19" cy="5.5" r="1.3"/><circle cx="5" cy="18.5" r="1.3"/><circle cx="12" cy="20" r="1.3"/><circle cx="19" cy="18.5" r="1.3"/>',
  ],
};

// ------------------------------------------------------------------ formatting
const fmt = (n, d = 0) => (n == null || Number.isNaN(n)) ? '—' : Number(n).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
const sgn = (n, d = 0) => (n == null || Number.isNaN(n)) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n), d);
const kfmt = (n) => (n == null) ? '—' : Math.abs(n) >= 1000 ? sgn(n / 1000, 1) + 'k' : sgn(n);
const pct = (x) => (x == null) ? '—' : Math.round(x * 100) + '%';
const ord = (n) => { const s = ['th', 'st', 'nd', 'rd']; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const norm = (s) => String(s || '').trim().toLowerCase();
const hhmm = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toTimeString().slice(0, 5); };
function ago(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  const m = Math.round((Date.now() - d) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60); return h + 'h ' + (m % 60) + 'm ago';
}
function dur(ms) {
  if (ms <= 0) return 'now';
  const m = Math.round(ms / 60000); const h = Math.floor(m / 60);
  if (h >= 24) return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  return h ? h + 'h ' + (m % 60) + 'm' : m + 'm';
}
const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// ------------------------------------------------------------------ small components
const kpi = (title, big, pill, cap) => `
<section class="card kpi">
  <div class="card-h"><h2>${esc(title)}</h2><button class="dots" aria-label="More options for ${esc(title)}">${I.dots}</button></div>
  <div class="val"><span class="big">${big}</span>${pill || ''}</div>
  <p class="cap">${cap || '&nbsp;'}</p>
</section>`;
const pill = (txt, kind, icon) => `<span class="pill ${kind}">${icon ? (kind === 'green' ? I.check : I.alert) : ''}${esc(txt)}</span>`;
const cardHead = (title, right) => `<div class="card-h"><h2>${esc(title)}</h2>${right || `<button class="dots" aria-label="More options for ${esc(title)}">${I.dots}</button>`}</div>`;
const smallBtn = (label, act) => `<button class="btn sm" data-act="${act}">${I.plus}${esc(label)}</button>`;
const tabs = (chart, opts) => `<div class="tabs">${opts.map(([v, l]) => `<button class="tab ${S.mode[chart] === v ? 'on' : ''}" data-act="mode" data-chart="${chart}" data-val="${v}" aria-pressed="${S.mode[chart] === v}">${esc(l)}</button>`).join('')}</div>`;
const empty = (title, text, btn) => `<div class="empty"><h2>${esc(title)}</h2><p>${text}</p>${btn || ''}</div>`;

function playingCard(c, cls) {
  if (!c) return '';
  const suit = { s: '♠', h: '♥', d: '♦', c: '♣' }[c[1]] || c[1];
  const rank = c[0] === 'T' ? '10' : c[0];
  const red = c[1] === 'h' || c[1] === 'd';
  return `<span class="${cls} ${red ? 'redsuit' : ''}">${rank}${suit}</span>`;
}

// ------------------------------------------------------------------ chart
function niceStep(span, n) {
  const raw = span / n; const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}
function niceAxis(min, max, target = 4) {
  if (min === max) { min -= 1; max += 1; }
  const step = niceStep(max - min, target);
  const lo = Math.floor(min / step) * step; const hi = Math.ceil(max / step) * step;
  return { lo, hi, n: Math.max(1, Math.round((hi - lo) / step)) };
}
function chart(o) {
  const H = 170; const nt = o.nt || 4;
  const xs = o.xmax === o.xmin ? 1 : (o.xmax - o.xmin);
  const X = (x) => ((x - o.xmin) / xs) * 1000;
  const Y = (y) => { let t = (y - o.ymin) / ((o.ymax - o.ymin) || 1); t = Math.max(0, Math.min(1, t)); if (o.invert) t = 1 - t; return H - t * H; };
  const ticks = [];
  for (let i = 0; i <= nt; i++) { const v = o.ymax - (o.ymax - o.ymin) * i / nt; ticks.push(o.invert ? o.ymin + (o.ymax - o.ymin) * i / nt : v); }
  const grid = Array.from({ length: nt + 1 }, (_, i) => {
    const y = (H * i / nt).toFixed(1);
    const solid = i === nt || (o.zeroLine && Math.abs(Y(0) - y) < 0.5);
    return `<line x1="0" y1="${y}" x2="1000" y2="${y}" style="stroke:${solid ? 'var(--axis)' : 'var(--grid)'}" stroke-width="${solid ? 1.2 : 1}" ${solid ? '' : 'stroke-dasharray="5 5"'} vector-effect="non-scaling-stroke"/>`;
  }).join('');
  const lines = o.series.map((s) => {
    const segs = []; let cur = [];
    s.y.forEach((v, i) => {
      if (v == null) { if (cur.length) segs.push(cur); cur = []; return; }
      cur.push(X(s.x ? s.x[i] : i).toFixed(1) + ',' + Y(v).toFixed(1));
    });
    if (cur.length) segs.push(cur);
    return segs.map((pts) => `<polyline points="${pts.join(' ')}" fill="none" style="stroke:${s.color}" stroke-width="${s.width || 2}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`).join('');
  }).join('');
  const mk = (o.markers || []).map((m) => `<line x1="${X(m.x).toFixed(1)}" y1="0" x2="${X(m.x).toFixed(1)}" y2="${H}" style="stroke:var(--axis)" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>`).join('');
  const mkl = (o.markers || []).map((m) => `<span class="mk" style="left:${(X(m.x) / 10).toFixed(2)}%">${esc(m.label)}</span>`).join('');
  const dots = o.series.filter((s) => s.dot).map((s) => {
    let i = s.y.length - 1; while (i > 0 && s.y[i] == null) i--;
    if (s.y[i] == null) return '';
    const sz = s.dotSize || 10;
    return `<span class="dot" style="left:${(X(s.x ? s.x[i] : i) / 10).toFixed(2)}%;top:${(Y(s.y[i]) / H * 100).toFixed(2)}%;width:${sz}px;height:${sz}px;background:${s.color}"></span>`;
  }).join('');
  return `<div class="chart">
    <div class="yax">${ticks.map((t) => `<span>${esc(o.yfmt ? o.yfmt(t) : fmt(t))}</span>`).join('')}</div>
    <div class="pcol"><div class="plot"><svg viewBox="0 0 1000 ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(o.aria || 'Line chart')}">${grid}${mk}${lines}</svg>${mkl}${dots}</div>
    <div class="xax">${(o.xLabels || []).map((l) => `<span>${esc(l)}</span>`).join('')}</div></div></div>`;
}
const legend = (items) => `<div class="legend">${items.map(([c, l, dash]) => `<span><svg width="26" height="6" aria-hidden="true"><line x1="1" y1="3" x2="25" y2="3" style="stroke:${c}" stroke-width="2.5" ${dash ? 'stroke-dasharray="5 3"' : ''}/></svg>${esc(l)}</span>`).join('')}</div>`;
const spread = (arr, k) => { if (!arr.length) return []; if (arr.length <= k) return arr; return Array.from({ length: k }, (_, i) => arr[Math.round(i * (arr.length - 1) / (k - 1))]); };

function divRow(name, val, max, me, fmtv) {
  const w = max ? Math.min(100, Math.abs(val) / max * 100) : 0;
  const bar = `<span class="b" style="width:${w.toFixed(1)}%"></span>`;
  return `<div class="dv-row ${me ? 'me' : ''}"><span class="n" title="${esc(name)}">${esc(name)}${me ? ' · You' : ''}</span>
    <div class="l">${val < 0 ? bar : ''}</div><div class="rr">${val > 0 ? bar : ''}</div>
    <span class="v ${tone(val)}">${(fmtv || kfmt)(val)}</span></div>`;
}

// ------------------------------------------------------------------ API
async function api(path, opts) {
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok && r.status !== 404) throw new Error(j.error || ('HTTP ' + r.status));
  return r.status === 404 ? null : j;
}
function toast(msg, err) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), err ? 9000 : 5000);
}

async function refresh(force) {
  let st;
  try { st = await api('/api/state'); } catch (e) { return; }
  if (!force && S.st && st.rev === S.rev) { S.st = st; renderSide(); return; }
  S.st = st; S.rev = st.rev;
  await loadPage();
  render();
}
async function loadPage() {
  try {
    if (S.page === 'last-round') S.round = await api('/api/round?id=' + encodeURIComponent(S.roundId || ''));
    if (S.page === 'our-bot') S.bot = await api('/api/bot?version=' + encodeURIComponent(S.botVer));
  } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ sidebar
function stageNow(cfg) {
  const now = Date.now();
  const sch = (cfg.schedule || []).map((s) => ({ ...s, a: new Date(s.start).getTime(), b: new Date(s.end).getTime() }));
  const cur = sch.find((s) => s.a <= now && now <= s.b);
  const next = sch.find((s) => s.a > now);
  const open = (cfg.upload_windows || []).some(([a, b]) => new Date(a).getTime() <= now && now <= new Date(b).getTime());
  return { sch, cur, next, open, now };
}
function renderSide() {
  const st = S.st; if (!st) return;
  $('#teamName').textContent = st.team;
  const lb = st.bots[st.bots.length - 1];
  const lastSnap = (st.standings || []).slice(-1)[0];
  const meRow = lastSnap ? lastSnap.rows.find((r) => norm(r.team) === norm(st.team)) : null;
  $('#teamSub').textContent = meRow ? `Bot v${meRow.version} · #${meRow.rank} · ${sgn(meRow.bb100, 1)}` : lb ? `Bot v${lb.version} · Live` : 'No bot uploaded yet';
  const { sch, cur } = stageNow(st.config);
  $('#schedule').innerHTML = sch.map((s, i) => `<div class="nav" style="${s.b < Date.now() ? 'color:var(--faint)' : ''}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I.sched[i % 5]}</svg>${esc(s.name)}${cur === s ? '<span class="stage-dot" title="Live now"></span>' : ''}</div>`).join('');
  const ls = st.last_sync;
  const err = st.rounds_err || st.live_err;
  if (!('live_block' in st)) { $('#syncNote').innerHTML = '<b style="color:var(--red)">Old server still running.</b> Close its Terminal window, then double-click start.command.'; document.querySelectorAll('a.nav').forEach((a) => a.classList.toggle('active', a.dataset.page === S.page)); return; }
  $('#syncNote').textContent = err ? `Sync problem: ${err}` : !st.config.has_token ? 'Live standings on. Add your data token in Settings to pull hands automatically.'
    : ls ? `Auto-sync on · last ${hhmm(ls.at)} · ${(ls.messages || []).slice(-1)[0] || ''}` : 'Auto-sync on.';
  document.querySelectorAll('a.nav').forEach((a) => a.classList.toggle('active', a.dataset.page === S.page));
}

// ------------------------------------------------------------------ page: competition
function renderCompetition() {
  const st = S.st; const all = st.standings || []; const team = st.team;
  const lastAll = all[all.length - 1];
  const snaps = lastAll ? all.filter((s) => s.stage === lastAll.stage) : [];
  const latest = snaps[snaps.length - 1]; const prev = snaps.length > 1 ? snaps[snaps.length - 2] : null;
  const find = (snap, name) => snap ? snap.rows.find((r) => norm(r.team) === norm(name)) : null;
  const me = find(latest, team); const mePrev = find(prev, team);
  const head = `<div class="head"><div><h1>Competition</h1><p>${latest ? `${esc(latest.label)} · ${latest.source === 'live' ? 'live · ' : ''}${esc(hhmm(latest.at))}` : 'Waiting for standings'}</p></div>
    <div class="actions"><button class="btn" data-act="paste">${I.paste}Paste standings</button><button class="btn red" data-act="sync">${I.sync}Sync</button></div></div>`;

  // KPIs
  let k1, k2;
  if (me) {
    const mv = mePrev ? mePrev.rank - me.rank : null;
    k1 = kpi('Our Rank', '#' + me.rank, mePrev ? (mv > 0 ? pill('▲ ' + mv, 'green') : mv < 0 ? pill('▼ ' + (-mv), 'red') : pill('—', 'grey')) : prev ? pill('New', 'red') : pill('Live', 'grey'),
      `${sgn(me.bb100, 1)} bb/100 after ${me.rounds} round${me.rounds === 1 ? '' : 's'}`);
    const rows = latest.rows;
    if (me.rank === 1 && rows[1]) k2 = kpi('Lead over #2', sgn(me.bb100 - rows[1].bb100, 1), pill(me.rounds + ' rnd', 'green'), 'bb/100 ahead of ' + esc(rows[1].team));
    else if (rows[0]) k2 = kpi('Gap to #1', sgn(me.bb100 - rows[0].bb100, 1), pill(me.rounds + ' rnd', 'red'), 'bb/100 behind ' + esc(rows[0].team));
  } else {
    k1 = kpi('Our Rank', '—', '', latest ? `${esc(team)} not in the table yet` : 'Paste standings to see it');
    k2 = kpi('Lead over #2', '—', '', 'Needs standings');
  }
  const sn = stageNow(st.config);
  const lv = st.live; const lb2 = st.live_block;
  let k3;
  if (lv && lv.next_round && new Date(lv.next_round) > Date.now()) k3 = kpi('Next Round', dur(new Date(lv.next_round) - Date.now()), pill(lv.submissions_open ? 'Uploads open' : 'Closed', lv.submissions_open ? 'green' : 'red'), `${hhmm(lv.next_round)}${lb2 && lb2.total ? ` · round ${Math.min(lb2.total, (lb2.played || 0) + 1)} of ${lb2.total}` : ''}`);
  else if (sn.cur) k3 = kpi('Next Stage', dur(sn.cur.b - sn.now), pill(sn.open ? 'Open' : 'Closed', sn.open ? 'green' : 'red'), `${esc(sn.cur.name)} live · ends ${hhmm(sn.cur.end)}`);
  else if (sn.next) k3 = kpi('Next Stage', dur(sn.next.a - sn.now), pill(sn.open ? 'Open' : 'Closed', sn.open ? 'green' : 'red'), `${esc(sn.next.name)} · ${new Date(sn.next.a).toLocaleDateString('en-GB', { weekday: 'short' })} ${hhmm(sn.next.start)}`);
  else k3 = kpi('Next Stage', 'Done', '', 'Tournament finished');

  // rank race
  const hist = snaps.slice(-40);
  let race;
  if (hist.length) {
    const top = latest.rows.filter((r) => norm(r.team) !== norm(team)).slice(0, 4).map((r) => r.team);
    const names = top.concat(me ? [me.team] : []);
    const colors = ['var(--text)', '#666666', '#8A8A8A', '#ADADAD'];
    const dashes = [null, null, '7 5', '2 4'];
    const key = S.mode.comp === 'rank' ? 'rank' : 'bb100';
    const series = names.map((nm, i) => {
      const mine = me && nm === me.team;
      return { y: hist.map((s) => { const r = find(s, nm); return r ? r[key] : null; }), color: mine ? 'var(--orange)' : colors[i], width: mine ? 2.5 : 2, dash: mine ? null : dashes[i], dot: true, dotSize: mine ? 10 : 7 };
    });
    const all = series.flatMap((s) => s.y).filter((v) => v != null);
    let ymin, ymax;
    if (key === 'rank') { ymin = 1; ymax = Math.max(5, Math.ceil(Math.max(...all) / 4) * 4 + 1); }
    let nt = 4;
    if (key !== 'rank') { const ax = niceAxis(Math.min(0, ...all), Math.max(...all)); ymin = ax.lo; ymax = ax.hi; nt = ax.n; }
    const n = hist.length;
    race = chart({ series, nt, xmin: n === 1 ? -1 : 0, xmax: n === 1 ? 0 : n - 1, ymin, ymax, invert: key === 'rank', yfmt: key === 'rank' ? (v) => '#' + Math.round(v) : (v) => fmt(v), xLabels: spread(hist.map((s) => hhmm(s.at)), Math.min(n, 6)), aria: 'Standings over time for the top teams and us' })
      + legend(names.map((nm, i) => [series[i].color, nm, series[i].dash]));
  } else {
    race = empty('No standings yet', 'Paste the standings table after each round and this chart builds up.', '<button class="btn red" data-act="paste">' + I.paste + 'Paste standings</button>');
  }

  // leaderboard
  let lb = '';
  if (latest) {
    let rows = latest.rows;
    if (S.q) rows = rows.filter((r) => norm(r.team).includes(norm(S.q)));
    else { rows = rows.slice(0, 7); if (me && !rows.includes(me)) rows = rows.slice(0, 6).concat([me]); }
    lb = rows.map((r) => {
      const p = find(prev, r.team); const mine = me && r === me;
      let mv = '<span class="mv">—</span>';
      if (prev) { if (!p) mv = '<span class="mv new">New</span>'; else { const d = p.rank - r.rank; mv = d > 0 ? `<span class="mv up">▲ ${d}</span>` : d < 0 ? `<span class="mv">▼ ${-d}</span>` : mv; } }
      return `<div class="lb-row ${mine ? 'me' : ''}"><div style="min-width:0"><div class="t">${r.rank} · ${esc(r.team)}${mine ? ' · You' : ''}</div><div class="s">v${r.version} · ${r.rounds} round${r.rounds === 1 ? '' : 's'}${r.timeouts ? ` · ${r.timeouts} timeouts` : ''}</div></div>
        <div><span class="badge ${mine ? 'fill' : ''}">${fmt(r.bb100, 1)}</span></div>${mv}</div>`;
    }).join('') || '<p class="cap">No team matches the search.</p>';
  }
  const lbCard = `<section class="card" style="flex:1 1 340px">${cardHead('Leaderboard', smallBtn('Paste', 'paste'))}
    ${latest ? `<div class="lb-head"><span>Team</span><span>bb/100</span><span class="sort">${prev ? 'vs ' + esc(hhmm(prev.at)) : 'Move'}</span></div><div class="lb ${latest.rows.length >= 6 && !S.q ? 'spread' : ''}">${lb}</div>` : empty('Empty', 'No standings pasted yet.')}</section>`;

  // movers & uploads
  let movers = ''; let ups = ''; let climb = '—'; let topV = '—';
  if (latest && prev) {
    const ch = latest.rows.map((r) => { const p = find(prev, r.team); return p ? { r, d: p.rank - r.rank, p } : null; }).filter(Boolean);
    const mvs = ch.filter((c) => c.d !== 0).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 3);
    movers = mvs.map((c) => `<div class="mini"><div><div class="t">${esc(c.r.team)}</div><div class="s">#${c.p.rank} → #${c.r.rank}</div></div><span class="r" style="color:${c.d > 0 ? 'var(--green)' : 'var(--red-text)'}">${c.d > 0 ? '+' : '−'}${Math.abs(c.d)}</span></div>`).join('');
    const best = ch.reduce((m, c) => Math.max(m, c.d), 0); climb = best > 0 ? '+' + best : '0';
    const u = ch.filter((c) => c.r.version > c.p.version).sort((a, b) => (b.r.version - b.p.version) - (a.r.version - a.p.version)).slice(0, 3);
    ups = u.map((c) => `<div class="mini"><div style="min-width:0"><div class="t">${esc(c.r.team)}</div><div class="s">${c.r.version - c.p.version} new upload${c.r.version - c.p.version === 1 ? '' : 's'}</div></div><span class="r">v${c.p.version} → v${c.r.version}</span></div>`).join('');
  }
  if (latest) topV = 'v' + Math.max(...latest.rows.map((r) => r.version));
  const movCard = `<section class="card" style="flex:1 1 420px">${cardHead('Movers & Uploads', smallBtn('Watch', 'paste'))}
    <div class="two"><div>${movers || '<p class="cap">Needs two standings pastes.</p>'}<div class="foot"><span class="l">Biggest Climb</span><span class="v">${climb}</span></div></div>
    <div>${ups || '<p class="cap">No new uploads spotted.</p>'}<div class="foot"><span class="l">Top Version</span><span class="v">${topV}</span></div></div></div></section>`;

  // predicted Sunday table
  let pred = '';
  if (latest && me) {
    const T = Math.max(1, Number(st.config.sunday_tables) || 4);
    const mates = latest.rows.filter((r) => r !== me && (r.rank - 1) % T === (me.rank - 1) % T).slice(0, 3);
    pred = mates.map((r, i) => {
      const sc = st.scouting[r.team];
      return `<div class="pred">${I.suits[i % 3]}<div style="flex:1;min-width:0"><div class="t">${esc(r.team)}</div><div class="s">#${r.rank} · v${r.version}${sc && sc.style !== 'Unknown' ? ' · ' + esc(sc.style) : ''}</div></div>
        ${sc && sc.hands ? pill('Scouted · ' + fmt(sc.hands), 'green', true) : pill('Not scouted', 'red', true)}<span class="r">${sgn(r.bb100, 1)}</span></div>`;
    }).join('');
  }
  const predCard = `<section class="card" style="flex:1 1 420px">${cardHead('Predicted Sunday Table', smallBtn('Tables', 'settings'))}
    ${pred ? `<div style="margin-top:6px">${pred}</div>` : `<p class="cap" style="margin-top:12px">${me ? 'No tablemates yet: needs more teams in the standings than Sunday tables.' : 'Needs standings that include ' + esc(team) + '.'}</p>`}</section>`;

  return `${head}
  <div class="row fill"><div style="flex:1.8 1 560px;min-width:0;display:flex;flex-direction:column;gap:24px">
    <div class="row">${k1}${k2}${k3}</div>
    <section class="card" style="flex:1">${cardHead('Rank Race')}${hist.length ? tabs('comp', [['bb', 'bb/100'], ['rank', 'Rank']]) : ''}${race}</section>
  </div>${lbCard}</div>
  <div class="row">${movCard}${predCard}</div>`;
}

// ------------------------------------------------------------------ page: last round
function renderRound() {
  const st = S.st; const r = S.round;
  const rounds = st.rounds.slice().reverse();
  const sel = rounds.length ? `<label class="vis-hidden" for="roundSel">Round</label><select id="roundSel" class="select lg">${rounds.map((x) => `<option value="${esc(x.id)}" ${r && x.id === r.id ? 'selected' : ''}>${esc(x.label)} · ${kfmt(x.result)}</option>`).join('')}</select>` : '';
  const head = `<div class="head"><div><h1>Last Round</h1><p>${r ? `${esc(r.label)} · ${fmt(r.hands)} hands${r.version ? ' · v' + r.version : ''}` : 'Upload a hands file to start'}</p></div>
    <div class="actions">${sel}<button class="btn red" data-act="upload">${I.upload}Upload hands</button></div></div>`;
  if (!r) return head + `<section class="card">${empty('No rounds yet', 'Drop a hands <b>.json</b> from fetch_hands.py anywhere on this page, or put it in the <b>inbox</b> folder.', `<button class="btn red" data-act="upload">${I.upload}Upload hands</button>`)}</section>`;

  const seat = r.seat; const n = r.players.length;
  const order = r.totals.map((t, i) => i).sort((a, b) => r.totals[b] - r.totals[a]);
  const second = order.find((i) => i !== seat);
  const gap = r.finish === 1 ? r.totals[seat] - r.totals[second] : r.totals[order[0]] - r.totals[seat];
  const sd = r.showdowns; const wsd = sd.went ? sd.won / sd.went : null;
  const dW = wsd != null && sd.table_wsd != null ? wsd - sd.table_wsd : null;
  const luckPill = r.luck > 400 ? pill('Hot', 'red') : r.luck < -400 ? pill('Cold', 'green') : pill('Even', 'grey');
  const k = [
    kpi('Result', kfmt(r.result), pill(sgn(r.bb100, 1), r.result >= 0 ? 'green' : 'red'), `chips · ${sgn(r.bb100, 1)} bb/100`),
    kpi('Finish', ord(r.finish), pill('of ' + n, r.finish <= 2 ? 'green' : 'red'), r.finish === 1 ? `${kfmt(gap)} ahead of 2nd` : `${fmt(gap)} chips behind 1st`),
    kpi('Showdowns', pct(wsd), dW != null ? pill(sgn(Math.round(dW * 100)) + '%', dW >= 0 ? 'green' : 'red') : '', `${sd.won} of ${sd.went} won`),
    kpi('Luck', kfmt(r.luck), luckPill, `vs all-in EV · ${r.allin_hands} all-in${r.allin_hands === 1 ? '' : 's'}`),
  ].join('');

  // chart
  const src = S.mode.round === 'luck' ? r.cum_ev : r.cum;
  const leader = order.find((i) => i !== seat);
  let mx = 1000; src.forEach((s) => s.forEach((v) => { if (Math.abs(v) > mx) mx = Math.abs(v); }));
  const step = niceStep(mx, 2); const lim = Math.ceil(mx / step) * step;
  const series = r.players.map((p, i) => ({ x: r.cum_x, y: src[i], color: i === seat ? 'var(--orange)' : i === leader ? 'var(--text)' : 'var(--other)', width: i === seat ? 3 : i === leader ? 2 : 1.5, dot: i === seat }));
  series.push(series.splice(seat, 1)[0]);
  const ch = chart({ series, xmin: 0, xmax: r.hands, ymin: -lim, ymax: lim, zeroLine: true, yfmt: (v) => kfmt(v), xLabels: ['H0', 'H' + Math.round(r.hands / 4), 'H' + Math.round(r.hands / 2), 'H' + Math.round(r.hands * 3 / 4), 'H' + r.hands],
    markers: r.key_hands.map((h) => ({ x: h.n, label: '#' + h.n })), aria: 'Chips per seat across the round, ours in orange, key hands marked' });
  const chartCard = `<section class="card" style="flex:1.8 1 560px">${cardHead('Chips')}${tabs('round', [['actual', 'Actual'], ['luck', 'Luck-adjusted']])}${ch}
    ${legend([['var(--orange)', r.team], ['var(--text)', r.players[leader]], ['var(--other)', 'Other seats']])}</section>`;

  const maxT = Math.max(...r.totals.map(Math.abs), 1);
  const table = `<section class="card" style="flex:1 1 340px">${cardHead('Table')}
    <div class="lb-head" style="grid-template-columns:150px 1fr 62px"><span>Seat</span><span style="text-align:center">Lost · Won</span><span style="text-align:right">Chips</span></div>
    <div class="dv">${order.map((i) => divRow(r.players[i], r.totals[i], maxT, i === seat)).join('')}</div></section>`;

  const hands = r.key_hands.map((h) => `<article class="hand">
      <div class="top"><span class="no">#${h.n}</span>${pill(h.tag, h.tone === 'good' ? 'green' : 'red', true)}</div>
      <div class="mid">${(h.hole || []).map((c) => playingCard(c, 'pc')).join('')}<span class="amt ${tone(h.r)}">${sgn(h.r)}</span></div>
      <div class="boardrow">${(h.board || []).map((c) => playingCard(c, 'bc')).join('') || '<span class="desc">No board: ended pre-flop</span>'}</div>
      <div class="desc">${esc(h.desc)}</div></article>`).join('');
  const keyCard = `<section class="card" style="flex:1.8 1 560px">${cardHead('Key Hands')}<div class="hands">${hands}</div></section>`;

  const tr = Object.entries(r.transfers).sort((a, b) => b[1] - a[1]);
  const maxF = Math.max(...tr.map(([, v]) => Math.abs(v)), 1);
  const won = tr.filter(([, v]) => v > 0).reduce((s, [, v]) => s + v, 0);
  const lost = -tr.filter(([, v]) => v < 0).reduce((s, [, v]) => s + v, 0);
  const paid = `<section class="card" style="flex:1 1 340px">${cardHead('Who Paid Us')}
    <div class="dv" style="margin-top:8px">${tr.map(([nm, v]) => divRow(nm, v, maxF, false)).join('')}</div>
    <div class="foot" style="border-top:1px solid var(--soft);margin-top:10px;padding-top:10px"><span class="l">Won ${fmt(won)} · Lost ${fmt(lost)}</span><span class="v">${kfmt(r.result)}</span></div></section>`;

  return `${head}<div class="row">${k}</div><div class="row fill">${chartCard}${table}</div><div class="row fill">${keyCard}${paid}</div>`;
}

// ------------------------------------------------------------------ page: our bot
function renderBot() {
  const st = S.st; const b = S.bot || {}; const agg = b.agg; const bot = b.bot;
  const latestV = st.bots.length ? st.bots[st.bots.length - 1].version : null;
  const vers = Array.from(new Set(st.rounds.map((x) => x.version).filter((v) => v != null))).sort((a, b) => b - a);
  const sel = `<label class="vis-hidden" for="verSel">Version</label><select id="verSel" class="select lg"><option value="all">All versions</option>${vers.map((v) => `<option value="${v}" ${String(S.botVer) === String(v) ? 'selected' : ''}>v${v} · ${st.rounds.filter((x) => x.version === v).length} rounds</option>`).join('')}</select>`;
  const lastAll = (st.standings || []).slice(-1)[0];
  const meLive = lastAll ? lastAll.rows.find((r) => norm(r.team) === norm(st.team)) : null;
  const head = `<div class="head"><div><h1>Our Bot</h1><p>${S.botVer !== 'all' ? `v${esc(S.botVer)}` : meLive ? `Live v${meLive.version}` : bot ? `v${bot.version}` : 'No bot yet'}${agg ? ` · ${agg.rounds} round${agg.rounds === 1 ? '' : 's'} · ${fmt(agg.hands)} hands` : ''}</p></div>
    <div class="actions">${sel}<button class="btn red" data-act="upload">${I.upload}Upload bot</button></div></div>`;

  // health
  let health;
  if (bot) {
    const c = bot.checks; const kb = c.size / 1024;
    const okStd = !c.non_stdlib.length; const okIO = !c.risky.length && !c.file_io;
    const row = (label, ok, why) => `<div class="check"><span>${esc(label)}</span>${ok ? pill('OK', 'green', true) : pill(why || 'Fix', 'red', true)}</div>`;
    health = `<section class="card" style="flex:1 1 300px;max-width:400px;gap:14px;justify-content:space-between">${cardHead('Bot Health')}
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span style="font-size:16px;font-weight:600">${esc(bot.filename)} · v${bot.version}</span>${bot.version === latestV ? pill('Live', 'green') : pill('Archived', 'grey')}<span style="font-size:13px;color:var(--muted)">${esc(ago(bot.uploaded_at))}</span></div>
      ${c.title ? `<p style="font-size:13px;color:var(--muted);line-height:1.4">${esc(c.title)}</p>` : ''}
      <div class="meter"><div class="lab"><span>File size</span><span>${fmt(kb, 0)} / 200 KB</span></div><div class="track"><div style="width:${Math.min(100, kb / 2).toFixed(1)}%;${kb > 200 ? 'background:var(--red)' : ''}"></div></div></div>
      <div class="checks">${row('Python syntax', c.syntax, c.error || 'Error')}${row('class Agent with act()', c.agent && c.act, 'Missing')}${row('Standard library only', okStd, c.non_stdlib.join(', '))}${row('No files or network', okIO, (c.risky.concat(c.file_io ? ['open()'] : [])).join(', '))}</div>
      ${meLive && meLive.timeouts != null ? `<div class="counts"><div><div class="n">${fmt(meLive.timeouts)}</div><div class="l">Timeouts</div></div><div><div class="n">${fmt(meLive.errors || 0)}</div><div class="l">Errors</div></div><div><div class="n">${fmt(meLive.bank_out || 0)}</div><div class="l">Bank-outs</div></div></div>
      <p style="font-size:13px;color:var(--muted);margin-top:-6px">Live on the site: v${meLive.version} · ${esc(lastAll.label)}${st.live && st.live.limits ? ` · timeout = over ${st.live.limits.decision_ms} ms` : ''}</p>`
      : `<div class="counts"><div><div class="n">${st.bots.length}</div><div class="l">Versions</div></div><div><div class="n">${agg ? agg.rounds : 0}</div><div class="l">Rounds</div></div><div><div class="n">${agg ? kfmt(agg.hands).replace('+', '') : 0}</div><div class="l">Hands</div></div></div>`}</section>`;
  } else {
    health = `<section class="card" style="flex:1 1 300px;max-width:400px">${cardHead('Bot Health')}${empty('No bot yet', 'Drop <b>bot.py</b> on the page to save it as v1.', `<button class="btn red" data-act="upload">${I.upload}Upload bot</button>`)}</section>`;
  }

  if (!agg) {
    return `${head}<div class="row fill">${health}<section class="card" style="flex:3 1 560px">${cardHead('Performance')}${empty('No hands for this version', 'Upload hands files from rounds this version played.', `<button class="btn red" data-act="upload">${I.upload}Upload hands</button>`)}</section></div>`;
  }

  // performance
  const small = agg.hands < 5000;
  const kp = `<div class="perf-kpis">
    <div><div class="l">bb/100</div><div style="display:flex;align-items:center;gap:10px"><span class="big">${sgn(agg.bb100, 1)}</span>${pill(sgn(agg.bb100 + 19, 0) + ' vs fold', agg.bb100 + 19 >= 0 ? 'green' : 'red')}</div></div>
    <div><div class="l">Chips</div><div class="mid">${sgn(agg.chips)}</div></div>
    <div><div class="l">Luck-adjusted</div><div style="display:flex;align-items:center;gap:8px"><span class="mid">${sgn(agg.adj100, 1)}</span>${pill(kfmt(agg.hands).replace('+', '') + ' hands', small ? 'red' : 'green')}</div></div></div>`;
  let ch;
  if (S.mode.bot === 'bb') {
    const pr = agg.per_round; const all = pr.flatMap((p) => [p.bb100, p.adj100]);
    const ax = niceAxis(Math.min(0, ...all), Math.max(0, ...all));
    const n = pr.length;
    ch = chart({ series: [{ y: pr.map((p) => p.adj100), color: '#6B6B6B', width: 2, dash: '6 5' }, { y: pr.map((p) => p.bb100), color: 'var(--orange)', width: 3, dot: true }],
      nt: ax.n, xmin: n === 1 ? -1 : 0, xmax: n === 1 ? 0 : n - 1, ymin: ax.lo, ymax: ax.hi, zeroLine: true, yfmt: (v) => fmt(v), xLabels: spread(pr.map((p) => p.label), Math.min(n, 6)), aria: 'bb/100 per round, actual against luck-adjusted' });
  } else {
    const all = agg.cum.concat(agg.cum_adj);
    const ax = niceAxis(Math.min(...all, 0), Math.max(...all, 1000));
    const H = agg.hands;
    ch = chart({ series: [{ x: agg.cum_x, y: agg.cum_adj, color: '#6B6B6B', width: 2, dash: '6 5' }, { x: agg.cum_x, y: agg.cum, color: 'var(--orange)', width: 3, dot: true }],
      nt: ax.n, xmin: 0, xmax: H, ymin: ax.lo, ymax: ax.hi, zeroLine: ax.lo < 0, yfmt: (v) => kfmt(v).replace('+', ''), markers: agg.markers.map((m) => ({ x: m.x, label: m.label })),
      xLabels: [0, 0.25, 0.5, 0.75, 1].map((f) => 'H' + fmt(Math.round(H * f))), aria: 'Cumulative chips over all hands, actual against luck-adjusted, version uploads marked' });
  }
  const perf = `<section class="card" style="flex:3 1 560px">${cardHead('Performance')}${kp}${tabs('bot', [['chips', 'Chips'], ['bb', 'bb/100 per round']])}${ch}
    ${legend([['var(--orange)', 'Actual'], ['#6B6B6B', 'Luck-adjusted', true]])}</section>`;

  // seats
  const ps = agg.positions; const vals = ps.map((p) => p.bb100);
  const bi = vals.indexOf(Math.max(...vals)); const wi = vals.indexOf(Math.min(...vals));
  const seats = `<section class="card" style="flex:1.2 1 400px">${cardHead('By Seat', '<span style="font-size:13px;color:var(--muted)">bb/100</span>')}
    <div class="seats">${ps.map((p, i) => `<div class="seat ${i === bi ? 'best' : i === wi ? 'worst' : ''}"><div class="p">${esc(p.pos)}${i === bi ? ' · best' : i === wi ? ' · worst' : ''}</div><div class="v ${tone(p.bb100)}">${sgn(p.bb100, 0)}</div></div>`).join('')}</div>
    <div class="streets">${agg.streets.map((s) => `<span>${esc({ preflop: 'Pre', flop: 'Flop', turn: 'Turn', river: 'River' }[s.street])} <b class="${tone(s.bb100)}">${sgn(s.bb100, 0)}</b></span>`).join('')}</div></section>`;

  // style
  const ms = [['VPIP', 'vpip'], ['PFR', 'pfr'], ['3-Bet', 'tb'], ['Fold to c-bet', 'fcb'], ['Went to showdown', 'wtsd'], ['Won at showdown', 'wsd']];
  const so = agg.style; const ta = agg.table_style;
  const flag = (k) => {
    const a = so[k]; const t = ta[k]; if (a == null || t == null) return '';
    if (k === 'fcb' && a > t + 0.08) return pill('Leak', 'red', true);
    if (k === 'wsd' && a < t - 0.08) return pill('Leak', 'red', true);
    if (k === 'vpip' && a > t + 0.1) return pill('Loose', 'red', true);
    return '';
  };
  const style = `<section class="card" style="flex:1 1 320px">${cardHead('Style')}
    <div class="legend" style="margin-top:6px"><span><span style="width:16px;height:8px;border-radius:4px;background:var(--text)"></span>Us</span><span><span style="width:3px;height:14px;border-radius:1px;background:var(--red)"></span>Table avg</span></div>
    <div class="bars">${ms.map(([l, k2]) => `<div class="bar"><div class="lab"><span style="display:inline-flex;align-items:center;gap:8px">${esc(l)}${flag(k2)}</span><b>${pct(so[k2])}</b></div>
      <div class="tr"><div style="width:${((so[k2] || 0) * 100).toFixed(1)}%"></div>${ta[k2] != null ? `<span class="tick" style="left:${(ta[k2] * 100).toFixed(1)}%" title="Table ${pct(ta[k2])}"></span>` : ''}</div></div>`).join('')}</div></section>`;

  // vs teams
  const vs = agg.vs.slice(0, 7);
  const vsCard = `<section class="card" style="flex:1 1 320px">${cardHead('Vs Teams', `<span style="font-size:13px;color:var(--muted)">${agg.vs.length} teams</span>`)}
    <div class="vs-head"><span>Team</span><span>bb/100</span></div>
    <div class="vs">${vs.map((v) => `<div class="vs-row"><div style="min-width:0"><div class="t">${esc(v.team)}</div><div class="s">${v.rounds} round${v.rounds === 1 ? '' : 's'} · ${kfmt(v.chips)}</div></div><span class="badge ${v.bb100 < 0 ? 'neg' : ''}">${sgn(v.bb100, 1)}</span></div>`).join('')}</div></section>`;

  return `${head}<div class="row fill">${health}${perf}</div><div class="row fill">${seats}${style}${vsCard}</div>`;
}

// ------------------------------------------------------------------ render + events
function render() {
  if (!S.st) return;
  renderSide();
  const v = $('#view');
  v.innerHTML = S.page === 'last-round' ? renderRound() : S.page === 'our-bot' ? renderBot() : renderCompetition();
}
async function go(page) {
  S.page = ['competition', 'last-round', 'our-bot'].includes(page) ? page : 'competition';
  await loadPage(); render();
}
window.addEventListener('hashchange', () => go(location.hash.slice(1)));

async function uploadFiles(files) {
  let sawHands = false;
  for (const f of files) {
    try {
      const text = await f.text();
      const res = await fetch('/api/upload', { method: 'POST', headers: { 'X-Filename': f.name, 'Content-Type': 'text/plain; charset=utf-8' }, body: text });
      const j = await res.json();
      if (!res.ok || j.ok === false) throw new Error(j.error || 'Upload failed');
      toast(`${f.name}: ${j.message || 'saved'}`);
      if (f.name.endsWith('.json')) sawHands = j.id || true;
    } catch (e) { toast(`${f.name}: ${e.message}`, true); }
  }
  if (sawHands) { S.roundId = typeof sawHands === 'string' ? sawHands : ''; }
  await refresh(true);
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act], [data-close]');
  if (!t) return;
  if (t.hasAttribute('data-close')) { t.closest('.modal').classList.remove('on'); return; }
  const act = t.dataset.act;
  if (act === 'mode') { S.mode[t.dataset.chart] = t.dataset.val; render(); }
  else if (act === 'paste') { $('#standingsModal').classList.add('on'); $('#stText').focus(); }
  else if (act === 'upload') { $('#fileInput').click(); }
  else if (act === 'settings') { openSettings(); }
  else if (act === 'sync') {
    t.disabled = true;
    try {
      const r = await api('/api/sync', { method: 'POST' });
      if (!('live_block' in S.st)) toast('The old dashboard server is still running, so Sync cannot reach the website yet. Close its Terminal window and double-click start.command.', true);
      else (r.messages || []).slice(-4).forEach((m) => toast(m, !r.ok));
    } catch (err) { toast(err.message, true); }
    t.disabled = false; await refresh(true);
  }
});
document.addEventListener('change', async (e) => {
  if (e.target.id === 'roundSel') { S.roundId = e.target.value; await loadPage(); render(); }
  if (e.target.id === 'verSel') { S.botVer = e.target.value; await loadPage(); render(); }
});
$('#fileInput').addEventListener('change', (e) => { const f = Array.from(e.target.files); e.target.value = ''; if (f.length) uploadFiles(f); });
$('#q').addEventListener('input', (e) => { S.q = e.target.value; if (S.page === 'competition') render(); });

$('#stSave').addEventListener('click', async () => {
  const text = $('#stText').value;
  try {
    const r = await api('/api/standings', { method: 'POST', body: text });
    if (!r || r.ok === false) throw new Error((r && r.error) || 'Could not read standings');
    toast(r.message); $('#stText').value = ''; $('#standingsModal').classList.remove('on'); await refresh(true);
  } catch (e) { toast(e.message, true); }
});
function openSettings() {
  const c = S.st.config;
  $('#cfgToken').value = '';
  $('#cfgTokenNote').textContent = c.has_token ? 'A token is saved. Leave the box empty to keep it.' : 'No token saved yet.';
  $('#cfgRounds').value = c.rounds_poll_minutes || 2; $('#cfgTables').value = c.sunday_tables || 4;
  $('#settingsModal').classList.add('on');
}
$('#settingsBtn').addEventListener('click', openSettings);
$('#cfgSave').addEventListener('click', async () => {
  try {
    const body = { rounds_poll_minutes: Number($('#cfgRounds').value) || 2, sunday_tables: Number($('#cfgTables').value) || 4 };
    const tok = $('#cfgToken').value.trim(); if (tok) body.data_token = tok;
    await api('/api/config', { method: 'POST', body: JSON.stringify(body) });
    $('#settingsModal').classList.remove('on'); toast(tok ? 'Token saved. Pulling your rounds…' : 'Settings saved.');
    if (tok) { const r = await api('/api/sync', { method: 'POST' }); (r.messages || []).slice(-4).forEach((m) => toast(m, !r.ok)); }
    await refresh(true);
  } catch (e) { toast(e.message, true); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.modal.on').forEach((m) => m.classList.remove('on')); });

// drag & drop anywhere
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) { dragDepth++; $('#drop').classList.add('on'); } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop').classList.remove('on'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; $('#drop').classList.remove('on'); const f = Array.from(e.dataTransfer.files || []); if (f.length) uploadFiles(f); });
// paste standings straight onto the page
document.addEventListener('paste', async (e) => {
  if (e.target.closest('input, textarea')) return;
  const text = e.clipboardData.getData('text');
  if (!text || text.length < 40) return;
  try { const r = await api('/api/standings', { method: 'POST', body: text }); if (r && r.ok !== false) { toast(r.message); await refresh(true); } } catch (err) { /* not standings */ }
});

// dark mode
try { if (localStorage.getItem('pd-dark') === '1') document.body.classList.add('dark'); } catch (e) { /* storage blocked */ }
$('#darkBtn').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  try { localStorage.setItem('pd-dark', document.body.classList.contains('dark') ? '1' : '0'); } catch (e) { /* ignore */ }
  $('#darkBtn span').textContent = document.body.classList.contains('dark') ? 'Light Mode' : 'Dark Mode';
});

// boot + auto refresh
S.page = location.hash.slice(1) || 'competition';
refresh(true);
setInterval(() => refresh(false), 10000);
setInterval(() => { if (S.page === 'competition') render(); }, 60000);
