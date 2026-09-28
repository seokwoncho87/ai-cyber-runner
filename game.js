const CHARACTERS = {
  ppi: {
    name: "삐야",
    img: "assets/ppi.png",
  },
  oru: {
    name: "오르",
    img: "assets/oru.png",
  },
};

const MAX_LIVES = 5;
const LANE_X = ["16.6%", "50%", "83.4%"];
const PLAYER_Y = 82;
const HIT_RANGE = 9;
const HIGH_SCORE_KEY = "cyberRunnerHighScore";
const MUTE_KEY = "cyberRunnerMuted";

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

const audio = {
  muted: localStorage.getItem(MUTE_KEY) === "1",
  unlocked: false,
  currentBgm: "lobby",
};

function playSfx(name) {
  if (audio.muted || !tracks[name]) return;
  const clip = tracks[name].cloneNode();
  clip.volume = tracks[name].volume;
  clip.play().catch(() => {});
}

function playBgm(name, { restart = false } = {}) {
  audio.currentBgm = name;
  const lobby = tracks.lobby;
  const game = tracks.game;
  const next = name === "game" ? game : lobby;
  const other = name === "game" ? lobby : game;

  other.pause();
  if (audio.muted || !audio.unlocked) {
    next.pause();
    return;
  }
  if (restart) next.currentTime = 0;
  next.play().catch(() => {});
}

function unlockAudio() {
  if (audio.unlocked) return;
  audio.unlocked = true;
  playBgm(audio.currentBgm);
}

function syncMuteButton() {
  const btn = document.getElementById("btn-mute");
  btn.textContent = audio.muted ? "🔇" : "🔊";
  btn.setAttribute("aria-label", audio.muted ? "소리 켜기" : "소리 끄기");
}

function setMuted(muted) {
  audio.muted = muted;
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  syncMuteButton();
  if (muted) {
    tracks.lobby.pause();
    tracks.game.pause();
  } else {
    audio.unlocked = true;
    playBgm(audio.currentBgm);
  }
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

const state = {
  running: false,
  character: "ppi",
  lane: 1,
  lives: MAX_LIVES,
  bonusScore: 0,
  elapsed: 0,
  entities: [],
  spawnTimer: 0,
  jumpUntil: 0,
  invincibleUntil: 0,
  lastTime: 0,
  entityId: 0,
};

function getLevel(elapsed = state.elapsed) {
  if (elapsed < 30) return 1;
  if (elapsed < 60) return 2;
  if (elapsed < 90) return 3;
  return 4;
}

function getSettings() {
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
  scoreEl.textContent = totalScore().toLocaleString();
  heartsEl.textContent = "❤️".repeat(state.lives) + "🖤".repeat(MAX_LIVES - state.lives);
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
  if (!state.running) return;
  const now = state.elapsed;
  if (isJumping(now)) return;
  state.jumpUntil = now + 0.62;
  playerEl.classList.add("jumping");
}

function move(dir) {
  if (!state.running) return;
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
  const settings = getSettings();
  const count = Math.random() < settings.twinChance ? 2 : 1;
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

    const el = document.createElement("div");
    el.className = `entity ${type === "virus" ? "jumpable" : type}`;
    el.textContent = type === "vaccine" ? "💉" : type === "data" ? "💾" : "🦠";
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
  if (state.elapsed < state.invincibleUntil) return;
  state.lives -= 1;
  state.invincibleUntil = state.elapsed + 1;
  playerEl.classList.add("invincible");
  playSfx("hit");
  flash("hit");
  renderHud();
  if (state.lives <= 0) gameOver();
}

function takeVaccine(entity) {
  if (state.lives < MAX_LIVES) {
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
  const { speed } = getSettings();
  const jumping = isJumping(state.elapsed);

  state.entities.forEach((entity) => {
    entity.y += speed * dt;
    entity.el.style.top = `${entity.y}%`;

    const close = entity.lane === state.lane && Math.abs(entity.y - PLAYER_Y) < HIT_RANGE;
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
  if (!state.lastTime) state.lastTime = timestamp;
  const dt = Math.min(0.05, (timestamp - state.lastTime) / 1000);
  state.lastTime = timestamp;
  state.elapsed += dt;
  state.spawnTimer -= dt;

  if (state.spawnTimer <= 0) {
    spawnWave();
    state.spawnTimer = getSettings().spawnEvery;
  }

  updateEntities(dt);
  updatePlayerVisual();
  renderHud();
  requestAnimationFrame(loop);
}

function resetGame() {
  state.running = true;
  state.lane = 1;
  state.lives = MAX_LIVES;
  state.bonusScore = 0;
  state.elapsed = 0;
  state.spawnTimer = 0.8;
  state.jumpUntil = 0;
  state.invincibleUntil = 0;
  state.lastTime = 0;
  state.entities.forEach((entity) => entity.el.remove());
  state.entities = [];
  popupsEl.innerHTML = "";
  playerEl.classList.remove("jumping", "invincible");
  playerImg.src = CHARACTERS[state.character].img;
  setLane(1);
  overlay.classList.add("hidden");
  renderHud();
}

function startGame(character) {
  state.character = character;
  selectScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  resetGame();
  playBgm("game", { restart: true });
  requestAnimationFrame(loop);
}

function gameOver() {
  state.running = false;
  const score = totalScore();
  const best = Math.max(score, Number(localStorage.getItem(HIGH_SCORE_KEY) || 0));
  localStorage.setItem(HIGH_SCORE_KEY, String(best));
  finalScoreEl.textContent = `${score.toLocaleString()}점`;
  bestScoreEl.textContent = best.toLocaleString();
  overlay.classList.remove("hidden");
}

function showSelect() {
  overlay.classList.add("hidden");
  gameScreen.classList.add("hidden");
  selectScreen.classList.remove("hidden");
  playBgm("lobby", { restart: true });
}

document.querySelectorAll(".char-card").forEach((card) => {
  card.addEventListener("click", () => startGame(card.dataset.character));
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
document.getElementById("btn-mute").addEventListener("click", () => {
  setMuted(!audio.muted);
});

window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "ArrowLeft" || event.code === "KeyA") {
    event.preventDefault();
    move(-1);
  }
  if (event.code === "ArrowRight" || event.code === "KeyD") {
    event.preventDefault();
    move(1);
  }
  if (event.code === "ArrowUp" || event.code === "Space" || event.code === "KeyW") {
    event.preventDefault();
    jump();
  }
});

renderHud();
setLane(1);
syncMuteButton();
