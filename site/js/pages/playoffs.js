import * as A from '../analytics.js';
import { h, f1, section, sortableTable } from '../ui.js';
import { label } from './common.js';
import { playoffSize, relegationCount, relegationStatus, currentSeeds, clinchStatus, playoffOdds, bracket, regularSeasonDone, remainingGames, teamModel } from '../playoffs.js';
import { teamScenarios } from '../scenarios.js';

const pctText = p => (p >= 0.995 && p < 1 ? '>99%' : p > 0 && p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);
// ESPN-style marks beside a team name: x = clinched a playoff spot, e = eliminated from the playoffs.
const MARKS = { clinched: ['x', 'Clinched a playoff spot'], eliminated: ['e', 'Eliminated from playoff contention'] };
const mark = s => (MARKS[s] ? h('span', { class: `cmark ${s}`, title: MARKS[s][1], 'aria-label': MARKS[s][1] }, MARKS[s][0]) : null);
const weeksText = ws => (ws.length > 1 ? `Weeks ${ws[0]}–${ws[ws.length - 1]}` : `Week ${ws[0]}`);

// Playoffs once the regular season is over; projected playoffs (if the season ended today, plus odds) before that.
export function renderPlayoffs(ctx) {
  const K = playoffSize(ctx);
  const done = regularSeasonDone(ctx);
  const { rows: seeds, source } = currentSeeds(ctx);
  const br = bracket(ctx, seeds);
  const status = done ? {} : clinchStatus(ctx, seeds, remainingGames(ctx));
  const started = br.rounds.some(r => r.games.some(g => g.winner != null || g.live || Object.keys(g.pts).length));
  const champ = br.champion;
  const title = done ? 'Playoffs' : 'Projected Playoffs';
  const last = ctx.completed[ctx.completed.length - 1];
  const dek = done
    ? (champ != null ? `${ctx.name(champ)} won the ${ctx.data.league.season} championship.` : `The ${K}-team field is set. Winners advance; there is no consolation bracket.`)
    : `If the season ended today${last ? ` (after Week ${last})` : ''}. The top ${K} make it; there is no consolation bracket. Regular season ends after Week ${ctx.data.league.regularSeasonEnd}.`;

  return h('div', {},
    h('h1', {}, title),
    h('p', { class: 'dek' }, dek),
    h('nav', { class: 'sub' }, h('a', { href: '#/standings' }, 'League table'), h('a', { href: '#/power' }, 'Power rankings'), h('a', { href: '#/playoffs', class: 'on' }, done ? 'Playoffs' : 'Projected playoffs')),
    champ != null ? h('div', { class: 'champ' }, h('span', { class: 'kicker' }, `${ctx.data.league.season} Champion`), h('b', {}, ctx.name(champ))) : null,
    done ? null : clinchNote(ctx, seeds, status),
    bracketCard(ctx, br, done, started, status),
    done ? seedsCard(ctx, seeds, K) : raceCard(ctx, seeds, K, source, status));
}

// Who has locked up a spot so far, the way ESPN flags it. Nothing shown until someone clinches.
function clinchNote(ctx, seeds, status) {
  const ins = seeds.filter(r => status[r.rid] === 'clinched');
  if (!ins.length) return null;
  return h('p', { class: 'clinch-note' }, h('b', {}, 'Clinched: '), ins.map((r, i) => [i ? ', ' : '', label(ctx, r.rid)]),
    `. ${ins.length === 1 ? 'This team has' : 'These teams have'} locked up a playoff spot, marked `, mark('clinched'), ' below.');
}

function bracketCard(ctx, br, done, started, status = {}) {
  const team = (slot, g) => {
    if (!slot) return h('div', { class: 'bk-team tbd' }, h('span', { class: 'sd' }, ''), h('span', { class: 'nm' }, 'TBD'), h('span', { class: 'pt' }, ''));
    if (slot.bye) return h('div', { class: 'bk-team tbd' }, h('span', { class: 'sd' }, ''), h('span', { class: 'nm' }, 'Bye'), h('span', { class: 'pt' }, ''));
    if (slot.rid == null) return h('div', { class: 'bk-team tbd' }, h('span', { class: 'sd' }, slot.seed ?? ''), h('span', { class: 'nm' }, slot.from ? `Winner of ${slot.from}` : 'TBD'), h('span', { class: 'pt' }, ''));
    const lost = g.winner != null && g.winner !== slot.rid;
    const pts = g.pts[slot.rid];
    return h('div', { class: 'bk-team' + (g.winner === slot.rid ? ' won' : '') + (lost ? ' lost' : '') + (slot.rid === ctx.meRid ? ' me' : '') },
      h('span', { class: 'sd' }, slot.seed ?? ''), h('span', { class: 'nm' }, ctx.name(slot.rid), mark(status[slot.rid] === 'clinched' ? 'clinched' : null)), h('span', { class: 'pt' }, pts != null && (pts > 0 || g.winner != null) ? f1(pts) : ''));
  };
  return section(done ? 'Bracket' : 'Projected bracket',
    done ? (started ? 'Scores update with every refresh. Winners advance.' : 'Seeds are locked. Games start next week.') : 'Seeded by today’s standings. Higher seeds sit on top.',
    h('div', { class: 'bracket', style: `--rounds: ${br.rounds.length}` }, br.rounds.map(r => h('div', { class: 'bk-round' },
      h('div', { class: 'bk-head' }, h('b', {}, r.name), h('span', {}, weeksText(r.nflWeeks))),
      h('div', { class: 'bk-games' }, r.games.map(g => h('div', { class: 'bk-game' + (g.live ? ' live' : '') },
        g.live ? h('div', { class: 'bk-live' }, 'Live') : null, team(g.top, g), team(g.bottom, g))))))));
}

function raceCard(ctx, seeds, K, source, status) {
  const remaining = remainingGames(ctx);
  const { odds, sims } = playoffOdds(ctx);
  const w = r => A.winsOf(r);
  const lineIn = seeds[K] ? w(seeds[K]) : null; // first team out
  const lineOut = seeds[K - 1] ? w(seeds[K - 1]) : null; // last team in
  const line = r => (r.seed <= K ? (lineIn == null ? null : w(r) - lineIn) : w(r) - lineOut);
  const lineText = v => (v == null ? '–' : v === 0 ? '0' : (v > 0 ? '+' : '−') + Math.abs(v).toString().replace(/\.0$/, ''));
  const badge = r => {
    const s = status[r.rid];
    return s === 'clinched' ? h('span', { class: 'pbadge in' }, 'Clinched') : s === 'eliminated' ? h('span', { class: 'pbadge out' }, 'Eliminated') : r.seed <= K ? h('span', { class: 'pbadge maybe' }, 'In for now') : h('span', { class: 'pbadge chase' }, 'Chasing');
  };
  const R = relegationCount(ctx);
  const N = seeds.length;
  const relStatus = relegationStatus(ctx, seeds, remaining);
  const inDrop = r => R > 0 && r.seed > N - R;
  const teamCell = r => [h('span', { class: 'xcaret', 'aria-hidden': 'true' }), label(ctx, r.rid), mark(status[r.rid]), inDrop(r) ? h('span', { class: 'rtag', title: `Last place at the end of the regular season is relegated from the league` }, relStatus[r.rid] === 'relegated' ? 'Relegated' : 'Relegation zone') : null];
  // Only a clinch or elimination is certain: every sim going one way still reads >99% / <1%.
  const oddsOf = r => (status[r.rid] === 'clinched' ? 1 : status[r.rid] === 'eliminated' ? 0 : Math.min(0.995, Math.max(0.004, odds[r.rid].pct)));
  const model = teamModel(ctx);
  const table = sortableTable({
    sortKey: 'seed', desc: false, stickyIndex: 1,
    expand: { id: r => r.rid, label: r => `What ${ctx.name(r.rid)} needs to make the playoffs`, render: r => scenarioPanel(ctx, r, { K, status, odds, seeds, remaining, model }) },
    rowClass: r => [r.rid === ctx.meRid ? 'mine' : '', r.seed === K + 1 ? 'cut' : '', inDrop(r) ? 'releg' : ''].join(' ').trim(),
    rows: seeds,
    columns: [
      { key: 'seed', label: 'Seed', align: 'c', firstDesc: false, sort: r => r.seed, cell: r => r.seed },
      { key: 'team', label: 'Team', firstDesc: false, sort: r => ctx.name(r.rid).toLowerCase(), cell: teamCell },
      { key: 'rec', label: 'W-L', align: 'c', sort: r => w(r) * 1000 + r.pf / 100, cell: r => A.fmtRec(r) },
      { key: 'odds', label: 'Odds', align: 'r', title: 'Chance to make the playoffs, from simulating the rest of the regular season', sort: r => oddsOf(r), cell: r => h('span', { class: 'odds' }, h('span', { class: 'track' }, h('i', { style: { width: `${Math.round(oddsOf(r) * 100)}%` } })), h('b', {}, pctText(oddsOf(r)))) },
      { key: 'status', label: 'Status', align: 'c', sort: r => ({ clinched: 3, eliminated: 0 }[status[r.rid]] ?? (r.seed <= K ? 2 : 1)), cell: badge },
      { key: 'likely', label: 'Likely seed', align: 'c', title: 'Most common finishing seed in the simulations', sort: r => odds[r.rid].likelySeed ?? 99, cell: r => (odds[r.rid].likelySeed ? `#${odds[r.rid].likelySeed} (${pctText(odds[r.rid].likelySeedPct)})` : '–') },
      { key: 'pf', label: 'PF', align: 'r', sort: r => r.pf, cell: r => f1(r.pf) },
      { key: 'line', label: 'Line', align: 'c', title: `Wins above (+) or below (−) the playoff line: the ${K + 1}th team for teams in, the ${K}th for teams out`, sort: r => line(r), cell: r => lineText(line(r)) },
    ],
  });
  const weeksLeft = new Set(remaining.map(g => g.week)).size;
  let relegNote = null;
  if (R) {
    const risk = seeds.filter(r => relStatus[r.rid] !== 'safe').map(r => ({ r, p: relStatus[r.rid] === 'relegated' ? 1 : odds[r.rid].relegPct }))
      .filter(x => x.p >= 0.005).sort((a, b) => b.p - a.p).slice(0, 3);
    relegNote = h('p', { class: 'releg-note' }, h('b', {}, 'Relegation: '),
      `${R === 1 ? 'Last place' : `The bottom ${R}`} at the end of the regular season ${R === 1 ? 'is' : 'are'} relegated from the league. `,
      risk.length ? `Chance of finishing last: ${risk.map(x => `${ctx.name(x.r.rid)} ${pctText(x.p)}`).join(', ')}.` : '');
  }
  return section('Playoff race',
    `${weeksLeft} regular-season week${weeksLeft === 1 ? '' : 's'} left. The dashed line is the cutoff for the top ${K}. Tap a team to see what it needs; tap a column to sort.`,
    table,
    relegNote,
    h('p', { class: 'note' },
      `Seeds ${source === 'espn' ? 'come straight from ESPN, using the league’s tiebreakers' : 'are by record, then points for'}. ` +
      `Odds come from playing out the remaining ESPN schedule ${sims.toLocaleString()} times, with each team scoring like it has so far this season (and ESPN’s projections for the current week), ranked by wins and then points. ` +
      'x = clinched a playoff spot, e = eliminated. Both are certain on wins alone.'));
}

// What one team needs, in plain words: its record the rest of the way, the other results to root
// for, and (this week) the simplest ways it clinches or is knocked out. See scenarios.js for the math.
const pctWord = p => (p >= 0.95 ? 'Almost surely in' : p >= 0.6 ? 'Likely in' : p >= 0.4 ? 'Toss-up' : p >= 0.1 ? 'Needs help' : 'Long shot');
const recText = (w, l) => `${w}-${l}`;

function scenarioPanel(ctx, r, { K, status, odds, seeds, remaining, model }) {
  const nm = rid => ctx.name(rid);
  const st = status[r.rid];
  if (st === 'eliminated') return h('div', { class: 'scn' }, h('p', { class: 'scn-head out' }, 'Eliminated. No mix of the remaining results gets them into the top ' + K + '.'));
  if (st === 'clinched') {
    const o = odds[r.rid];
    const top = o.seedDist.map((p, k) => ({ k, p })).filter(x => x.k && x.p >= 0.005).sort((a, b) => b.p - a.p).slice(0, 3);
    return h('div', { class: 'scn' }, h('p', { class: 'scn-head in' }, 'Clinched a playoff spot. Nothing left to need, only seeding to play for.'),
      top.length ? h('p', { class: 'scn-sub' }, 'Most likely seeds: ', top.map((x, i) => [i ? ', ' : '', h('b', {}, `#${x.k}`), ` ${pctText(x.p)}`]), '.') : null);
  }
  const s = teamScenarios(ctx, r.rid, { rows: seeds, remaining, model });
  const n = s.myGames.length;
  const rec = A.fmtRec(r);
  const finalRec = b => { const t = r.t ? `-${r.t}` : ''; return `${r.w + b.wins}-${r.l + b.losses}${t}`; };
  const best = s.byRecord[0];
  // Smallest number of wins that is enough on its own.
  const enough = s.byRecord.filter(b => b.sure).pop();
  let head;
  if (best.never) head = h('p', { class: 'scn-head out' }, 'Out of reach on wins alone.');
  else if (enough && enough.wins === 0) head = h('p', { class: 'scn-head in' }, 'In no matter what happens on the field.');
  else if (enough) head = h('p', { class: 'scn-head in' }, enough.wins === n ? `Win out (${finalRec(enough)}) and they’re in. No help needed.` : `Win ${enough.wins} of ${n} and they’re in. No help needed.`);
  else if (best.pIn >= 0.995) head = h('p', { class: 'scn-head in' }, `Win out (${finalRec(best)}) and they’re in, unless a tie on wins goes against them on points (unlikely).`);
  else head = h('p', { class: 'scn-head help' }, `Even winning out (${finalRec(best)}) isn’t enough on its own. They need help from other games.`);

  const sched = h('p', { class: 'scn-sub' }, `${rec} now. Left: `, s.myGames.map((g, i) => [i ? ', ' : '', `Wk ${g.week} vs ${nm(g.opp)}`]), '.');

  const rows = s.byRecord.map(b => {
    const verdict = b.sure ? h('span', { class: 'pbadge in' }, 'In') : b.never ? h('span', { class: 'pbadge out' }, 'Out') : h('span', { class: 'scn-pct' }, h('b', {}, pctText(b.pIn)), ` ${pctWord(b.pIn)}`);
    const why = b.sure ? 'guaranteed' : b.never ? 'no way in' : b.pIn >= 0.995 ? 'only a points tiebreak can stop it' : 'depends on other games' + (b.points ? ' and points' : '');
    return h('li', {}, h('span', { class: 'scn-rec' }, n === 0 ? 'As is' : `Go ${recText(b.wins, b.losses)}`), h('span', {}, verdict, h('span', { class: 'scn-why' }, why)));
  });

  const cond = (c, clinch) => (c.mine
    ? (c.winner === r.rid ? `a win over ${nm(c.loser)}` : `a loss to ${nm(c.winner)}`)
    : clinch ? `${nm(c.loser)} loses to ${nm(c.winner)}` : `${nm(c.winner)} beats ${nm(c.loser)}`);
  const ways = (list, clinch) => h('ul', { class: 'scn-ways' }, list.map((set, i) => h('li', {}, i ? h('i', {}, 'or ') : null, set.map((c, j) => [j ? ' + ' : '', cond(c, clinch)]))));
  const tw = s.thisWeek;
  const live = tw && ctx.data.weeks.find(w => w.week === tw.week && !w.complete);
  const weekBits = [];
  if (tw && tw.clinch.length) weekBits.push(h('p', { class: 'scn-label' }, `Clinches in Week ${tw.week} with:`), ways(tw.clinch, true));
  if (tw && tw.eliminate.length) weekBits.push(h('p', { class: 'scn-label' }, `Eliminated in Week ${tw.week} with:`), ways(tw.eliminate, false));

  const root = s.rootFor.slice(0, 3);
  return h('div', { class: 'scn' },
    head, sched,
    h('p', { class: 'scn-label' }, 'If they finish the season…'),
    h('ul', { class: 'scn-recs' }, rows),
    weekBits,
    root.length ? [h('p', { class: 'scn-label' }, 'Root for these results:'),
      h('ul', { class: 'scn-ways' }, root.map(x => h('li', {}, `Wk ${x.week}: `, h('b', {}, nm(x.winner)), ` over ${nm(x.loser)}`, h('span', { class: 'scn-why' }, `+${Math.round(x.swing * 100)}% odds`))))] : null,
    h('p', { class: 'scn-foot' }, s.exact
      ? `Checked all ${s.outcomes.toLocaleString()} ways the last ${remaining.length} games can go. Ties on wins go to points for, so those cases are a chance, not a lock.${live && live.matchups.some(m => m.teams.some(t => t.pts > 0)) ? ` Week ${tw.week} is in progress and counts as not played yet.` : ''}`
      : `Estimated from ${s.outcomes.toLocaleString()} simulated finishes; exact scenarios appear once ${20} or fewer games are left.`));
}

function seedsCard(ctx, seeds, K) {
  const R = relegationCount(ctx), N = seeds.length;
  const down = r => R > 0 && r.seed > N - R;
  return section('Final seeds', 'Regular-season finish. The dashed line is the playoff cutoff.',
    h('div', { class: 'tablewrap' }, h('table', { class: 'compact' },
      h('thead', {}, h('tr', {}, h('th', { class: 'c' }, 'Seed'), h('th', {}, 'Team'), h('th', { class: 'c' }, 'W-L'), h('th', { class: 'r' }, 'PF'), h('th', { class: 'c' }, ''))),
      h('tbody', {}, seeds.map(r => h('tr', { class: [r.rid === ctx.meRid ? 'mine' : '', r.seed === K + 1 ? 'cut' : '', down(r) ? 'releg' : ''].join(' ').trim() },
        h('td', { class: 'c' }, r.seed), h('td', { class: 'nm' }, label(ctx, r.rid), down(r) ? h('span', { class: 'rtag' }, 'Relegated') : null), h('td', { class: 'c' }, A.fmtRec(r)), h('td', { class: 'r' }, f1(r.pf)),
        h('td', { class: 'c' }, r.seed <= K ? h('span', { class: 'pbadge in' }, 'In') : h('span', { class: 'pbadge out' }, 'Out'))))))));
}
