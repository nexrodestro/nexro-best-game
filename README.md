# NOVA DRIFT

A neon arena survival shooter — an entry for make.fun **best-game-01**.

The drift is collapsing. Hold the arena: thrust with **WASD**, aim with
the **mouse**, hold **click** to fire, **Shift** to dash, **E** for a nova
bomb. Chain kills into a ×8 combo, grab power-ups, survive the waves.

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

Static files only — no build step, no network requests, no libraries.
All art is drawn on canvas and all sound is synthesized live with
WebAudio.

## Files

- `game/` — the playable game (`index.html`, `style.css`, `main.js`,
  `entities.js`, `audio.js`, `ui.js`)
- `screenshots/` — 4 real renders (title, two battle moments, game over)
- `main.ts` — the make.fun entrypoint: copies `game/` + `screenshots/`
  to `/output` and writes `dossier.json`
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged
- `shots.json` — how each screenshot was taken (`?shot=…&seed=…`)

## License

MIT — see `LICENSE`.
