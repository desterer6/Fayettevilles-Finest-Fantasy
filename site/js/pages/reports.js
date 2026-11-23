import * as A from '../analytics.js';
import { h, f1 } from '../ui.js';
import { renderMarkdown } from '../markdown.js';
import { weekStory } from '../insights.js';
import { fmtDate, tradesCard } from './news.js';
import { ord, pickHoldings } from '../picks.js';

export function byTheNumbers(ctx, w) {
  const s = w != null && weekStory(ctx, w);
  if (!s) return null;
  const tile = (k, v, d) => h('div', { class: 'tile' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const mvpName = s.mvp && ctx.players[s.mvp.id] ? ctx.players[s.mvp.id].n : null;
  return h('section', { class: 'card' },
    h('h2', {}, `Week ${w} by the numbers`),
    h('div', { class: 'tiles four' },
      tile('High score', ctx.name(s.top.rid), `${f1(s.top.pts)} points`),
      tile('Biggest blowout', ctx.name(s.blowout.winner), `beat ${ctx.name(s.blowout.loser)} by ${f1(s.blowout.margin)}`),
      tile('Closest game', ctx.name(s.closest.winner), `edged ${ctx.name(s.closest.loser)} by ${f1(s.closest.margin)}`),
      mvpName ? tile('Player of the week', mvpName, `${f1(s.mvp.pts)} for ${ctx.name(s.mvp.rid)}`)
        : tile('Low score', ctx.name(s.low.rid), `${f1(s.low.pts)} points`)));
}

const SECTIONS = [
  ['weekly', 'Weekly Reports'],
  ['numbers', 'By the Numbers'],
  ['trades', 'Trade Block'],
  ['picks', 'Draft Pick Reporting'],
];
const DEKS = {
  weekly: 'The commissioner’s recap, posted every Tuesday after Monday Night Football.',
  numbers: 'The standout scores, blowouts and nail-biters from every completed week.',
  trades: 'Every trade this season, pulled from ESPN.',
  picks: 'Who owns which draft picks, and where every team stands under the pick rule.',
};

// #/reports[/section[/arg]] or #/reports/<report id>. Report ids start with "a-", "r" + digits, so they never clash with section names.
export function renderReports(ctx, content, parts = [], picks = null) {
  const [first, arg] = parts;
  const reports = content.reports || [];
  const r = first ? reports.find(x => x.id === first) : null;
  if (r) return reportArticle(ctx, r);
  const sub = SECTIONS.some(([id]) => id === first) ? first : 'weekly';
  const tab = (id, text) => h('a', { href: id === 'weekly' ? '#/reports' : `#/reports/${id}`, class: sub === id ? 'on' : '', 'aria-current': sub === id ? 'page' : null }, text);
  const body = sub === 'numbers' ? numbersView(ctx, arg)
    : sub === 'trades' ? tradesView(ctx, content)
    : sub === 'picks' ? picksView(ctx, picks, arg)
    : weeklyView(reports);
  return h('div', {},
    h('h1', {}, 'Reports'),
    h('p', { class: 'dek' }, DEKS[sub]),
    h('nav', { class: 'sub', 'aria-label': 'Report sections' }, SECTIONS.map(([id, text]) => tab(id, text))),
    body);
}

function reportArticle(ctx, r) {
  return h('div', {},
    h('article', { class: 'article' },
      h('div', { class: 'kicker', style: { marginTop: '22px' } }, (r.week ? `Week ${r.week} Report` : 'Weekly Report') + (r.archived ? ' · From the archive' : '')),
      h('h1', {}, r.title),
      h('div', { class: 'byline' }, ['By the Commissioner', fmtDate(r.date)].filter(Boolean).join(' · ')),
      h('div', { class: 'prose', html: renderMarkdown(r.body) })),
    byTheNumbers(ctx, r.week ?? null),
    h('a', { class: 'more', href: '#/reports' }, '← All weekly reports'));
}

// ---- Weekly Reports ---------------------------------------------------------------------------
function weeklyView(reports) {
  if (!reports.length) return h('section', { class: 'card' }, h('p', { class: 'empty' }, 'The first weekly report drops Tuesday after Monday Night Football.'));
  const [latest, ...rest] = reports;
  const meta = x => [x.week ? `Week ${x.week}` : null, fmtDate(x.date)].filter(Boolean).join(' · ');
  return h('div', {},
    h('a', { class: 'card report-lead', href: `#/reports/${latest.id}` },
      h('div', { class: 'kicker' }, 'Latest report'),
      h('div', { class: 't' }, latest.title),
      h('div', { class: 'm' }, meta(latest)),
      h('span', { class: 'more' }, 'Read the report →')),
    rest.length ? h('section', { class: 'card' }, h('h2', {}, 'Earlier reports'),
      h('ul', { class: 'hl' }, rest.map(x => h('li', {}, h('a', { href: `#/reports/${x.id}` },
        h('div', { class: 't' }, x.title), h('div', { class: 'm' }, meta(x))))))) : null);
}

// ---- By the Numbers ---------------------------------------------------------------------------
function numbersView(ctx, arg) {
  const weeks = ctx.completed;
  if (!weeks.length) return h('section', { class: 'card' }, h('p', { class: 'empty' }, 'Numbers show up after the first week is complete.'));
  const w = weeks.includes(Number(arg)) ? Number(arg) : weeks[weeks.length - 1];
  const sel = h('select', { 'aria-label': 'Week', onchange: e => { location.hash = `#/reports/numbers/${e.target.value}`; } },
    weeks.slice().reverse().map(x => h('option', { value: x, selected: x === w ? true : null }, `Week ${x}`)));
  const rows = weeks.slice().reverse().map(x => ({ w: x, s: weekStory(ctx, x) })).filter(x => x.s);
  const link = x => h('a', { href: `#/reports/numbers/${x}` }, `W${x}`);
  return h('div', {},
    h('div', { class: 'controls' }, 'Week', sel),
    byTheNumbers(ctx, w),
    h('section', { class: 'card' },
      h('h2', {}, 'Week by week'),
      h('div', { class: 'tablewrap' }, h('table', { class: 'compact wk' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Wk'), h('th', {}, 'High score'), h('th', {}, 'Low score'), h('th', {}, 'Biggest blowout'), h('th', {}, 'Closest game'))),
        h('tbody', {}, rows.map(({ w: x, s }) => h('tr', { class: x === w ? 'mine' : '' },
          h('td', {}, link(x)),
          h('td', {}, `${ctx.name(s.top.rid)} `, h('span', { class: 'mut' }, f1(s.top.pts))),
          h('td', {}, `${ctx.name(s.low.rid)} `, h('span', { class: 'mut' }, f1(s.low.pts))),
          h('td', {}, `${ctx.name(s.blowout.winner)} `, h('span', { class: 'mut' }, `+${f1(s.blowout.margin)}`)),
          h('td', {}, `${ctx.name(s.closest.winner)} `, h('span', { class: 'mut' }, `+${f1(s.closest.margin)}`)))))))));
}

// ---- Trade Block ------------------------------------------------------------------------------
function tradesView(ctx, content) {
  return h('div', {},
    tradesCard(ctx, content),
    h('p', { class: 'note' }, 'Draft picks that changed hands are tracked under ', h('a', { href: '#/reports/picks' }, 'Draft Pick Reporting'), '.'));
}

// ---- Draft Pick Reporting -----------------------------------------------------------------------
function picksView(ctx, picks, arg) {
  if (!picks || !picks.seasons?.length) return h('section', { class: 'card' }, h('p', { class: 'empty' }, 'Draft pick ownership has not been posted yet.'));
  const seasons = picks.seasons;
  const season = seasons.find(s => String(s.season) === arg) || seasons[0];
  const mgr = rid => picks.managers?.[rid] || ctx.name(rid);
  // Teams listed worst record first, from the live standings.
  const order = A.standings(ctx).slice().reverse().map(r => r.rid);
  const { holdings, shown, owner } = pickHoldings(picks, season, order);
  const { min, max } = picks.rule || {};
  const status = n => (min == null ? null : n < min ? { ok: false, text: `Below ${min} floor` } : n > max ? { ok: false, text: `Over ${max} cap` } : { ok: true, text: n === max ? `At ${max} cap` : n === min ? `At ${min} floor` : 'OK' });
  const moved = (season.moves || []).length;
  const ok = order.filter(rid => status(holdings[rid].total)?.ok).length;

  const seasonNav = h('nav', { class: 'sub seasons', 'aria-label': 'Draft season' }, h('span', { class: 'lbl' }, 'Season'),
    seasons.map(s => h('a', { href: `#/reports/picks/${s.season}`, class: s === season ? 'on' : '' }, String(s.season))));

  const tile = (k, v, d) => h('div', { class: 'tile' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
  const summary = h('section', { class: 'card' },
    h('h2', {}, `${season.season} draft at a glance`),
    h('div', { class: 'tiles four' },
      tile('Picks moved', String(moved), moved === 1 ? 'pick has changed hands' : 'picks have changed hands'),
      tile('Draft length', `${picks.rounds} rounds`, 'every team starts with one pick per round'),
      min != null ? tile('Pick rule', `${min} to ${max}`, 'picks per team, or automatic relegation') : null,
      min != null ? tile('In compliance', `${ok} of ${order.length}`, season.deadline ? `checked at the ${fmtDate(season.deadline)} deadline` : `teams holding ${min} to ${max} picks`) : null));

  const chip = it => {
    const rd = ord(it.round);
    if (it.kind === 'own') return h('span', { class: 'pk' }, rd);
    if (it.kind === 'got') return h('span', { class: 'pk got' }, h('b', {}, rd), ` from ${mgr(it.other)}`);
    return h('span', { class: 'pk away', title: `Traded to ${mgr(it.other)}` }, `${rd} to ${mgr(it.other)}`);
  };
  const byOwner = h('section', { class: 'card' },
    h('h2', {}, `${season.season} picks by owner`),
    h('div', { class: 'pk-legend' }, h('span', { class: 'pk' }, '4th'), ' own pick', h('span', { class: 'pk got' }, h('b', {}, '1st'), ' from X'), ' acquired', h('span', { class: 'pk away' }, '4th to X'), ' traded away'),
    h('ul', { class: 'pk-list' }, order.map(rid => {
      const hd = holdings[rid], st = status(hd.total);
      const cls = hd.total > picks.rounds ? 'up' : hd.total < picks.rounds ? 'down' : '';
      return h('li', { class: rid === ctx.meRid ? 'mine' : '' },
        h('div', { class: 'pk-who' }, h('div', { class: 'n' }, mgr(rid)), h('div', { class: 'm' }, ctx.name(rid))),
        h('div', { class: 'pk-chips' }, hd.items.map(chip)),
        h('div', { class: 'pk-count' },
          h('div', { class: `v ${cls}` }, String(hd.total)),
          h('div', { class: 'of' }, `of ${picks.rounds}`),
          st ? h('div', { class: `st ${st.ok ? 'ok' : 'bad'}` }, (st.ok ? '✓ ' : '✗ ') + st.text) : null));
    })),
    h('p', { class: 'note' }, `Rounds ${shown + 1} to ${picks.rounds} are not shown because none of those picks has moved.`));

  const board = h('section', { class: 'card' },
    h('h2', {}, `${season.season} draft board`),
    h('p', { class: 'note', style: { marginTop: 0 } }, 'Rows are each team’s original picks. A gold cell shows who owns that pick now.'),
    h('div', { class: 'tablewrap' }, h('table', { class: 'pk-board' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Team'), Array.from({ length: shown }, (_, i) => h('th', { class: 'c' }, `Rd ${i + 1}`)), h('th', { class: 'c' }, 'Picks'))),
      h('tbody', {}, order.map(rid => h('tr', { class: rid === ctx.meRid ? 'mine' : '' },
        h('th', { scope: 'row' }, h('span', { class: 'n' }, mgr(rid)), h('span', { class: 'm' }, ctx.name(rid))),
        Array.from({ length: shown }, (_, k) => {
          const o = owner(rid, k + 1);
          return h('td', { class: 'c' }, o === rid ? h('span', { class: 'dot', title: `${mgr(rid)} still owns this pick` }, '•')
            : h('span', { class: 'cell', title: `${mgr(rid)}'s ${ord(k + 1)}, now owned by ${mgr(o)}` }, mgr(o)));
        }),
        h('td', { class: 'c tot' }, String(holdings[rid].total))))))));

  const deals = (season.deals || []).length ? h('section', { class: 'card' },
    h('h2', {}, 'Pick trade ledger'),
    h('ul', { class: 'pk-ledger' }, season.deals.map(d => h('li', {},
      h('div', { class: 'd' }, d.date),
      h('div', {}, d.lines.map(l => h('p', {}, l)), d.note ? h('div', { class: 'm' }, d.note) : null))))) : null;

  return h('div', {},
    seasonNav,
    picks.rule?.summary ? h('p', { class: 'note' }, picks.rule.summary) : null,
    summary, byOwner, board, deals,
    h('p', { class: 'note' }, `Per the ${(picks.source || 'league pick ledger').toLowerCase()}, ${fmtDate(picks.updated)}.`));
}
