// Draft pick holdings from site/data/draft-picks.json. No network: node tests/picks.test.mjs
import fs from 'node:fs';
import { pickHoldings } from '../site/js/picks.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('FAIL', msg); } };

const picks = JSON.parse(fs.readFileSync(new URL('../site/data/draft-picks.json', import.meta.url)));
const rids = Object.keys(picks.managers).map(Number);
const s27 = picks.seasons.find(s => s.season === 2027);
const { holdings, shown } = pickHoldings(picks, s27, rids);
const total = name => holdings[rids.find(r => picks.managers[r] === name)].total;
const want = { Graham: 17, Parker: 17, Ryan: 14, CGreer: 15, Repp: 14, Odom: 14, Silas: 15, David: 15, Carson: 15, Ben: 14, Tucker: 15, Gage: 15 };
for (const [n, t] of Object.entries(want)) ok(total(n) === t, `2027 ${n} holds ${t} (got ${total(n)})`);
ok(shown === 7, 'only rounds 1 to 7 shown');
ok(rids.every(r => holdings[r].total >= picks.rule.min && holdings[r].total <= picks.rule.max), 'all teams inside the 13 to 17 rule');
ok(rids.reduce((a, r) => a + holdings[r].total, 0) === rids.length * picks.rounds, 'picks are conserved');
const ryan = holdings[rids.find(r => picks.managers[r] === 'Ryan')].items;
ok(ryan.filter(i => i.kind === 'got').length === 2 && ryan.filter(i => i.kind === 'away').length === 3, 'Ryan got two 1sts and sent three picks away');
const s28 = pickHoldings(picks, picks.seasons.find(s => s.season === 2028), rids).holdings;
ok(s28[3].total === 17 && s28[12].total === 16 && s28[5].total === 12, '2028 holdings follow the moves');
ok(s28[2].total === 16 && s28[8].total === 14, '2028: Repp\'s 8th went to Odom in the Connor-to-Connor trade');
ok(s28[4].total === 14 && s28[1].total === 16, '2028: CGreer\'s 4th went to Ben for Luther Burden III');
ok(picks.seasons.every(s => !('ruleChecked' in s)), 'the pick rule applies to every season');

console.log(`${pass} checks passed, ${fail} failed`);
if (fail) process.exit(1);
