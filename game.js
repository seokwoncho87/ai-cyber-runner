const CHARACTERS = {
  ppi: {
    name: "삐야",
    img: "assets/ppi.png",
    maxLives: 3,
    hitRange: 7,
    traits: ["최대 체력 3", "피격 범위 작음"],
  },
  oru: {
    name: "오르",
    img: "assets/oru.png",
    maxLives: 5,
    hitRange: 12,
    traits: ["최대 체력 5", "피격 범위 넓음"],
  },
};

const ENTITY_ART = {
  virus: { src: "assets/virus.png", alt: "바이러스" },
  vaccine: { src: "assets/vaccine.png", alt: "백신" },
  data: { src: "assets/data.png", alt: "데이터" },
};

const LANE_X = ["16.6%", "50%", "83.4%"];
const PLAYER_Y = 82;
const HIGH_SCORE_KEY = "cyberRunnerHighScore";
const PREFS_KEY = "cyberRunnerSettings";
const MUTE_KEY = "cyberRunnerMuted";
const BGM_GAIN = { lobby: 0.6, game: 0.48 };
const SFX_GAIN = { heal: 1, hit: 0.88, data: 1 };

function defaultKeys() {
  return {
    left: ["ArrowLeft", "KeyA"],
    right: ["ArrowRight", "KeyD"],
    jump: ["ArrowUp", "Space", "KeyW"],
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value))));
}

function sanitizeKeys(raw) {
  const defaults = defaultKeys();
  if (!raw || typeof raw !== "object") return defaults;
  const clean = {};
  const used = new Set();
  for (const action of ["left", "right", "jump"]) {
    const incoming = Array.isArray(raw[action]) ? raw[action] : [];
    clean[action] = defaults[action].map((fallback, index) => {
      const code = incoming[index];
      const ok = typeof code === "string" && /^[A-Za-z0-9]+$/.test(code) && !used.has(code);
      const next = ok ? code : fallback;
      if (!used.has(next)) {
        used.add(next);
        return next;
      }
      used.add(fallback);
      return fallback;
    });
  }
  return clean;
}

function loadPrefs() {
  const prefs = { bgm: 70, sfx: 80, keys: defaultKeys() };
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (saved && typeof saved === "object") {
      if (Number.isFinite(Number(saved.bgm))) prefs.bgm = clamp(saved.bgm, 0, 100);
      if (Number.isFinite(Number(saved.sfx))) prefs.sfx = clamp(saved.sfx, 0, 100);
      prefs.keys = sanitizeKeys(saved.keys);
      return prefs;
    }
  } catch {
    /* keep defaults */
  }
  if (localStorage.getItem(MUTE_KEY) === "1") {
    prefs.bgm = 0;
    prefs.sfx = 0;
  }
  return prefs;
}

const prefs = loadPrefs();

function createAudio(src, { loop = false, volume = 1 } = {}) {
  const audio = new Audio(src);
  audio.loop = loop;
  audio.volume = volume;
  audio.preload = "auto";
  return audio;
}

const tracks = {
  lobby: createAudio("assets/audio/bgm-lobby.mp3", { loop: true, volume: 0.42 }),
  game: createAudio("assets/audio/bgm-game.mp3", { loop: true, volume: 0.34 }),
  heal: createAudio("assets/audio/sfx-heal.mp3", { volume: 0.7 }),
  hit: createAudio("assets/audio/sfx-hit.mp3", { volume: 0.62 }),
  data: createAudio("assets/audio/sfx-data.mp3", { volume: 0.7 }),
};

const audioState = {
  unlocked: false,
  currentBgm: "lobby",
};

function bgmLevel(name) {
  return BGM_GAIN[name] * (prefs.bgm / 100);
}

function playSfx(name) {
  if (prefs.sfx <= 0 || !tracks[name]) return;
  const clip = tracks[name].cloneNode();
  clip.volume = Math.min(1, (SFX_GAIN[name] || 1) * (prefs.sfx / 100));
  clip.play().catch(() => {});
}

function playBgm(name, { restart = false } = {}) {
  audioState.currentBgm = name;
  const next = name === "game" ? tracks.game : tracks.lobby;
  const other = name === "game" ? tracks.lobby : tracks.game;
  other.pause();
  next.volume = bgmLevel(name);
  if (prefs.bgm <= 0 || !audioState.unlocked) {
    next.pause();
    return;
  }
  if (restart) next.currentTime = 0;
  next.play().catch(() => {});
}

function applyBgmVolumes() {
  tracks.lobby.volume = bgmLevel("lobby");
  tracks.game.volume = bgmLevel("game");
  if (prefs.bgm <= 0) {
    tracks.lobby.pause();
    tracks.game.pause();
    return;
  }
  if (!audioState.unlocked) return;
  const current = audioState.currentBgm === "game" ? tracks.game : tracks.lobby;
  if (current.paused) playBgm(audioState.currentBgm);
}

function unlockAudio() {
  if (audioState.unlocked) return;
  audioState.unlocked = true;
  playBgm(audioState.currentBgm);
}

function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

const selectScreen = document.getElementById("select-screen");
const gameScreen = document.getElementById("game-screen");
const overlay = document.getElementById("overlay");
const stage = document.getElementById("stage");
const entitiesEl = document.getElementById("entities");
const popupsEl = document.getElementById("popups");
const playerEl = document.getElementById("player");
const playerImg = document.getElementById("player-img");
const scoreEl = document.getElementById("score");
const heartsEl = document.getElementById("hearts");
const levelLabel = document.getElementById("level-label");
const finalScoreEl = document.getElementById("final-score");
const bestScoreEl = document.getElementById("best-score");
const settingsPanel = document.getElementById("settings-panel");
const settingsHome = document.getElementById("panel-settings");
const settingsOverlay = document.getElementById("settings-overlay");
const settingsSlot = document.getElementById("settings-overlay-slot");
const settingsKicker = document.getElementById("settings-kicker");
const settingsNote = document.getElementById("settings-note");
const bgmInput = document.getElementById("bgm-volume");
const sfxInput = document.getElementById("sfx-volume");
const bgmLabel = document.getElementById("bgm-volume-label");
const sfxLabel = document.getElementById("sfx-volume-label");
const keyError = document.getElementById("key-error");

const state = {
  running: false,
  paused: false,
  character: "ppi",
  lane: 1,
  lives: CHARACTERS.ppi.maxLives,
  bonusScore: 0,
  elapsed: 0,
  entities: [],
  spawnTimer: 0,
  jumpUntil: 0,
  invincibleUntil: 0,
  lastTime: 0,
  entityId: 0,
};

const rebind = { action: null, index: -1 };
let keyMessageTimer = 0;

function maxLives() {
  return CHARACTERS[state.character].maxLives;
}

function getLevel(elapsed = state.elapsed) {
  if (elapsed < 30) return 1;
  if (elapsed < 60) return 2;
  if (elapsed < 90) return 3;
  return 4;
}

function getDifficulty() {
  const level = getLevel();
  if (level === 1) return { speed: 24, spawnEvery: 1.5, twinChance: 0 };
  if (level === 2) return { speed: 36, spawnEvery: 1.1, twinChance: 0.12 };
  if (level === 3) return { speed: 44, spawnEvery: 0.92, twinChance: 0.42 };
  return { speed: 54, spawnEvery: 0.78, twinChance: 0.55 };
}

function totalScore() {
  return Math.floor(state.elapsed * 10) + state.bonusScore;
}

function renderHud() {
  const max = maxLives();
  scoreEl.textContent = totalScore().toLocaleString();
  heartsEl.textContent = "❤️".repeat(Math.max(0, state.lives)) + "🖤".repeat(Math.max(0, max - state.lives));
  levelLabel.textContent = `LEVEL ${getLevel()}`;
}

function setLane(next) {
  state.lane = Math.max(0, Math.min(2, next));
  playerEl.style.left = LANE_X[state.lane];
}

function isJumping(now) {
  return now < state.jumpUntil;
}

function jump() {
  if (!state.running || state.paused) return;
  const now = state.elapsed;
  if (isJumping(now)) return;
  state.jumpUntil = now + 0.62;
  playerEl.classList.add("jumping");
}

function move(dir) {
  if (!state.running || state.paused) return;
  setLane(state.lane + dir);
}

function flash(className) {
  stage.classList.remove("hit", "heal");
  void stage.offsetWidth;
  stage.classList.add(className);
  setTimeout(() => stage.classList.remove(className), 220);
}

function addPopup(text, lane, y) {
  const el = document.createElement("div");
  el.className = "popup";
  el.textContent = text;
  el.style.left = LANE_X[lane];
  el.style.top = `${y}%`;
  popupsEl.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

function spawnWave() {
  const difficulty = getDifficulty();
  const count = Math.random() < difficulty.twinChance ? 2 : 1;
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5).slice(0, count);

  lanes.forEach((lane, index) => {
    let type = "virus";
    if (count === 1) {
      const roll = Math.random();
      if (roll < 0.16) type = "vaccine";
      else if (roll < 0.32) type = "data";
    } else if (index === 0 && Math.random() < 0.12) {
      type = "data";
    }

    const art = ENTITY_ART[type];
    const el = document.createElement("div");
    el.className = `entity ${type === "virus" ? "jumpable" : type}`;
    const img = document.createElement("img");
    img.src = art.src;
    img.alt = art.alt;
    img.draggable = false;
    el.appendChild(img);
    el.style.left = LANE_X[lane];
    el.style.top = "-8%";
    entitiesEl.appendChild(el);

    state.entities.push({
      id: ++state.entityId,
      type,
      lane,
      y: -8,
      cleared: false,
      el,
    });
  });
}

function hitVirus() {
  if (!state.running || state.elapsed < state.invincibleUntil) return;
  state.lives -= 1;
  state.invincibleUntil = state.elapsed + 1;
  playerEl.classList.add("invincible");
  playSfx("hit");
  flash("hit");
  renderHud();
  if (state.lives <= 0) gameOver();
}

function takeVaccine(entity) {
  if (state.lives < maxLives()) {
    state.lives += 1;
    addPopup("HP +1", entity.lane, entity.y);
    playSfx("heal");
    flash("heal");
  } else {
    state.bonusScore += 100;
    addPopup("+100", entity.lane, entity.y);
    playSfx("data");
  }
  renderHud();
}

function takeData(entity) {
  state.bonusScore += 50;
  addPopup("DATA +50", entity.lane, entity.y);
  playSfx("data");
  renderHud();
}

function removeEntity(entity) {
  entity.el.remove();
  state.entities = state.entities.filter((item) => item.id !== entity.id);
}

function updateEntities(dt) {
  const { speed } = getDifficulty();
  const jumping = isJumping(state.elapsed);
  const range = CHARACTERS[state.character].hitRange;

  state.entities.forEach((entity) => {
    entity.y += speed * dt;
    entity.el.style.top = `${entity.y}%`;

    const close = entity.lane === state.lane && Math.abs(entity.y - PLAYER_Y) < range;
    if (close) {
      if (entity.type === "vaccine") {
        takeVaccine(entity);
        removeEntity(entity);
        return;
      }
      if (entity.type === "data") {
        takeData(entity);
        removeEntity(entity);
        return;
      }
      if (jumping) {
        entity.cleared = true;
        return;
      }
      if (!entity.cleared) {
        hitVirus();
        removeEntity(entity);
      }
    }
  });

  state.entities.filter((entity) => entity.y > 108).forEach(removeEntity);
}

function updatePlayerVisual() {
  if (!isJumping(state.elapsed)) {
    playerEl.classList.remove("jumping");
  }
  if (state.elapsed >= state.invincibleUntil) {
    playerEl.classList.remove("invincible");
  }
}

function loop(timestamp) {
  if (!state.running) return;
  if (state.paused) {
    state.lastTime = 0;
    requestAnimationFrame(loop);
    return;
  }
  if (!state.lastTime) state.lastTime = timestamp;
  const dt = Math.min(0.05, (timestamp - state.lastTime) / 1000);
  state.lastTime = timestamp;
  state.elapsed += dt;
  state.spawnTimer -= dt;

  if (state.spawnTimer <= 0) {
    spawnWave();
    state.spawnTimer = getDifficulty().spawnEvery;
  }

  updateEntities(dt);
  updatePlayerVisual();
  renderHud();
  requestAnimationFrame(loop);
}

function resetGame() {
  state.running = true;
  state.paused = false;
  state.lane = 1;
  state.lives = maxLives();
  state.bonusScore = 0;
  state.elapsed = 0;
  state.spawnTimer = 0.8;
  state.jumpUntil = 0;
  state.invincibleUntil = 0;
  state.lastTime = 0;
  state.entities.forEach((entity) => entity.el.remove());
  state.entities = [];
  popupsEl.innerHTML = "";
  playerEl.classList.remove("ppi", "oru", "jumping", "invincible");
  playerEl.classList.add(state.character);
  playerImg.src = CHARACTERS[state.character].img;
  stage.classList.remove("paused", "hit", "heal");
  setLane(1);
  overlay.classList.add("hidden");
  renderHud();
}

function parkSettings() {
  settingsHome.appendChild(settingsPanel);
  settingsPanel.classList.remove("as-overlay");
  settingsNote.classList.add("hidden");
  settingsKicker.textContent = "OPTIONS";
  settingsOverlay.classList.add("hidden");
  stage.classList.remove("paused");
}

function startGame(character) {
  parkSettings();
  state.paused = false;
  state.character = character;
  selectScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  resetGame();
  playBgm("game", { restart: true });
  requestAnimationFrame(loop);
}

function gameOver() {
  state.running = false;
  state.paused = false;
  const score = totalScore();
  const best = Math.max(score, Number(localStorage.getItem(HIGH_SCORE_KEY) || 0));
  localStorage.setItem(HIGH_SCORE_KEY, String(best));
  finalScoreEl.textContent = `${score.toLocaleString()}점`;
  bestScoreEl.textContent = best.toLocaleString();
  overlay.classList.remove("hidden");
}

function showSelect() {
  state.running = false;
  state.paused = false;
  parkSettings();
  overlay.classList.add("hidden");
  gameScreen.classList.add("hidden");
  selectScreen.classList.remove("hidden");
  playBgm("lobby", { restart: true });
}

function showMainTab(name) {
  document.querySelectorAll(".main-tabs .tab").forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.getElementById("panel-chars").classList.toggle("hidden", name !== "chars");
  settingsHome.classList.toggle("hidden", name !== "settings");
  if (name !== "settings") cancelRebind();
}

function openSettingsOverlay() {
  if (state.running) {
    state.paused = true;
    stage.classList.add("paused");
    settingsKicker.textContent = "PAUSED";
    settingsNote.classList.remove("hidden");
  }
  cancelRebind();
  settingsPanel.classList.add("as-overlay");
  settingsSlot.appendChild(settingsPanel);
  settingsOverlay.classList.remove("hidden");
}

function closeSettingsOverlay() {
  state.paused = false;
  state.lastTime = 0;
  parkSettings();
}

function keyLabel(code) {
  const named = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Space: "Space",
    Enter: "Enter",
    Backspace: "⌫",
    ShiftLeft: "Shift",
    ShiftRight: "RShift",
    ControlLeft: "Ctrl",
    ControlRight: "RCtrl",
    AltLeft: "Alt",
    AltRight: "RAlt",
  };
  if (named[code]) return named[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return code.slice(6);
  return code;
}

function showKeyMessage(message, isError) {
  keyError.textContent = message;
  keyError.classList.toggle("is-error", Boolean(isError));
  clearTimeout(keyMessageTimer);
  if (isError) {
    keyMessageTimer = setTimeout(() => {
      if (rebind.action) showKeyMessage("원하는 키를 누르세요", false);
      else showKeyMessage("", false);
    }, 1400);
  }
}

function renderKeys() {
  document.querySelectorAll(".key-row").forEach((row) => {
    const action = row.dataset.action;
    const slots = row.querySelector(".key-slots");
    slots.replaceChildren();
    prefs.keys[action].forEach((code, index) => {
      const listening = rebind.action === action && rebind.index === index;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = listening ? "keycap listening" : "keycap";
      btn.textContent = listening ? "입력" : keyLabel(code);
      btn.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        rebind.action = action;
        rebind.index = index;
        showKeyMessage("원하는 키를 누르세요", false);
        renderKeys();
      });
      slots.appendChild(btn);
    });
  });
}

function cancelRebind() {
  rebind.action = null;
  rebind.index = -1;
  showKeyMessage("", false);
  renderKeys();
}

function keyInUse(code, action, index) {
  return Object.entries(prefs.keys).some(([other, list]) =>
    list.some((existing, itemIndex) => existing === code && !(other === action && itemIndex === index))
  );
}

function applyRebind(event) {
  if (event.code === "Escape") {
    cancelRebind();
    return;
  }
  if (/^F\d+$/.test(event.code) || event.code === "Tab" || event.code.startsWith("Meta")) return;
  const { action, index } = rebind;
  if (!action || prefs.keys[action][index] == null) return;
  if (keyInUse(event.code, action, index)) {
    showKeyMessage("이미 다른 동작에 쓰이는 키예요", true);
    return;
  }
  prefs.keys[action][index] = event.code;
  savePrefs();
  rebind.action = null;
  rebind.index = -1;
  showKeyMessage("", false);
  renderKeys();
}

function renderCharacterCards() {
  document.querySelectorAll(".char-card").forEach((card) => {
    const data = CHARACTERS[card.dataset.character];
    const list = card.querySelector(".traits");
    list.replaceChildren();
    data.traits.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      list.appendChild(li);
    });
  });
}

function syncVolumeControls() {
  bgmInput.value = String(prefs.bgm);
  sfxInput.value = String(prefs.sfx);
  bgmLabel.textContent = `${prefs.bgm}%`;
  sfxLabel.textContent = `${prefs.sfx}%`;
  applyBgmVolumes();
}

document.querySelectorAll(".char-card").forEach((card) => {
  card.addEventListener("click", () => startGame(card.dataset.character));
});

document.querySelectorAll(".main-tabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => showMainTab(tab.dataset.tab));
});

document.getElementById("btn-left").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  move(-1);
});
document.getElementById("btn-right").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  move(1);
});
document.getElementById("btn-jump").addEventListener("pointerdown", (event) => {
  event.preventDefault();
  jump();
});

document.getElementById("btn-retry").addEventListener("click", () => {
  resetGame();
  playBgm("game", { restart: true });
  requestAnimationFrame(loop);
});
document.getElementById("btn-change").addEventListener("click", showSelect);
document.getElementById("btn-gear").addEventListener("click", openSettingsOverlay);
document.getElementById("btn-settings-back").addEventListener("click", closeSettingsOverlay);
settingsOverlay.addEventListener("click", (event) => {
  if (event.target === settingsOverlay) closeSettingsOverlay();
});

bgmInput.addEventListener("input", () => {
  prefs.bgm = Number(bgmInput.value);
  bgmLabel.textContent = `${prefs.bgm}%`;
  audioState.unlocked = true;
  applyBgmVolumes();
  savePrefs();
});

sfxInput.addEventListener("input", () => {
  prefs.sfx = Number(sfxInput.value);
  sfxLabel.textContent = `${prefs.sfx}%`;
  savePrefs();
});

sfxInput.addEventListener("change", () => {
  audioState.unlocked = true;
  playSfx("heal");
});

document.getElementById("btn-keys-reset").addEventListener("click", () => {
  prefs.keys = defaultKeys();
  savePrefs();
  cancelRebind();
});

window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });

window.addEventListener("keydown", (event) => {
  if (rebind.action) {
    event.preventDefault();
    applyRebind(event);
    return;
  }
  if (event.code === "Escape" && !settingsOverlay.classList.contains("hidden")) {
    event.preventDefault();
    closeSettingsOverlay();
    return;
  }
  if (event.repeat || !state.running || state.paused) return;
  const code = event.code;
  if (prefs.keys.left.includes(code)) {
    event.preventDefault();
    move(-1);
  } else if (prefs.keys.right.includes(code)) {
    event.preventDefault();
    move(1);
  } else if (prefs.keys.jump.includes(code)) {
    event.preventDefault();
    jump();
  }
});

renderCharacterCards();
renderKeys();
syncVolumeControls();
renderHud();
setLane(1);
