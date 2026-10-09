// Simulated full game: 4 players, 2 teams, plays to completion.
// Verifies: room creation, teams, dealing, clue, guesses, win detection.
const WebSocket = require('ws');

const URL = 'ws://localhost:3000';
const results = [];
function check(name, cond) {
  results.push([cond ? 'PASS' : 'FAIL', name]);
  if (!cond) { console.error('FAILED:', name); process.exitCode = 1; }
}

function player(name) {
  return new Promise(resolve => {
    const ws = new WebSocket(URL);
    const p = { ws, name, states: [] };
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.t === 'state') { p.last = m; p.states.push(m); }
      if (m.t === 'error') { p.lastError = m.msg; }
    });
    ws.on('open', () => resolve(p));
  });
}
const send = (p, o) => p.ws.send(JSON.stringify(o));
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const host = await player('Host');
  send(host, { t: 'create', name: 'Host' });
  await wait(300);
  const code = host.last.code;
  check('room created with code', !!code && code.length === 6);

  const g2 = await player('GoldGuesser');
  const b1 = await player('BlueTeller');
  const b2 = await player('BlueGuesser');
  for (const [p, n] of [[g2, 'GoldGuesser'], [b1, 'BlueTeller'], [b2, 'BlueGuesser']]) {
    send(p, { t: 'join', code, name: n });
  }
  await wait(400);

  // teams: host + g2 = gold; b1 + b2 = blue. host & b1 are storytellers.
  send(host, { t: 'team', team: 'gold' }); send(host, { t: 'role', clueGiver: true });
  send(g2, { t: 'team', team: 'gold' });
  send(b1, { t: 'team', team: 'blue' }); send(b1, { t: 'role', clueGiver: true });
  send(b2, { t: 'team', team: 'blue' });
  await wait(400);

  send(host, { t: 'start' });
  await wait(400);
  check('game started', host.last.started === true);
  check('25 cards dealt', host.last.grid.length === 25);
  const key = host.last.key; // host is cluegiver, sees key
  check('key visible to storyteller', Array.isArray(key) && key.length === 25);
  check('guesser does not see key', g2.last.key === undefined);
  const counts = {};
  key.forEach(k => (counts[k] = (counts[k] || 0) + 1));
  check('9 gold cards', counts.gold === 9);
  check('8 blue cards', counts.blue === 8);
  check('7 neutral', counts.neutral === 7);
  check('1 deceiver', counts.deceiver === 1);
  check('gold starts', host.last.turn === 'gold');

  // Play: loop until winner. Strategy: storyteller gives clue "x", count 9;
  // guesser clicks all unrevealed own-team cards (cheating via key — fine for sim).
  let turns = 0;
  while (!host.last.winner && turns < 40) {
    turns++;
    const st = host.last;
    const me = st.turn;
    const teller = me === 'gold' ? host : b1;
    const guesser = me === 'gold' ? g2 : b2;
    // clue from the current team's teller (need fresh state per teller)
    const tellerState = teller.last;
    if (!tellerState.clue) {
      send(teller, { t: 'clue', text: 'light of the world', count: 9 });
      await wait(300);
    }
    const cur = guesser.last;
    const idx = cur.grid.findIndex((_, i) => !cur.revealed[i] && key[i] === me);
    if (idx === -1) { send(guesser, { t: 'pass' }); }
    else send(guesser, { t: 'guess', index: idx });
    await wait(250);
  }
  check('game finished with a winner', !!host.last.winner);
  console.log('winner:', host.last.winner, '| turns taken:', turns);
  // verify winner actually cleared their cards (deceiver would end it otherwise)
  const w = host.last.winner;
  const left = key.filter((k, i) => k === w && !host.last.revealed[i]).length;
  check('winner cleared all their paintings', left === 0);

  // new round
  send(host, { t: 'newRound' });
  await wait(400);
  check('new round resets winner', host.last.winner === null);
  check('new round redeals', host.last.grid.length === 25 && host.last.started);

  console.log('\n--- results ---');
  results.forEach(([s, n]) => console.log(s, '-', n));
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(fails === 0 ? 'ALL TESTS PASSED' : `${fails} FAILURES`);
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('SIM ERROR', e); process.exit(1); });
