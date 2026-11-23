'use strict';
/* Launch Radar: renders window.RADAR (written by main.ts beside this page) with no network.
   Views: the board (model, filters, sandbox, table, live tokens) and one detail view per
   protocol, routed by the location hash: '' is the board, '#/p/<slug>' is a protocol. */

const R = window.RADAR;
const app = document.getElementById('app');
const state = { q: '', category: '', chain: '', set: 'all', sort: 'rank', momW: R.model.momentum_weight, tenR: R.model.tenure_range };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const commas = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const money = (n) => {
  if (n === null || n === undefined) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + commas(n);
};
const pct = (n) => (n === null || n === undefined ? '<span class="flat">n/a</span>' : `<span class="${n > 0 ? 'up' : n < 0 ? 'down' : 'flat'}">${n > 0 ? '+' : ''}${n.toFixed(1)}%</span>`);
const ageText = (d) => (d === null ? 'unknown' : d >= 730 ? `${(d / 365).toFixed(1)}y` : `${d}d`);
const mult = (n) => 'x' + n.toFixed(3).replace(/0$/, '');

/* The sandbox's implied value: the filed board's arithmetic with two weights exchanged. */
function sandboxImplied(row) {
  const g = Math.max(R.model.momentum_floor, Math.min(R.model.momentum_cap, row.change_7d ?? 0));
  const mom = 1 + (g / 100) * state.momW;
  const ten = row.age_days === null ? 1 : (1 - state.tenR / 2) + state.tenR * (Math.min(row.age_days, R.model.tenure_days) / R.model.tenure_days);
  return Math.max(1, Math.round(row.base_usd * mom * ten * row.breadth));
}
const implied = (row) => (state.momW === R.model.momentum_weight && state.tenR === R.model.tenure_range ? row.implied_value_usd : sandboxImplied(row));

function header() {
  document.getElementById('stats').innerHTML = [
    [commas(R.scanned), 'protocols scanned'],
    [commas(R.board_size), 'pre-token ranked'],
    [`${R.watchlist_size} / ${R.watchlist_size}`, 'watchlist covered'],
    [commas(R.tokenized), 'already trading'],
    [esc(R.as_of), 'snapshot date'],
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');
  document.getElementById('foot').innerHTML =
    `<p>Data: ${esc(R.source)}. Every figure on this page is computed from that sealed snapshot by the model stated above; nothing is fetched and nothing is a promise that any protocol will issue a token.</p>` +
    `<p>Implied value is this radar's own claim: the value a launch would carry if it priced like the tokenized peers of its category. "Records no token" is what the snapshot says — say that, never that a protocol has none.</p>`;
}

function modelSection() {
  const m = R.model;
  const cats = R.categories.filter((c) => c.peers > 0).slice(0, 14);
  return `<section><h2>How the ranking works</h2>
  <p class="sub">A protocol's implied value is its TVL priced at the rate the market already pays for the tokenized
  protocols of its category, adjusted for its week, its track record and its spread across chains. No name is
  special-cased: one function scores every row, and each row's detail view shows its own arithmetic.</p>
  <div class="formula"><b>implied</b> = TVL x <b>peer ratio</b> x <b>momentum</b> x <b>tenure</b> x <b>breadth</b></div>
  <div class="model-grid">
    <div class="panel"><h3>The model (${esc(R.model_version)})</h3><table class="kv">
      <tr><td>Peer ratio</td><td>Median market-cap / TVL of the category's tokenized peers, each winsorized to [${m.ratio_floor}, ${m.ratio_cap}] and shrunk toward the market median of ${R.global_ratio} with a prior of ${m.shrink_prior} peers. A category with no tokenized peer uses the market median.</td></tr>
      <tr><td>Momentum</td><td>1 + clamp(7-day TVL change, ${m.momentum_floor}%, +${m.momentum_cap}%) x ${m.momentum_weight}. Growth is worth more; one wild week cannot double a launch.</td></tr>
      <tr><td>Tenure</td><td>${m.tenure_floor} + ${m.tenure_range} x min(age, ${commas(m.tenure_days)} days) / ${commas(m.tenure_days)}. Years at size with no token is a track record. No listing date: 1.000, no credit, no penalty.</td></tr>
      <tr><td>Breadth</td><td>1 + ${m.chain_step} per extra chain, up to +${(m.chain_step * m.chain_max_extra).toFixed(2)}. TVL on several chains is harder to fake.</td></tr>
      <tr><td>The board</td><td>All ${R.watchlist_size} watchlist protocols, plus ${R.early_size} early candidates that pass the watchlist's own screen (no wrapped, staked or bridged products, no exchange house brands, no versioned pools) at any TVL.</td></tr>
    </table></div>
    <div class="panel"><h3>What the market pays per $1 of TVL</h3><table class="kv">
      ${cats.map((c) => `<tr><td>${esc(c.category)}</td><td class="num">${c.ratio.toFixed(3)} from ${c.peers} tokenized peer${c.peers === 1 ? '' : 's'}</td></tr>`).join('')}
    </table></div>
  </div></section>`;
}

function controls() {
  const cats = [...new Set(R.rows.map((r) => r.category ?? 'Uncategorised'))].sort();
  const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
  const sel = (id, label, options, value) =>
    `<label>${label}<select id="${id}">${options.map((o) => `<option value="${esc(o[0])}"${o[0] === value ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
  return `<div class="controls">
    <label>Search<input type="search" id="q" placeholder="Name or slug" value="${esc(state.q)}"></label>
    ${sel('fcat', 'Category', [['', 'All categories'], ...cats.map((c) => [c, c])], state.category)}
    ${sel('fchain', 'Chain', [['', 'All chains'], ...chains.map((c) => [c, c])], state.chain)}
    ${sel('fset', 'Set', [['all', 'Whole board'], ['watchlist', 'Watchlist only'], ['early', 'Early only']], state.set)}
    ${sel('fsort', 'Sort by', [['rank', 'Implied value'], ['tvl', 'TVL'], ['change', '7-day change'], ['age', 'Track record'], ['name', 'Name']], state.sort)}
    <span class="count" id="count"></span>
  </div>
  <div class="sandbox"><span>Model sandbox:</span>
    <label>Momentum weight <input type="range" id="smom" min="0" max="1" step="0.05" value="${state.momW}"> <b class="num" id="smomv">${state.momW.toFixed(2)}</b></label>
    <label>Tenure range <input type="range" id="sten" min="0" max="0.6" step="0.05" value="${state.tenR}"> <b class="num" id="stenv">${state.tenR.toFixed(2)}</b></label>
    <span id="swarn"></span><button id="sreset" type="button">Reset to the filed model</button>
  </div>`;
}

function visibleRows() {
  let rows = R.rows.filter((r) =>
    (state.set === 'all' || (state.set === 'watchlist') === r.watchlist) &&
    (state.category === '' || (r.category ?? 'Uncategorised') === state.category) &&
    (state.chain === '' || r.chains.includes(state.chain)) &&
    (state.q === '' || r.name.toLowerCase().includes(state.q) || r.slug.includes(state.q)));
  const by = {
    rank: (a, b) => implied(b) - implied(a) || b.tvl_usd - a.tvl_usd,
    tvl: (a, b) => b.tvl_usd - a.tvl_usd,
    change: (a, b) => (b.change_7d ?? -Infinity) - (a.change_7d ?? -Infinity),
    age: (a, b) => (b.age_days ?? -1) - (a.age_days ?? -1),
    name: (a, b) => (a.name < b.name ? -1 : 1),
  }[state.sort];
  return rows.sort(by);
}

function boardTable(rows) {
  if (rows.length === 0) return '<div class="panel empty">No protocol on the board matches those filters.</div>';
  const body = rows.map((r) => {
    const iv = implied(r);
    return `<tr data-slug="${esc(r.slug)}">
      <td class="num">${r.rank}</td>
      <td><span class="pname">${esc(r.name)}</span><span class="badge ${r.watchlist ? 'wl' : 'early'}">${r.watchlist ? 'Watchlist' : 'Early'}</span></td>
      <td>${esc(r.category ?? 'Uncategorised')}</td>
      <td class="chains">${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}</td>
      <td class="r num">${money(r.tvl_usd)}</td>
      <td class="r num">${pct(r.change_7d)}</td>
      <td class="r num">${ageText(r.age_days)}</td>
      <td class="r num iv">${money(iv)}</td>
      <td class="r num">${(iv / r.tvl_usd).toFixed(2)}</td>
    </tr>`;
  }).join('');
  return `<table class="board"><thead><tr>
    <th>#</th><th>Protocol</th><th>Category</th><th>Chains</th>
    <th class="r">TVL</th><th class="r">7 days</th><th class="r">Track record</th><th class="r">Implied value</th><th class="r">IV / TVL</th>
  </tr></thead><tbody>${body}</tbody></table>`;
}

function liveSection() {
  const body = R.live.map((p) => `<tr>
    <td><span class="pname">${esc(p.name)}</span></td><td class="num">${esc(p.symbol ?? '—')}</td>
    <td>${esc(p.category ?? 'Uncategorised')}</td>
    <td class="r num">${money(p.mcap_usd)}</td><td class="r num">${money(p.tvl_usd)}</td>
    <td class="r num">${p.ratio === null ? '—' : p.ratio.toFixed(2)}</td><td class="r num">${pct(p.change_7d)}</td></tr>`).join('');
  return `<section><h2>Already trading — not ranked</h2>
  <p class="sub">These protocols' tokens exist, so the radar does not rank them: it shows the market's own values.
  Their market-cap / TVL ratios are the evidence the board's peer ratios are built from.</p>
  <table class="board"><thead><tr><th>Protocol</th><th>Token</th><th>Category</th>
  <th class="r">Market cap</th><th class="r">TVL</th><th class="r">MCap / TVL</th><th class="r">7 days</th></tr></thead>
  <tbody>${body}</tbody></table></section>`;
}

function renderBoard() {
  app.innerHTML = modelSection() +
    `<section><h2>The board</h2><p class="sub">${R.board_size} pre-token protocols ranked by implied value.
    Click any row for its model arithmetic and its farm plan.</p>${controls()}<div id="tbl" style="margin-top:14px"></div></section>` +
    liveSection();
  const draw = () => {
    const rows = visibleRows();
    document.getElementById('tbl').innerHTML = boardTable(rows);
    document.getElementById('count').textContent = `${rows.length} of ${R.board_size} shown`;
    document.querySelectorAll('#tbl tbody tr').forEach((tr) =>
      tr.addEventListener('click', () => { location.hash = '#/p/' + tr.dataset.slug; }));
    const filed = state.momW === R.model.momentum_weight && state.tenR === R.model.tenure_range;
    document.getElementById('swarn').innerHTML = filed ? '' : '<span class="warn">Sandbox values — the filed board uses the stated constants.</span>';
  };
  const on = (id, ev, fn) => document.getElementById(id).addEventListener(ev, fn);
  on('q', 'input', (e) => { state.q = e.target.value.trim().toLowerCase(); draw(); });
  on('fcat', 'change', (e) => { state.category = e.target.value; draw(); });
  on('fchain', 'change', (e) => { state.chain = e.target.value; draw(); });
  on('fset', 'change', (e) => { state.set = e.target.value; draw(); });
  on('fsort', 'change', (e) => { state.sort = e.target.value; draw(); });
  on('smom', 'input', (e) => { state.momW = Number(e.target.value); document.getElementById('smomv').textContent = state.momW.toFixed(2); draw(); });
  on('sten', 'input', (e) => { state.tenR = Number(e.target.value); document.getElementById('stenv').textContent = state.tenR.toFixed(2); draw(); });
  on('sreset', 'click', () => { state.momW = R.model.momentum_weight; state.tenR = R.model.tenure_range; renderBoard(); window.scrollTo(0, document.getElementById('tbl').offsetTop - 80); });
  draw();
  app.setAttribute('aria-busy', 'false');
}

function renderDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) { renderBoard(); return; }
  const iv = r.implied_value_usd;
  const cells = [
    [money(iv), 'implied value'], ['#' + r.rank, 'board rank'], [money(r.tvl_usd), 'TVL'],
    [r.change_7d === null ? 'n/a' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%', 'TVL, 7 days'],
    [esc(r.category ?? 'Uncategorised'), 'category'], [esc(r.chains.length === 0 ? '—' : r.chains.slice(0, 4).join(', ') + (r.chains.length > 4 ? ` +${r.chains.length - 4} more` : '')), 'chains'],
    [r.listed_at ?? 'not recorded', 'tracked since'], [r.age_days === null ? 'unknown' : commas(r.age_days) + ' days', 'tokenless track record'],
  ].map(([b, s]) => `<div class="cell"><b>${b}</b><span>${s}</span></div>`).join('');
  app.innerHTML = `<section>
    <a class="back" href="#/">&larr; Back to the board</a>
    <div class="detail-head"><div>
      <h2>${esc(r.name)}<span class="badge ${r.watchlist ? 'wl' : 'early'}">${r.watchlist ? 'Watchlist' : 'Early'}</span></h2>
      <p class="sub" style="margin:4px 0 0">Records no token in the snapshot. If it launched at the rate its category's
      tokenized peers trade at, adjusted below, its token would be worth ${money(iv)}.</p>
    </div><div class="detail-iv"><span>Implied value</span><b>${money(iv)}</b></div></div>
    <div class="grid">${cells}</div>
    <div class="model-grid">
      <div class="panel"><h3>How this value is derived</h3><table class="math">
        <tr><td>TVL</td><td>${money(r.tvl_usd)}</td></tr>
        <tr><td>Peer ratio — ${esc(r.category ?? 'no category')}, ${r.peers} tokenized peer${r.peers === 1 ? '' : 's'}</td><td>x ${r.ratio.toFixed(3)}</td></tr>
        <tr><td>Base value</td><td>${money(r.base_usd)}</td></tr>
        <tr><td>Momentum — 7-day change ${r.change_7d === null ? 'unreported' : r.change_7d.toFixed(1) + '%'}</td><td>${mult(r.momentum)}</td></tr>
        <tr><td>Tenure — ${r.age_days === null ? 'no listing date' : commas(r.age_days) + ' tokenless days'}</td><td>${mult(r.tenure)}</td></tr>
        <tr><td>Breadth — ${r.chains.length} chain${r.chains.length === 1 ? '' : 's'}</td><td>${mult(r.breadth)}</td></tr>
        <tr class="total"><td>Implied value</td><td>${money(iv)}</td></tr>
      </table></div>
      <div class="panel"><h3>Farm plan</h3>
      <ol class="plan">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
    </div>
    <div class="panel" style="margin-top:18px"><h3>Nearby on the board</h3>
    <table class="board"><thead><tr><th>#</th><th>Protocol</th><th>Category</th><th class="r">TVL</th><th class="r">Implied value</th></tr></thead>
    <tbody>${R.rows.filter((x) => Math.abs(x.rank - r.rank) <= 2).map((x) => `<tr data-slug="${esc(x.slug)}"${x.slug === r.slug ? ' style="background:#14233c"' : ''}>
      <td class="num">${x.rank}</td><td><span class="pname">${esc(x.name)}</span></td><td>${esc(x.category ?? 'Uncategorised')}</td>
      <td class="r num">${money(x.tvl_usd)}</td><td class="r num iv">${money(x.implied_value_usd)}</td></tr>`).join('')}</tbody></table></div>
    </section>`;
  app.querySelectorAll('tbody tr[data-slug]').forEach((tr) =>
    tr.addEventListener('click', () => { location.hash = '#/p/' + tr.dataset.slug; }));
  window.scrollTo(0, 0);
  app.setAttribute('aria-busy', 'false');
}

function route() {
  const m = location.hash.match(/^#\/p\/(.+)$/);
  if (m) renderDetail(decodeURIComponent(m[1]));
  else renderBoard();
}
window.addEventListener('hashchange', route);
header();
route();
