# Durahim 1453 · Pokerbot Dashboard

A local website for the Imperial AI Hack pokerbots track. Three pages:
**Competition** (standings, rank race, movers, predicted Sunday table),
**Last Round** (chips per seat, table result, key hands, who paid us) and
**Our Bot** (bot health checks, performance, by seat, style, record vs teams).

Python 3.9+ and nothing else. No installs.

## Start

```bash
cd pokerdash
python3 app.py            # opens http://localhost:8000
```

On a Mac you can also double-click `start.command`.
Use `python3 app.py --port 8080` if 8000 is taken.

## Automatic updates

* **Standings** for every team (bb/100, rounds, bot version, timeouts, errors) are pulled
  from the tournament's public feed once a minute. Nothing to set up.
* **Your hands**: open **Settings** and paste your team's data token (the one in
  `python fetch_hands.py --token …` under "Your table's data" on the AI Poker Bots page).
  Every round your bot plays is then downloaded automatically, tagged with the bot
  version that played it. **Sync** pulls everything right away.

## Feed it data by hand

| What | How |
|---|---|
| New bot version | Drop `bot.py` on the page (or into `inbox/`). Each new file becomes v1, v2, v3… Identical files are ignored. |
| A round's hands | Drop the `.json` that `fetch_hands.py` downloads. Re-dropping the same round replaces it. |
| Standings | Copy the whole Standings table on imperialaihack.com/pokerbots and paste it anywhere on the page (or use **Paste standings**). |

Rounds are tagged with the newest bot version you had uploaded when the round came in.

### Fully automatic

Open **Settings** (bottom of the sidebar) and set:

* **Fetch command**: `python3 fetch_hands.py --token YOUR-TOKEN`
* **Starter-kit folder**: the folder that holds `fetch_hands.py`, e.g. `~/Downloads/pokerbots`
* **Auto-sync every N minutes**: e.g. `5` (a new round finishes every 5 minutes)

The app then runs the command, picks up every new hands `.json` in that folder,
and the pages refresh themselves. **Sync** does the same on demand.

The `inbox/` folder next to `app.py` is always watched: anything dropped there is
ingested within a few seconds and moved to `inbox/processed/`.

## What the numbers mean

* **bb/100**: big blinds won per 100 hands (blinds are 10/20, so 20 chips = 1 bb).
* **Luck / luck-adjusted**: for hands that went all-in before the river with every
  showdown hand known, the result is replaced by the share of the pot those cards
  were worth at the moment of the all-in. "Hot" means you won more than the cards
  deserved.
* **Who paid us / Vs teams**: each hand's winnings are split across the losers in
  proportion to what they lost, so the per-opponent numbers add up to your result.
* **Style**: VPIP (put money in pre-flop), PFR (raised pre-flop), 3-bet (re-raised a
  single raise), fold to c-bet (folded to the pre-flop raiser's flop bet), went to /
  won at showdown. The red tick is the average of everyone else at your tables.
* **Bot health**: static checks on `bot.py` against the sandbox rules (200 KB,
  standard library only, `class Agent` with `act()`, no files or network). Decision
  timing is not in the hand files, so it is not shown.

## Files

```
app.py          server, storage, inbox and sync
analytics.py    hand parsing and statistics (also usable on its own)
static/         the three pages (index.html, styles.css, app.js)
data/           everything you upload (created on first run)
inbox/          drop folder (created on first run)
config.json     settings (created on first run)
```

Delete `data/` to start from scratch.
