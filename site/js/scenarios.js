// What a team needs to make the playoffs: every way the remaining regular-season games can go.
// Pure functions over the analytics context, shared by the site and the tests (no AI, no network).
//
// The method is the one behind NFL "clinching scenarios" and playoff machines: list every win/loss
// combination of the games left (2^games; 18 games = 262,144 outcomes) and check where the team
// finishes in each. Wins are certain in an outcome; a tie on wins is decided by points for (this
// league's tiebreaker), which can't be listed out, so those outcomes count as "comes down to points".
// Each outcome is weighted by how likely it is, using the same scoring model as the playoff odds.
import * as A from './analytics.js';
import { playoffSize, remainingGames, teamModel } from './playoffs.js';

// Standard normal CDF (Abramowitz & Stegun 7.1.26, error < 1.5e-7).
export function phi(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

// Chance team a beats team b in one game, from the scoring model (ESPN's projection for the current week).
function gameOdds(g, model) {
  const ma = g.projA ?? model[g.a].mean, mb = g.projB ?? model[g.b].mean;
  return phi((ma - mb) / Math.sqrt(model[g.a].sd ** 2 + model[g.b].sd ** 2));
}

// Chance of fewer than `spots` successes from independent chances `ps` (Poisson binomial).
function fewerThan(ps, spots) {
  let dp = [1];
  for (const p of ps) {
    const nx = Array(dp.length + 1).fill(0);
    dp.forEach((v, k) => { nx[k] += v * (1 - p); nx[k + 1] += v * p; });
    dp = nx;
  }
  return dp.slice(0, spots).reduce((a, b) => a + b, 0);
}

// Every way `rid` can finish, by its own record in the games left, plus the other results that
// matter most and (for the current week) the simplest sets of results that clinch or eliminate.
export function teamScenarios(ctx, rid, { rows = A.standings(ctx), remaining = remainingGames(ctx), model = teamModel(ctx), maxExact = 20, samples = 60000 } = {}) {
  const K = playoffSize(ctx);
  const ids = rows.map(r => r.rid);
  const idx = Object.fromEntries(ids.map((r, i) => [r, i]));
  const N = ids.length, n = remaining.length, me = idx[rid];
  const base = rows.map(r => A.winsOf(r));
  const ga = remaining.map(g => idx[g.a]), gb = remaining.map(g => idx[g.b]);
  const pA = remaining.map(g => gameOdds(g, model));
  const mine = remaining.map(g => g.a === rid || g.b === rid);
  const myGames = remaining.filter((g, i) => mine[i]).map(g => ({ week: g.week, opp: g.a === rid ? g.b : g.a }));
  const nMine = myGames.length;

  // Points-for tiebreak: chance this team ends with more points than each other team.
  const expPf = rows.map(r => ({ m: r.pf, v: 0 }));
  remaining.forEach((g, i) => {
    expPf[ga[i]].m += g.projA ?? model[g.a].mean; expPf[ga[i]].v += model[g.a].sd ** 2;
    expPf[gb[i]].m += g.projB ?? model[g.b].mean; expPf[gb[i]].v += model[g.b].sd ** 2;
  });
  const beatsMe = expPf.map((o, j) => {
    if (j === me) return 0;
    const sd = Math.sqrt(o.v + expPf[me].v), d = o.m - expPf[me].m;
    return sd > 0 ? phi(d / sd) : d > 0 ? 1 : d < 0 ? 0 : 0.5;
  });

  // This week's games go in the low bits so each outcome's "this week" pattern is a simple mask.
  const week = n ? remaining[0].week : null;
  const W = remaining.filter(g => g.week === week).length;
  const exact = n <= maxExact;
  const usePattern = exact && W <= 8;
  const nPat = usePattern ? 1 << W : 0;
  const patIn = new Uint8Array(nPat).fill(1), patOut = new Uint8Array(nPat).fill(1);

  const rec = Array.from({ length: nMine + 1 }, () => ({ w: 0, pin: 0, sure: true, never: true, points: false }));
  const aWin = new Float64Array(n), aWinIn = new Float64Array(n);
  let totalIn = 0, totalW = 0;
  const wins = new Float64Array(N);
  const res = new Uint8Array(n);
  const rand = mulberry32(7 + n * 31 + me);
  const count = exact ? 2 ** n : samples;

  for (let o = 0; o < count; o++) {
    for (let j = 0; j < N; j++) wins[j] = base[j];
    let wt = 1, myW = 0, mask = o;
    for (let i = 0; i < n; i++) {
      const aw = exact ? mask % 2 === 1 : rand() < pA[i];
      if (exact) { mask = Math.floor(mask / 2); wt *= aw ? pA[i] : 1 - pA[i]; }
      res[i] = aw ? 1 : 0;
      const wi = aw ? ga[i] : gb[i];
      wins[wi]++;
      if (wi === me) myW++;
    }
    let above = 0;
    const tied = [];
    for (let j = 0; j < N; j++) if (j !== me) { if (wins[j] > wins[me]) above++; else if (wins[j] === wins[me]) tied.push(beatsMe[j]); }
    const sure = above + tied.length < K, never = above >= K;
    const pin = sure ? 1 : never ? 0 : fewerThan(tied, K - above);
    const r = rec[myW];
    r.w += wt; r.pin += wt * pin; r.sure &&= sure; r.never &&= never; if (!sure && !never) r.points = true;
    totalW += wt; totalIn += wt * pin;
    for (let i = 0; i < n; i++) {
      if (res[i]) { aWin[i] += wt; aWinIn[i] += wt * pin; }
    }
    if (usePattern) { const p = o % nPat; if (!sure) patIn[p] = 0; if (!never) patOut[p] = 0; }
  }

  const byRecord = rec.map((r, k) => ({ wins: k, losses: nMine - k, chance: r.w / totalW, pIn: r.w ? r.pin / r.w : 0, sure: exact && r.w > 0 && r.sure, never: exact && r.w > 0 && r.never, points: r.points })).reverse();

  // Other games, ranked by how much the result swings this team's chances.
  const rootFor = [];
  remaining.forEach((g, i) => {
    if (mine[i]) return;
    const wa = aWin[i] / totalW, inA = aWinIn[i] / totalW;
    if (wa <= 0 || wa >= 1) return;
    const swing = inA / wa - (totalIn / totalW - inA) / (1 - wa);
    if (Math.abs(swing) < 0.02) return;
    rootFor.push(swing > 0 ? { week: g.week, winner: g.a, loser: g.b, swing } : { week: g.week, winner: g.b, loser: g.a, swing: -swing });
  });
  rootFor.sort((x, y) => y.swing - x.swing);

  // This week: smallest sets of results (at most 3) that lock the team in, or knock it out, whatever happens after.
  let thisWeek = null;
  if (usePattern && W) {
    const games = remaining.slice(0, W);
    const holds = (flags, set) => {
      for (let p = 0; p < nPat; p++) if (set.every(([j, aw]) => ((p >> j) & 1) === aw) && !flags[p]) return false;
      return true;
    };
    const minimal = flags => {
      if (holds(flags, [])) return [];
      const found = [];
      for (let size = 1; size <= 3; size++) {
        const before = found.length;
        const go = (start, set) => {
          if (set.length === size) { if (!found.slice(0, before).some(f => f.every(x => set.some(y => y[0] === x[0] && y[1] === x[1]))) && holds(flags, set)) found.push(set); return; }
          for (let j = start; j < W; j++) for (const aw of [1, 0]) go(j + 1, [...set, [j, aw]]);
        };
        go(0, []);
      }
      return found.map(set => set.map(([j, aw]) => {
        const g = games[j];
        const winner = aw ? g.a : g.b, loser = aw ? g.b : g.a;
        return { winner, loser, mine: winner === rid || loser === rid };
      }).sort((x, y) => y.mine - x.mine));
    };
    const tidy = list => list.sort((x, y) => x.length - y.length || y.some(c => c.mine) - x.some(c => c.mine)).slice(0, 4);
    const anyIn = patIn.some(Boolean), anyOut = patOut.some(Boolean);
    thisWeek = { week, clinch: anyIn ? tidy(minimal(patIn)) : [], eliminate: anyOut ? tidy(minimal(patOut)) : [] };
  }

  return { rid, exact, outcomes: count, myGames, byRecord, pIn: totalIn / totalW, rootFor: rootFor.slice(0, 4), thisWeek };
}

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
