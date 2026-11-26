// Playoff scenarios (what a team needs). No network: node tests/scenarios.test.mjs
import fs from 'node:fs';
import * as A from '../site/js/analytics.js';
import { currentSeeds, clinchStatus, playoffOdds, remainingGames } from '../site/js/playoffs.js';
import { teamScenarios, phi } from '../site/js/scenarios.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('FAIL', msg); } };

ok(Math.abs(phi(0) - 0.5) < 1e-7 && Math.abs(phi(1.96) - 0.975) < 1e-3 && Math.abs(phi(-1) - 0.1587) < 1e-3, 'normal CDF');

// Tiny league, top 2 make it, one week left: A 3-0, B 2-1, C 1-2, D 0-3; A v D and B v C.
const fake = { rids: [1, 2, 3, 4], data: { playoffs: { teams: 2 } } };
const rows = [[1, 3, 0, 300], [2, 2, 1, 290], [3, 1, 2, 280], [4, 0, 3, 200]].map(([rid, w, l, pf]) => ({ rid, w, l, t: 0, pf }));
const remaining = [{ week: 4, a: 1, b: 4, projA: null, projB: null }, { week: 4, a: 2, b: 3, projA: null, projB: null }];
const model = Object.fromEntries([1, 2, 3, 4].map(r => [r, { mean: 100, sd: 20 }]));
const sc = rid => teamScenarios(fake, rid, { rows, remaining, model });
const a = sc(1), b = sc(2), c = sc(3), d = sc(4);
ok(a.byRecord.every(x => x.sure), 'A is in whatever happens');
ok(b.byRecord[0].sure && !b.byRecord[1].sure && !b.byRecord[1].never && b.byRecord[1].points, 'B: a win is enough, a loss comes down to points');
ok(b.thisWeek.clinch.length === 1 && b.thisWeek.clinch[0].length === 1 && b.thisWeek.clinch[0][0].winner === 2, 'B clinches with a win');
ok(!c.byRecord[0].sure && !c.byRecord[0].never && c.byRecord[1].never, 'C: a win only forces a points tiebreak, a loss is out');
ok(c.thisWeek.eliminate.length === 1 && c.thisWeek.eliminate[0][0].winner === 2, 'C is eliminated with a loss');
ok(c.byRecord[0].pIn > 0 && c.byRecord[0].pIn < 0.5, 'C behind on points loses most tiebreaks');
ok(d.byRecord.every(x => x.never), 'D is out whatever happens');
ok(Math.abs(b.pIn + c.pIn + a.pIn + d.pIn - 2) < 1e-9, 'exactly 2 spots handed out on average');

// Real league data: agrees with the clinch marks and the simulated odds.
const ctx = A.prepare(JSON.parse(fs.readFileSync(new URL('../site/data/league.json', import.meta.url))));
const rem = remainingGames(ctx);
if (rem.length && rem.length <= 20) {
  const { rows: seeds } = currentSeeds(ctx);
  const status = clinchStatus(ctx, seeds, rem);
  const { odds } = playoffOdds(ctx);
  let sumIn = 0;
  for (const r of seeds) {
    const s = teamScenarios(ctx, r.rid, { rows: seeds, remaining: rem });
    const name = ctx.name(r.rid);
    sumIn += s.pIn;
    ok(Math.abs(s.byRecord.reduce((x, y) => x + y.chance, 0) - 1) < 1e-9, `${name}: record chances add to 1`);
    if (status[r.rid] === 'clinched') ok(s.byRecord.every(x => x.sure), `${name}: clinched means in at every record`);
    if (status[r.rid] === 'eliminated') ok(s.byRecord.every(x => x.never), `${name}: eliminated means out at every record`);
    ok(s.byRecord.every((x, i) => i === 0 || !x.sure || s.byRecord[i - 1].sure), `${name}: more wins never hurts`);
    ok(Math.abs(s.pIn - odds[r.rid].pct) < 0.06, `${name}: exact odds ${s.pIn.toFixed(3)} near simulated ${odds[r.rid].pct.toFixed(3)}`);
  }
  ok(Math.abs(sumIn - Math.min(8, seeds.length)) < 0.1, `playoff spots handed out add up (got ${sumIn.toFixed(3)})`); // points tiebreaks are an estimate
}

console.log(`${pass} checks passed, ${fail} failed`);
if (fail) process.exit(1);
