// Abba Letters game client
let ws, state = null;
const $ = id => document.getElementById(id);

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onmessage = e => handle(JSON.parse(e.data));
  ws.onclose = () => toast('Connection lost — refresh to rejoin.');
}

function send(o) { ws.send(JSON.stringify(o)); }
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}
function show(id) {
  ['screen-home', 'screen-lobby', 'screen-game'].forEach(s =>
    $(s).classList.toggle('hidden', s !== id));
}

function handle(m) {
  if (m.t === 'error') return toast(m.msg);
  if (m.t === 'state') { state = m; render(); }
}

$('btn-create').onclick = () => {
  const name = $('name').value.trim();
  if (!name) return toast('Enter your name first.');
  connect();
  ws.onopen = () => send({ t: 'create', name });
};
$('btn-join').onclick = () => {
  const name = $('name').value.trim();
  const code = $('code').value.trim().toUpperCase();
  if (!name) return toast('Enter your name first.');
  if (!code) return toast('Enter the room code.');
  connect();
  ws.onopen = () => send({ t: 'join', code, name });
};

document.querySelectorAll('.join-team').forEach(b =>
  b.onclick = () => send({ t: 'team', team: b.dataset.team }));
$('role-cluegiver').onchange = e => send({ t: 'role', clueGiver: e.target.checked });
$('btn-start').onclick = () => send({ t: 'start' });
$('btn-clue').onclick = () => {
  send({ t: 'clue', text: $('clue-text').value, count: $('clue-count').value });
  $('clue-text').value = '';
};
$('btn-pass').onclick = () => send({ t: 'pass' });

function render() {
  if (!state) return;
  if (!state.started) renderLobby();
  else renderGame();
}

function renderLobby() {
  show('screen-lobby');
  $('room-code').textContent = state.code;
  const gold = state.players.filter(p => p.team === 'gold');
  const blue = state.players.filter(p => p.team === 'blue');
  const unassigned = state.players.filter(p => !p.team);
  $('team-gold').innerHTML = gold.map(p =>
    `<li>${p.clueGiver ? '🎙️ ' : ''}${esc(p.name)}</li>`).join('') || '<li class="hint">—</li>';
  $('team-blue').innerHTML = blue.map(p =>
    `<li>${p.clueGiver ? '🎙️ ' : ''}${esc(p.name)}</li>`).join('') || '<li class="hint">—</li>';
  if (unassigned.length) {
    $('team-gold').innerHTML += unassigned.map(p =>
      `<li class="hint">${esc(p.name)} (pick a team)</li>`).join('');
  }
  $('role-cluegiver').checked = state.you.clueGiver;
}

function renderGame() {
  show('screen-game');
  const me = state.you;
  const turnName = state.turn === 'gold' ? 'Gold' : 'Blue';
  const tb = $('turn-banner');
  tb.textContent = state.winner
    ? `🏆 ${state.winner === 'gold' ? 'Gold' : 'Blue'} team wins!`
    : (state.turn === me.team ? `Your turn — ${turnName}` : `${turnName} team's turn`);
  tb.className = state.turn;

  const left = team => state.key
    ? state.grid.filter((_, i) => state.key[i] === team && !state.revealed[i]).length
    : '?';
  $('score').textContent = state.key
    ? `🟡 ${left('gold')} left · 🔵 ${left('blue')} left` : '';

  // clue area
  const ca = $('clue-area');
  if (state.clue) {
    ca.innerHTML = `“${esc(state.clue.text)}” <span class="clue-num">${state.clue.count}</span>
      <div class="hint">${esc(state.clue.by)} · ${state.clue.guessesLeft} guess${state.clue.guessesLeft === 1 ? '' : 'es'} left</div>`;
  } else if (state.winner) {
    ca.innerHTML = '<span class="hint">Round over</span>';
  } else {
    ca.innerHTML = `<span class="hint">${state.turn === me.team
      ? (me.clueGiver ? 'Give your clue below.' : 'Waiting for your Storyteller…')
      : 'Waiting for the other team…'}</span>`;
  }

  // board
  const board = $('board');
  board.innerHTML = '';
  state.grid.forEach((card, i) => {
    const b = document.createElement('button');
    b.className = 'painting';
    const img = document.createElement('img');
    img.src = card.file; img.alt = 'Day ' + card.day; img.loading = 'lazy';
    b.appendChild(img);
    const rev = state.revealed[i];
    if (rev) {
      b.classList.add('r-' + rev);
      b.disabled = true;
    } else {
      if (state.key) b.classList.add('k-' + state.key[i]); // storyteller sees key
      const canGuess = !state.winner && state.clue && !me.clueGiver && me.team === state.turn;
      if (canGuess) {
        b.classList.add('guessable');
        b.onclick = () => send({ t: 'guess', index: i });
      }
    }
    board.appendChild(b);
  });

  // clue form (only my team's storyteller, on our turn, no active clue)
  const myClueTurn = !state.winner && !state.clue &&
    me.clueGiver && me.team === state.turn;
  $('clue-form').classList.toggle('hidden', !myClueTurn);

  // pass button (guesser, my team's turn, clue active)
  const canPass = !state.winner && state.clue && !me.clueGiver && me.team === state.turn;
  $('btn-pass').classList.toggle('hidden', !canPass);

  // winner
  const wb = $('winner-banner');
  if (state.winner) {
    wb.classList.remove('hidden');
    wb.innerHTML = `🏆 <b>${state.winner === 'gold' ? 'Gold' : 'Blue'} team</b> wins the round!` +
      `<br><button class="primary" onclick="send({t:'newRound'})">New round</button>`;
  } else wb.classList.add('hidden');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
