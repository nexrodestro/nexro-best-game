// NOVA DRIFT — interface. One job: everything the player reads on the
// page — the HUD, the title / pause / game-over screens, and the toast
// banners. The canvas draws the game; this file draws the chrome around it.

import { POWERUP_DEFS } from './entities.js';

const $ = (id) => document.getElementById(id);

const els = {
  hud: $('hud'),
  score: $('hud-score'),
  combo: $('hud-combo'),
  comboN: $('hud-combo-n'),
  wave: $('hud-wave'),
  waveState: $('hud-wave-state'),
  hull: $('hud-hull'),
  best: $('hud-best'),
  powers: $('hud-powers'),
  dashFill: $('hud-dash-fill'),
  title: $('screen-title'),
  over: $('screen-over'),
  pause: $('screen-pause'),
  titleBest: $('title-best'),
  overScore: $('over-score'),
  overWave: $('over-wave'),
  overKills: $('over-kills'),
  overCombo: $('over-combo'),
  overRecord: $('over-record'),
  toast: $('toast'),
  muteBtn: $('btn-mute'),
};

let toastTimer = null;

export const UI = {
  showTitle(best) {
    els.title.classList.remove('hidden');
    els.over.classList.add('hidden');
    els.pause.classList.add('hidden');
    els.hud.classList.add('hidden');
    els.titleBest.textContent = best.toLocaleString('en-US');
  },

  showHud() {
    els.title.classList.add('hidden');
    els.over.classList.add('hidden');
    els.pause.classList.add('hidden');
    els.hud.classList.remove('hidden');
  },

  showPause(on) {
    els.pause.classList.toggle('hidden', !on);
  },

  showGameOver(stats, isRecord) {
    els.overScore.textContent = stats.score.toLocaleString('en-US');
    els.overWave.textContent = stats.wave;
    els.overKills.textContent = stats.kills;
    els.overCombo.textContent = '×' + Math.max(1, stats.bestCombo);
    els.overRecord.classList.toggle('hidden', !isRecord);
    els.over.classList.remove('hidden');
  },

  hideGameOver() { els.over.classList.add('hidden'); },

  updateHud(s) {
    els.score.textContent = s.score.toLocaleString('en-US');
    els.wave.textContent = s.wave;
    els.waveState.textContent = s.waveState;
    els.best.textContent = 'BEST ' + s.best.toLocaleString('en-US');
    const hearts = '♥'.repeat(Math.max(0, s.hull)) +
      '<span class="lost">' + '♥'.repeat(Math.max(0, s.maxHull - s.hull)) + '</span>';
    els.hull.innerHTML = hearts;
    if (s.combo > 1) {
      els.combo.classList.remove('hidden');
      els.comboN.textContent = Math.min(s.combo, 8);
    } else {
      els.combo.classList.add('hidden');
    }
    const chips = [];
    for (const [kind, left] of Object.entries(s.powers)) {
      if (kind === 'bomb' || left <= 0) continue;
      const def = POWERUP_DEFS[kind];
      chips.push(`<span class="power-chip">${def.label} ${Math.ceil(left)}s</span>`);
    }
    if (s.bombs > 0) chips.push(`<span class="power-chip hot">NOVA ×${s.bombs} [E]</span>`);
    els.powers.innerHTML = chips.join('');
    const pct = Math.max(0, Math.min(1, 1 - s.dashCd / s.dashCdMax));
    els.dashFill.style.width = (pct * 100).toFixed(0) + '%';
  },

  toast(text, ms = 1600) {
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
  },

  setMute(muted) {
    els.muteBtn.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
  },

  bind({ onStart, onRestart, onResume, onMute }) {
    $('btn-start').addEventListener('click', onStart);
    $('btn-restart').addEventListener('click', onRestart);
    $('btn-resume').addEventListener('click', onResume);
    els.muteBtn.addEventListener('click', onMute);
  },
};

// Screenshot states: ?shot=start | play | end (&seed=N). The kit's own
// starter ships the same idea (shots.json) — a deterministic render of
// the real game for the dossier's screenshots, nothing staged by hand.
export function shotParams() {
  const q = new URLSearchParams(location.search);
  const shot = q.get('shot');
  if (!shot) return null;
  const seed = parseInt(q.get('seed') || '1', 10) || 1;
  return { shot, seed };
}
