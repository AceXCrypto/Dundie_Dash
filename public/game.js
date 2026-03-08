/* ==========================================================
   DUNDIE DASH — Game Engine
   Frogger-style arcade game with Dundie NFT collectibles
   ========================================================== */

// ===== CONFIG =====
const API_BASE = '/api'; // same-origin in production; change for dev e.g. 'http://localhost:3000'
const CANVAS_W = 400;
const CANVAS_H = 600;
const TILE = 40;              // grid cell size
const COLS = CANVAS_W / TILE; // 10
const ROWS = CANVAS_H / TILE; // 15
const MAX_SCORE = 500;

// Lane layout (row index from top):
// Row 0  = finish safe zone
// Row 1–3  = obstacle lanes (fast)
// Row 4–6  = obstacle lanes (medium)
// Row 7  = middle safe zone
// Row 8–10 = obstacle lanes (medium)
// Row 11–13 = obstacle lanes (slow)
// Row 14 = start safe zone (spawn)
const SAFE_ROWS = new Set([0, 7, 14]);

// ===== DOM REFS =====
const formScreen    = document.getElementById('form-screen');
const canvas        = document.getElementById('game-canvas');
const ctx           = canvas.getContext('2d');
const hud           = document.getElementById('hud');
const hudScore      = document.getElementById('hud-score');
const hudUser       = document.getElementById('hud-user');
const gameoverScreen = document.getElementById('gameover-screen');
const cooldownScreen = document.getElementById('cooldown-screen');
const cooldownTimer  = document.getElementById('cooldown-timer');
const finalScoreText = document.getElementById('final-score-text');
const formError      = document.getElementById('form-error');
const playBtn        = document.getElementById('play-btn');
const backBtn        = document.getElementById('back-btn');
const cooldownBackBtn = document.getElementById('cooldown-back-btn');
const xUsernameInput = document.getElementById('x-username');
const walletInput    = document.getElementById('wallet-address');
const leaderboardList = document.getElementById('leaderboard-list');

// ===== GAME STATE =====
let player = { col: 5, row: 14 };
let score = 0;
let gameRunning = false;
let gameover = false;
let obstacles = [];
let dundies = [];
let frameId = null;
let lastTime = 0;
let xUsername = '';
let walletAddress = '';

// ===== AUDIO: ELEVATOR MUSIC GENERATOR =====
let audioCtx = null;
let musicPlaying = false;
let musicNodes = [];

function startMusic() {
  if (musicPlaying) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    musicPlaying = true;

    // Simple bossa-nova-ish elevator loop using oscillators
    const bpm = 120;
    const beatLen = 60 / bpm;
    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.10;
    masterGain.connect(audioCtx.destination);
    musicNodes.push(masterGain);

    // Pentatonic melody notes (MIDI)
    const melody = [72,74,76,79,81, 79,76,74,72,69, 67,69,72,74,76, 74,72,69,67,64];
    // Bass line
    const bass   = [48,48,55,55, 52,52,50,50, 48,48,55,55, 52,52,50,50, 48,48,55,55];

    const totalBeats = melody.length;
    const loopDuration = totalBeats * beatLen;

    function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

    function scheduleLoop(startTime) {
      for (let i = 0; i < totalBeats; i++) {
        const t = startTime + i * beatLen;

        // Melody
        const osc1 = audioCtx.createOscillator();
        const g1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.value = midiToFreq(melody[i]);
        g1.gain.setValueAtTime(0.12, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + beatLen * 0.9);
        osc1.connect(g1).connect(masterGain);
        osc1.start(t);
        osc1.stop(t + beatLen);
        musicNodes.push(osc1, g1);

        // Bass (half notes)
        if (i % 2 === 0 && bass[i] !== undefined) {
          const osc2 = audioCtx.createOscillator();
          const g2 = audioCtx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.value = midiToFreq(bass[i]);
          g2.gain.setValueAtTime(0.15, t);
          g2.gain.exponentialRampToValueAtTime(0.001, t + beatLen * 1.8);
          osc2.connect(g2).connect(masterGain);
          osc2.start(t);
          osc2.stop(t + beatLen * 2);
          musicNodes.push(osc2, g2);
        }
      }

      // Schedule next loop
      if (musicPlaying) {
        setTimeout(() => { if (musicPlaying) scheduleLoop(startTime + loopDuration); },
          (loopDuration - 1) * 1000);
      }
    }

    scheduleLoop(audioCtx.currentTime + 0.1);
  } catch (e) {
    console.warn('Audio not supported', e);
  }
}

function stopMusic() {
  musicPlaying = false;
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  musicNodes = [];
}

function playSfx(type) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.connect(g).connect(audioCtx.destination);
    if (type === 'collect') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1);
      g.gain.setValueAtTime(0.15, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.start(); osc.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'die') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(400, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.4);
      g.gain.setValueAtTime(0.18, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      osc.start(); osc.stop(audioCtx.currentTime + 0.4);
    } else if (type === 'hop') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + 0.06);
      g.gain.setValueAtTime(0.06, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
      osc.start(); osc.stop(audioCtx.currentTime + 0.08);
    }
  } catch (e) { /* silence */ }
}


// ===== OBSTACLE & DUNDIE SETUP =====

function buildLanes() {
  obstacles = [];
  dundies = [];

  // Define obstacle lanes: [row, speed (px/s), count, widthTiles, direction, color, label]
  const laneDefs = [
    // Top section (fast)  — "GAS FEES"
    { row: 1,  speed: 110, count: 2, w: 2, dir:  1, color: '#e63946', label: 'GAS' },
    { row: 2,  speed: 90,  count: 3, w: 1, dir: -1, color: '#d62828', label: 'GAS' },
    { row: 3,  speed: 130, count: 2, w: 3, dir:  1, color: '#e63946', label: 'GAS' },
    // Upper-mid (medium)
    { row: 4,  speed: 70,  count: 2, w: 2, dir: -1, color: '#9b5de5', label: 'RUG' },
    { row: 5,  speed: 85,  count: 3, w: 1, dir:  1, color: '#8338ec', label: 'RUG' },
    { row: 6,  speed: 60,  count: 2, w: 2, dir: -1, color: '#9b5de5', label: 'RUG' },
    // Lower-mid (medium)
    { row: 8,  speed: 65,  count: 2, w: 2, dir:  1, color: '#f77f00', label: 'RUG' },
    { row: 9,  speed: 80,  count: 3, w: 1, dir: -1, color: '#e36414', label: 'RUG' },
    { row: 10, speed: 55,  count: 2, w: 2, dir:  1, color: '#f77f00', label: 'RUG' },
    // Bottom section (slow) — near spawn
    { row: 11, speed: 45,  count: 2, w: 1, dir: -1, color: '#457b9d', label: 'GAS' },
    { row: 12, speed: 55,  count: 2, w: 2, dir:  1, color: '#1d3557', label: 'GAS' },
    { row: 13, speed: 40,  count: 3, w: 1, dir: -1, color: '#457b9d', label: 'GAS' },
  ];

  for (const lane of laneDefs) {
    const spacing = CANVAS_W / lane.count;
    for (let i = 0; i < lane.count; i++) {
      obstacles.push({
        x: i * spacing + Math.random() * 30,
        y: lane.row * TILE,
        w: lane.w * TILE,
        h: TILE - 4,
        speed: lane.speed * lane.dir,
        color: lane.color,
        label: lane.label,
      });
    }
  }

  // Spawn Dundies in non-safe lanes (random positions)
  spawnDundies();
}

function spawnDundies() {
  dundies = [];
  const obstacleRows = [1,2,3,4,5,6,8,9,10,11,12,13];
  // Place 5–8 dundies randomly
  const count = 5 + Math.floor(Math.random() * 4);
  const usedCells = new Set();
  for (let i = 0; i < count; i++) {
    let attempts = 0;
    while (attempts < 30) {
      const row = obstacleRows[Math.floor(Math.random() * obstacleRows.length)];
      const col = Math.floor(Math.random() * COLS);
      const key = `${col},${row}`;
      if (!usedCells.has(key)) {
        usedCells.add(key);
        dundies.push({ col, row, x: col * TILE, y: row * TILE, collected: false });
        break;
      }
      attempts++;
    }
  }
}


// ===== INPUT =====
const keysDown = new Set();

document.addEventListener('keydown', (e) => {
  if (!gameRunning || gameover) return;
  const key = e.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(key)) {
    e.preventDefault();
    if (keysDown.has(key)) return; // prevent repeat
    keysDown.add(key);
    movePlayer(key);
  }
});

document.addEventListener('keyup', (e) => {
  keysDown.delete(e.key.toLowerCase());
});

function movePlayer(key) {
  let { col, row } = player;
  if (key === 'arrowup'    || key === 'w') row--;
  if (key === 'arrowdown'  || key === 's') row++;
  if (key === 'arrowleft'  || key === 'a') col--;
  if (key === 'arrowright' || key === 'd') col++;

  // Clamp to grid
  col = Math.max(0, Math.min(COLS - 1, col));
  row = Math.max(0, Math.min(ROWS - 1, row));

  player.col = col;
  player.row = row;
  playSfx('hop');
}


// ===== GAME LOOP =====

function gameLoop(timestamp) {
  if (!gameRunning) return;
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  update(Math.min(dt, 0.05)); // cap delta to prevent jumps
  draw();

  frameId = requestAnimationFrame(gameLoop);
}

function update(dt) {
  // Move obstacles
  for (const ob of obstacles) {
    ob.x += ob.speed * dt;
    // Wrap around
    if (ob.speed > 0 && ob.x > CANVAS_W) ob.x = -ob.w;
    if (ob.speed < 0 && ob.x + ob.w < 0) ob.x = CANVAS_W;
  }

  // Player world position
  const px = player.col * TILE;
  const py = player.row * TILE;
  const pw = TILE - 4;
  const ph = TILE - 4;

  // Check Dundie collection
  for (const d of dundies) {
    if (d.collected) continue;
    if (player.col === d.col && player.row === d.row) {
      d.collected = true;
      score++;
      hudScore.textContent = '🏆 ' + score;
      playSfx('collect');
      // Respawn a new dundie elsewhere after short delay
      setTimeout(() => respawnDundie(d), 2000);
    }
  }

  // Check obstacle collision (skip safe rows)
  if (!SAFE_ROWS.has(player.row)) {
    for (const ob of obstacles) {
      if (ob.y !== player.row * TILE) continue;
      // AABB collision
      if (px + 2 < ob.x + ob.w && px + pw > ob.x + 2 &&
          py + 2 < ob.y + ob.h && py + ph > ob.y + 2) {
        endGame();
        return;
      }
    }
  }
}

function respawnDundie(d) {
  if (gameover) return;
  const obstacleRows = [1,2,3,4,5,6,8,9,10,11,12,13];
  d.row = obstacleRows[Math.floor(Math.random() * obstacleRows.length)];
  d.col = Math.floor(Math.random() * COLS);
  d.x = d.col * TILE;
  d.y = d.row * TILE;
  d.collected = false;
}


// ===== DRAWING =====

function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Draw lane backgrounds
  for (let r = 0; r < ROWS; r++) {
    if (SAFE_ROWS.has(r)) {
      // Safe lanes — dark green grass
      ctx.fillStyle = r === 7 ? '#1a2e1a' : '#0f1f0f';
      ctx.fillRect(0, r * TILE, CANVAS_W, TILE);
      // Grass dashes
      ctx.fillStyle = '#2a4a2a';
      for (let i = 0; i < COLS; i += 2) {
        ctx.fillRect(i * TILE + 10, r * TILE + TILE / 2, 12, 2);
      }
    } else {
      // Road lanes
      ctx.fillStyle = (r % 2 === 0) ? '#14141f' : '#18182a';
      ctx.fillRect(0, r * TILE, CANVAS_W, TILE);
      // Lane dividers
      ctx.strokeStyle = '#2a2a3d';
      ctx.setLineDash([8, 12]);
      ctx.beginPath();
      ctx.moveTo(0, r * TILE);
      ctx.lineTo(CANVAS_W, r * TILE);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Safe zone labels
  ctx.fillStyle = '#2a4a2a';
  ctx.font = '7px "Press Start 2P"';
  ctx.textAlign = 'center';
  ctx.fillText('🏁 FINISH', CANVAS_W / 2, 24);
  ctx.fillText('— SAFE —', CANVAS_W / 2, 7 * TILE + 24);
  ctx.fillText('🐸 START', CANVAS_W / 2, 14 * TILE + 24);

  // Draw obstacles
  for (const ob of obstacles) {
    ctx.fillStyle = ob.color;
    // Rounded rect
    const r = 3;
    ctx.beginPath();
    ctx.moveTo(ob.x + r, ob.y + 2);
    ctx.lineTo(ob.x + ob.w - r, ob.y + 2);
    ctx.quadraticCurveTo(ob.x + ob.w, ob.y + 2, ob.x + ob.w, ob.y + 2 + r);
    ctx.lineTo(ob.x + ob.w, ob.y + 2 + ob.h - r);
    ctx.quadraticCurveTo(ob.x + ob.w, ob.y + 2 + ob.h, ob.x + ob.w - r, ob.y + 2 + ob.h);
    ctx.lineTo(ob.x + r, ob.y + 2 + ob.h);
    ctx.quadraticCurveTo(ob.x, ob.y + 2 + ob.h, ob.x, ob.y + 2 + ob.h - r);
    ctx.lineTo(ob.x, ob.y + 2 + r);
    ctx.quadraticCurveTo(ob.x, ob.y + 2, ob.x + r, ob.y + 2);
    ctx.closePath();
    ctx.fill();

    // Label
    ctx.fillStyle = '#fff';
    ctx.font = '6px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText(ob.label, ob.x + ob.w / 2, ob.y + TILE / 2 + 4);
  }

  // Draw Dundies
  for (const d of dundies) {
    if (d.collected) continue;
    const cx = d.x + TILE / 2;
    const cy = d.y + TILE / 2;
    // Trophy glow
    ctx.shadowColor = '#f5c842';
    ctx.shadowBlur = 8;
    // Gold circle
    ctx.fillStyle = '#f5c842';
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Inner icon
    ctx.fillStyle = '#0a0a12';
    ctx.font = '10px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText('D', cx, cy + 4);
  }

  // Draw player (frog)
  const px = player.col * TILE;
  const py = player.row * TILE;
  drawFrog(px + 2, py + 2, TILE - 4);
}

function drawFrog(x, y, size) {
  // Body
  ctx.fillStyle = '#42f587';
  ctx.fillRect(x + 4, y + 4, size - 8, size - 8);

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 4, y + 2, 8, 8);
  ctx.fillRect(x + size - 12, y + 2, 8, 8);
  // Pupils
  ctx.fillStyle = '#111';
  ctx.fillRect(x + 7, y + 4, 4, 4);
  ctx.fillRect(x + size - 10, y + 4, 4, 4);

  // Mouth
  ctx.fillStyle = '#2a8c4a';
  ctx.fillRect(x + 10, y + size - 10, size - 20, 3);

  // Feet
  ctx.fillStyle = '#38d976';
  ctx.fillRect(x, y + size - 6, 6, 6);
  ctx.fillRect(x + size - 6, y + size - 6, 6, 6);
}


// ===== GAME LIFECYCLE =====

function startGame() {
  player = { col: 5, row: 14 };
  score = 0;
  gameover = false;
  gameRunning = true;
  hudScore.textContent = '🏆 0';
  hudUser.textContent = xUsername;

  buildLanes();
  startMusic();

  lastTime = performance.now();
  frameId = requestAnimationFrame(gameLoop);
}

function endGame() {
  gameover = true;
  gameRunning = false;
  cancelAnimationFrame(frameId);
  stopMusic();
  playSfx('die');

  // Clamp score
  const finalScore = Math.min(Math.max(score, 0), MAX_SCORE);
  finalScoreText.textContent = '🏆 ' + finalScore + ' Dundies';

  // Save cooldown timestamp
  setCooldownForUser(xUsername);

  // Submit score to backend
  submitScore(xUsername, walletAddress, finalScore);

  // Show game over
  canvas.style.display = 'none';
  hud.style.display = 'none';
  gameoverScreen.style.display = 'flex';
}

async function submitScore(username, wallet, s) {
  try {
    const res = await fetch(API_BASE + '/submit-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x_username: username, wallet_address: wallet, score: s }),
    });
    const data = await res.json();
    if (!data.success) console.warn('Score submit issue:', data.error);
  } catch (e) {
    console.error('Failed to submit score:', e);
    document.getElementById('save-msg').textContent = 'Could not save score (server offline).';
  }
}


// ===== COOLDOWN (ONE GAME PER DAY) =====

function getCooldownKey(username) {
  return 'dundie_cooldown_' + username.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function setCooldownForUser(username) {
  const key = getCooldownKey(username);
  localStorage.setItem(key, Date.now().toString());
}

function getCooldownRemaining(username) {
  const key = getCooldownKey(username);
  const last = parseInt(localStorage.getItem(key) || '0', 10);
  if (!last) return 0;
  const elapsed = Date.now() - last;
  const cooldown = 24 * 60 * 60 * 1000; // 24 hours
  return Math.max(0, cooldown - elapsed);
}

function formatMs(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m}m ${s}s`;
}


// ===== LEADERBOARD =====

async function loadLeaderboard() {
  try {
    const res = await fetch(API_BASE + '/leaderboard');
    const data = await res.json();
    renderLeaderboard(data);
  } catch (e) {
    leaderboardList.innerHTML = '<li class="empty-lb">Could not load leaderboard</li>';
  }
}

function renderLeaderboard(players) {
  if (!players || players.length === 0) {
    leaderboardList.innerHTML = '<li class="empty-lb">No scores yet — be the first!</li>';
    return;
  }
  leaderboardList.innerHTML = players.map(p =>
    `<li><span class="lb-name">${escapeHtml(p.x_username)}</span><span class="lb-score">${p.weekly_score}</span></li>`
  ).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


// ===== VALIDATION =====

function validateWallet(addr) {
  // Basic Solana base58 check: 32–44 chars, alphanumeric (no 0, O, I, l)
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}


// ===== EVENT HANDLERS =====

playBtn.addEventListener('click', () => {
  formError.textContent = '';
  const user = xUsernameInput.value.trim();
  const wallet = walletInput.value.trim();

  if (!user) { formError.textContent = 'Enter your X username.'; return; }
  if (!wallet) { formError.textContent = 'Enter your Solana wallet.'; return; }
  if (!validateWallet(wallet)) { formError.textContent = 'Invalid Solana wallet format.'; return; }

  xUsername = user;
  walletAddress = wallet;

  // Check cooldown
  const remaining = getCooldownRemaining(xUsername);
  if (remaining > 0) {
    showCooldown(remaining);
    return;
  }

  // Transition to game
  formScreen.style.display = 'none';
  canvas.style.display = 'block';
  hud.style.display = 'flex';
  gameoverScreen.style.display = 'none';

  startGame();
});

backBtn.addEventListener('click', returnToMenu);
cooldownBackBtn.addEventListener('click', returnToMenu);

function returnToMenu() {
  gameoverScreen.style.display = 'none';
  cooldownScreen.style.display = 'none';
  canvas.style.display = 'none';
  hud.style.display = 'none';
  formScreen.style.display = 'block';
  loadLeaderboard();
}

function showCooldown(remaining) {
  formScreen.style.display = 'none';
  canvas.style.display = 'none';
  hud.style.display = 'none';
  gameoverScreen.style.display = 'none';
  cooldownScreen.style.display = 'flex';

  function tick() {
    const r = getCooldownRemaining(xUsername);
    if (r <= 0) {
      cooldownTimer.textContent = 'Ready to play!';
      return;
    }
    cooldownTimer.textContent = formatMs(r);
    setTimeout(tick, 1000);
  }
  tick();
}


// ===== INIT =====
loadLeaderboard();
