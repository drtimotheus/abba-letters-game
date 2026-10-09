# Abba Letters — The Game (online multiplayer)

A Codenames-style online multiplayer game played with Timothy's 365
Abba Letters paintings instead of word cards. See **RULES.md** for the rules.

## Run it locally

```bash
cd abba-letters-game
npm install
node server.js
```

Open **http://localhost:3000** — create a room, share the 6-letter code,
friends join from their own browsers. 4+ players, two teams, one
Storyteller (clue-giver) per team.

## Put it online

The game is one Node.js process (serves the web app + runs the game over
WebSockets). Deploy it anywhere Node runs:

- **Railway / Render / Fly.io / a VPS**: push this folder, set the start
  command to `node server.js`. The port comes from the `PORT` env var.
- Players just open your URL — no accounts, no installs.

## The paintings

`public/art/` holds web-optimized paintings (`day_001.jpg` …), 768px wide.
The game currently ships with **53 paintings** (every 7th day of the year).

**Art source rule:** where a corrected *Fixed Images* version exists for a
day, the fixed version is used — matching the final Amazon KDP edition.
All other days use the *Plates* originals.

### Adding the remaining paintings

1. Take each remaining plate (`Day_NNN.png`; or the Fixed version
   `NN.png` when one exists for that day).
2. Resize to 768px wide, save as JPEG quality ~72 named `day_NNN.jpg`
   into `public/art/`.
3. Run `node gen-manifest.js` to rebuild `manifest.json`.
4. Restart the server. New rounds will deal from the full pool.

## Files

- `server.js` — game server (rooms, dealing, turns, win detection)
- `public/` — web client (`index.html`, `style.css`, `game.js`)
- `public/art/` — the paintings; `public/manifest.json` — the deck list
- `RULES.md` — the rules
- `test-sim.js` — automated 4-player simulated game (`node test-sim.js`
  while the server runs)

## Physical edition (The Game Crafter — later)

Notes for the eventual board-game version:

- **Card size:** poker (2.5" × 3.5") is the standard; tarot (2.75" × 4.75")
  shows the paintings off better. Pick one and keep the digital card backs
  matching.
- **Print resolution:** Game Crafter wants 300 DPI → poker needs 750×1050px
  minimum. Use the **original full-resolution plates/fixed PNGs** for print,
  not the 768px web JPEGs.
- **Deck:** the same 365 paintings work as the physical deck; the secret-key
  cards (gold/blue/neutral/deceiver grids) can be generated per game from
  the same 9/8/7/1 distribution in RULES.md.
- The digital game's look (dark parchment, gold/blue teams) is a ready-made
  visual identity for the box and cards.
