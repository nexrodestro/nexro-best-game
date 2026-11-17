# NOVA DRIFT — dossier

**Competition:** make.fun best-game-01 — "Make the best game"
**Pot:** $1,000 (1st $400, 2nd $200, 3rd $120, 4th–10th $40)
**Deadline:** Wed 2026-11-18 18:00 UTC (Thu 2026-11-19 01:00 WIB)
**Repo:** https://github.com/nexrodestro/nexro-best-game

## The game

A neon arena survival shooter. The drift is collapsing and you hold the
arena alone: thrust with WASD, aim with the mouse, hold click to fire,
dash through danger with Shift, and spend nova bombs (E) when the screen
fills up. Enemies come in waves that grow harder — drifters, darters,
weavers that shoot back, splitters that burst into minis, and an elite
every third wave. Kills chain a combo multiplier (up to ×8); power-ups
drop from kills: spread shot, rapid fire, shield, nova bomb, +1 hull.
Three hull, no checkpoints — the score is the goal.

## Controls

| Input | Action |
|---|---|
| W A S D / arrows | thrust |
| Mouse | aim |
| Hold left click / Space | fire |
| Shift / right click | dash (2.2 s cooldown, brief invulnerability) |
| E | nova bomb (clears the screen) |
| P | pause |
| M | mute |
| R | restart after game over |
| Enter | launch from the title screen |

## What makes it fun

- **One tight loop, done well:** move, aim, shoot, dash — every second
  asks for a decision, and the combo multiplier makes every kill matter.
- **Growing challenge:** five enemy types with distinct movement and
  attacks, waves that scale in count, speed and HP, elites every 3rd wave.
- **Feel:** particles on every kill, screen shake, hit-stop, floating
  score text, engine flame, thruster trail, shield ring, and a full
  synthesized soundscape (laser, explosions, power-up arpeggios, wave
  horns) — all generated live with WebAudio, zero audio files.
- **Complete:** title screen with controls and best score, HUD (score,
  combo, wave, hull hearts, power-up timers, dash meter), pause, game
  over with run stats and a restart — all shown in the screenshots.

## Files (game/, all original, no libraries, no network)

| File | Job |
|---|---|
| `index.html` | page, canvas, HUD and screens |
| `style.css` | presentation: palette, glow, HUD, overlays |
| `main.js` | loop, state machine, input, waves, collisions, rendering |
| `entities.js` | player, enemy types, bullets, particles, power-ups |
| `audio.js` | synthesized WebAudio sound effects + drone |
| `ui.js` | HUD updates, screens, toasts, screenshot states |

## Screenshots (screenshots/, real renders in headless Chrome, 1280×800)

| File | Shows |
|---|---|
| `1-play.jpg` (cover) | mid-battle: combo ×8, spread shot, score popups |
| `2-title.jpg` | title screen, controls, best score, LAUNCH |
| `3-battle.jpg` | second battle moment, elite flashing, dash meter |
| `4-over.jpg` | game over: score 5,280, wave 6, 87 kills, NEW BEST, restart |

Screenshot states are deterministic renders of the real game
(`?shot=start|play|end&seed=N`, same pattern as the kit's starter
`shots.json`): in `play` the ship flies itself (autopilot orbits the
arena, aims at the nearest enemy, fires), so the capture is a living
slice of gameplay, not a posed frame.

## Verification (this session)

- Served locally and rendered in headless Chromium: title, gameplay and
  game-over states all render with no JavaScript errors.
- Autopilot playtest: score climbs, waves advance (wave 3 → 5), kills
  chain the combo, power-ups drop and apply, hull damage and game over
  all trigger correctly.
- `main.ts` run locally (`MAKEFUN_OUTPUT_DIR=out node main.ts`):
  `out/` holds `game/`, `screenshots/` and a `dossier.json` written by
  the vendored `buildDossier`; all gate caps respected (4 screenshots,
  each ≤ 256 KiB; game/ 6 files, far under 993 files / 48 MiB).

## Still needed for submission (parent's job)

- Push is done by this session (remote `origin` =
  https://github.com/nexrodestro/nexro-best-game, public, empty).
- Parent: bundle the sessions with the kit CLI (harness flags +
  `--muse-usage` for thinking_priced), run the site pre-submit checks,
  submit with repo URL + commit SHA before the deadline.
