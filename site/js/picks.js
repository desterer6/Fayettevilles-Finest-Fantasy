// Draft pick ownership math (no DOM), shared by the Reports page and tests.

export const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');

// Who holds what for one season: own picks kept, picks acquired, picks traded away, and the total.
export function pickHoldings(picks, season, rids) {
  const moves = season.moves || [];
  const shown = Math.max(7, ...moves.map(m => m.round));
  const owner = (from, round) => (moves.find(m => m.from === from && m.round === round) || {}).to ?? from;
  const out = {};
  for (const rid of rids) {
    const items = [];
    for (let r = 1; r <= shown; r++) {
      const o = owner(rid, r);
      items.push(o === rid ? { round: r, kind: 'own' } : { round: r, kind: 'away', other: o });
      for (const m of moves) if (m.round === r && m.to === rid && m.from !== rid) items.push({ round: r, kind: 'got', other: m.from });
    }
    const got = items.filter(x => x.kind === 'got').length, away = items.filter(x => x.kind === 'away').length;
    out[rid] = { items, total: picks.rounds + got - away };
  }
  return { holdings: out, shown, owner };
}
