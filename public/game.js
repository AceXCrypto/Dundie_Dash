const API_BASE = '/api';
const CANVAS_W = 400, CANVAS_H = 600, TILE = 40;
const COLS = CANVAS_W / TILE, ROWS = CANVAS_H / TILE, MAX_SCORE = 500;
const SAFE_ROWS = new Set([0, 7, 14]);

const DUNDIE_FILES = [
  'Dundie_139.avif','Dundie_292.avif','Dundie_314.avif','Dundie_334.avif',
  'Dundie_369.avif','Dundie_391.avif','Dundie_416.avif','Dundie_440.avif',
  'Dundie_479.avif','Dundie_55.avif','Dundie_597.avif','Dundie_599.avif',
  'Dundie_665.avif','Dundie_735.avif','Dundie_747.avif','Dundie_766.avif',
  'Dundie_786.avif','Dundie_803.avif','Dundie_858.avif','Dundie_871.avif'
];

const dundieImages = [];
const gasImg = new Image();
const rugImg = new Image();
const playerImg = new Image();
let imagesLoaded = 0, totalImages = DUNDIE_FILES.length + 3;

function loadAllImages(cb) {
  function onLoad() { imagesLoaded++; if (imagesLoaded >= totalImages) cb(); }
  for (const f of DUNDIE_FILES) { const img = new Image(); img.onload = onLoad; img.onerror = onLoad; img.src = f; dundieImages.push(img); }
  gasImg.onload = onLoad; gasImg.onerror = onLoad; gasImg.src = 'Mad_Gas_Fee.png';
  rugImg.onload = onLoad; rugImg.onerror = onLoad; rugImg.src = 'Rug_Pull_Genie.png';
  playerImg.onload = onLoad; playerImg.onerror = onLoad; playerImg.src = 'DUNDIE_FACE.jpg';
}

const formScreen = document.getElementById('form-screen');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const hudScore = document.getElementById('hud-score');
const hudUser = document.getElementById('hud-user');
const gameoverScreen = document.getElementById('gameover-screen');
const cooldownScreen = document.getElementById('cooldown-screen');
const cooldownTimer = document.getElementById('cooldown-timer');
const finalScoreText = document.getElementById('final-score-text');
const formError = document.getElementById('form-error');
const playBtn = document.getElementById('play-btn');
const backBtn = document.getElementById('back-btn');
const cooldownBackBtn = document.getElementById('cooldown-back-btn');
const xUsernameInput = document.getElementById('x-username');
const walletInput = document.getElementById('wallet-address');
const leaderboardList = document.getElementById('leaderboard-list');

let player = { col: 5, row: 14 };
let score = 0, gameRunning = false, gameover = false;
let obstacles = [], dundies = [], frameId = null, lastTime = 0;
let xUsername = '', walletAddress = '';
var musicPlaying = false;

var bgMusic = new Audio('music.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.15;

function startMusic() {
  if (musicPlaying) return;
  musicPlaying = true;
  bgMusic.currentTime = bgMusic.currentTime || 0;
  bgMusic.play().catch(function(){});
}
function stopMusic() { musicPlaying = false; bgMusic.pause(); }
function playSfx(type) {
  try {
    var sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
    var o = sfxCtx.createOscillator(), g = sfxCtx.createGain(); o.connect(g); g.connect(sfxCtx.destination);
    if (type === 'collect') { o.type='sine'; o.frequency.setValueAtTime(880,sfxCtx.currentTime); o.frequency.exponentialRampToValueAtTime(1760,sfxCtx.currentTime+0.1); g.gain.setValueAtTime(0.15,sfxCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,sfxCtx.currentTime+0.15); o.start(); o.stop(sfxCtx.currentTime+0.15); }
    else if (type === 'die') { o.type='sawtooth'; o.frequency.setValueAtTime(400,sfxCtx.currentTime); o.frequency.exponentialRampToValueAtTime(80,sfxCtx.currentTime+0.4); g.gain.setValueAtTime(0.18,sfxCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,sfxCtx.currentTime+0.4); o.start(); o.stop(sfxCtx.currentTime+0.4); }
    else if (type === 'hop') { o.type='square'; o.frequency.setValueAtTime(200,sfxCtx.currentTime); o.frequency.exponentialRampToValueAtTime(500,sfxCtx.currentTime+0.06); g.gain.setValueAtTime(0.06,sfxCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,sfxCtx.currentTime+0.08); o.start(); o.stop(sfxCtx.currentTime+0.08); }
    setTimeout(function(){ sfxCtx.close(); }, 1000);
  } catch (e) {}
}

function buildLanes() {
  obstacles = []; dundies = [];
  const defs = [
    {row:1,speed:110,count:2,w:2,dir:1,type:'gas'},{row:2,speed:90,count:3,w:1,dir:-1,type:'gas'},
    {row:3,speed:130,count:2,w:3,dir:1,type:'gas'},{row:4,speed:70,count:2,w:2,dir:-1,type:'rug'},
    {row:5,speed:85,count:3,w:1,dir:1,type:'rug'},{row:6,speed:60,count:2,w:2,dir:-1,type:'rug'},
    {row:8,speed:65,count:2,w:2,dir:1,type:'rug'},{row:9,speed:80,count:3,w:1,dir:-1,type:'rug'},
    {row:10,speed:55,count:2,w:2,dir:1,type:'rug'},{row:11,speed:45,count:2,w:1,dir:-1,type:'gas'},
    {row:12,speed:55,count:2,w:2,dir:1,type:'gas'},{row:13,speed:40,count:3,w:1,dir:-1,type:'gas'},
  ];
  for (const l of defs) { const sp = CANVAS_W / l.count; for (let i = 0; i < l.count; i++) { obstacles.push({ x: i*sp+Math.random()*30, y: l.row*TILE, w: l.w*TILE, h: TILE-4, speed: l.speed*l.dir, type: l.type }); } }
  spawnDundies();
}

function spawnDundies() {
  dundies = []; const rows = [1,2,3,4,5,6,8,9,10,11,12,13];
  const count = 5 + Math.floor(Math.random() * 4); const used = new Set();
  for (let i = 0; i < count; i++) { let a = 0; while (a < 30) { const r = rows[Math.floor(Math.random()*rows.length)], c = Math.floor(Math.random()*COLS), k = c+','+r;
    if (!used.has(k)) { used.add(k); dundies.push({ col:c, row:r, x:c*TILE, y:r*TILE, collected:false, imgIndex: Math.floor(Math.random()*dundieImages.length) }); break; } a++; } }
}

function respawnDundie(d) {
  if (gameover) return; const rows = [1,2,3,4,5,6,8,9,10,11,12,13];
  d.row = rows[Math.floor(Math.random()*rows.length)]; d.col = Math.floor(Math.random()*COLS);
  d.x = d.col*TILE; d.y = d.row*TILE; d.collected = false; d.imgIndex = Math.floor(Math.random()*dundieImages.length);
}

const keysDown = new Set();
document.addEventListener('keydown', e => { if (!gameRunning||gameover) return; const k = e.key.toLowerCase();
  if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)) { e.preventDefault(); if (keysDown.has(k)) return; keysDown.add(k); movePlayer(k); } });
document.addEventListener('keyup', e => { keysDown.delete(e.key.toLowerCase()); });
function movePlayer(k) { let {col,row} = player;
  if (k==='arrowup'||k==='w') row--; if (k==='arrowdown'||k==='s') row++; if (k==='arrowleft'||k==='a') col--; if (k==='arrowright'||k==='d') col++;
  col = Math.max(0,Math.min(COLS-1,col)); row = Math.max(0,Math.min(ROWS-1,row)); player.col = col; player.row = row; playSfx('hop'); }

function gameLoop(ts) { if (!gameRunning) return; const dt = (ts-lastTime)/1000; lastTime = ts; update(Math.min(dt,0.05)); draw(); frameId = requestAnimationFrame(gameLoop); }

function update(dt) {
  for (const ob of obstacles) { ob.x += ob.speed*dt; if (ob.speed>0&&ob.x>CANVAS_W) ob.x=-ob.w; if (ob.speed<0&&ob.x+ob.w<0) ob.x=CANVAS_W; }
  const px=player.col*TILE,py=player.row*TILE,pw=TILE-4,ph=TILE-4;
  for (const d of dundies) { if (d.collected) continue; if (player.col===d.col&&player.row===d.row) { d.collected=true; score++; hudScore.textContent='🏆 '+score; playSfx('collect'); setTimeout(()=>respawnDundie(d),2000); } }
  if (!SAFE_ROWS.has(player.row)) { for (const ob of obstacles) { if (ob.y!==player.row*TILE) continue;
    if (px+2<ob.x+ob.w&&px+pw>ob.x+2&&py+2<ob.y+ob.h&&py+ph>ob.y+2) { endGame(); return; } } }
}

function draw() {
  ctx.clearRect(0,0,CANVAS_W,CANVAS_H);
  for (let r=0;r<ROWS;r++) {
    if (SAFE_ROWS.has(r)) { ctx.fillStyle=r===7?'#1a2e1a':'#0f1f0f'; ctx.fillRect(0,r*TILE,CANVAS_W,TILE); ctx.fillStyle='#2a4a2a'; for (let i=0;i<COLS;i+=2) ctx.fillRect(i*TILE+10,r*TILE+TILE/2,12,2); }
    else { ctx.fillStyle=(r%2===0)?'#14141f':'#18182a'; ctx.fillRect(0,r*TILE,CANVAS_W,TILE); ctx.strokeStyle='#2a2a3d'; ctx.setLineDash([8,12]); ctx.beginPath(); ctx.moveTo(0,r*TILE); ctx.lineTo(CANVAS_W,r*TILE); ctx.stroke(); ctx.setLineDash([]); }
  }
  ctx.fillStyle='#2a4a2a'; ctx.font='7px "Press Start 2P"'; ctx.textAlign='center';
  ctx.fillText('🏁 FINISH',CANVAS_W/2,24); ctx.fillText('— SAFE —',CANVAS_W/2,7*TILE+24); ctx.fillText('🐸 START',CANVAS_W/2,14*TILE+24);

  for (const ob of obstacles) {
    const img = ob.type==='gas'?gasImg:rugImg;
    if (img.complete&&img.naturalWidth>0) { ctx.drawImage(img,ob.x,ob.y+2,ob.w,ob.h); }
    else { ctx.fillStyle=ob.type==='gas'?'#e63946':'#9b5de5'; ctx.fillRect(ob.x,ob.y+2,ob.w,ob.h);
      ctx.fillStyle='#fff'; ctx.font='6px "Press Start 2P"'; ctx.textAlign='center'; ctx.fillText(ob.type.toUpperCase(),ob.x+ob.w/2,ob.y+TILE/2+4); }
  }

  for (const d of dundies) { if (d.collected) continue; const img=dundieImages[d.imgIndex];
    if (img&&img.complete&&img.naturalWidth>0) { ctx.shadowColor='#f5c842'; ctx.shadowBlur=10; ctx.drawImage(img,d.x+2,d.y+2,TILE-4,TILE-4); ctx.shadowBlur=0; }
    else { const cx=d.x+TILE/2,cy=d.y+TILE/2; ctx.shadowColor='#f5c842'; ctx.shadowBlur=8; ctx.fillStyle='#f5c842'; ctx.beginPath(); ctx.arc(cx,cy,12,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0; ctx.fillStyle='#0a0a12'; ctx.font='10px "Press Start 2P"'; ctx.textAlign='center'; ctx.fillText('D',cx,cy+4); }
  }

  const px=player.col*TILE,py=player.row*TILE;
  if (playerImg.complete&&playerImg.naturalWidth>0) { ctx.shadowColor='#42f587'; ctx.shadowBlur=6; ctx.drawImage(playerImg,px+1,py+1,TILE-2,TILE-2); ctx.shadowBlur=0; ctx.strokeStyle='#42f587'; ctx.lineWidth=2; ctx.strokeRect(px+1,py+1,TILE-2,TILE-2); ctx.lineWidth=1; }
  else { ctx.fillStyle='#42f587'; ctx.fillRect(px+6,py+6,TILE-12,TILE-12); }
}

function startGame() { player={col:5,row:14}; score=0; gameover=false; gameRunning=true; hudScore.textContent='🏆 0'; hudUser.textContent=xUsername; buildLanes(); startMusic(); lastTime=performance.now(); frameId=requestAnimationFrame(gameLoop); }

function endGame() { gameover=true; gameRunning=false; cancelAnimationFrame(frameId); stopMusic(); playSfx('die');
  const fs=Math.min(Math.max(score,0),MAX_SCORE); finalScoreText.textContent='🏆 '+fs+' Dundies';
  submitScore(xUsername,walletAddress,fs);
  canvas.style.display='none'; hud.style.display='none'; gameoverScreen.style.display='flex'; }

async function submitScore(u,w,s) { try { const r=await fetch(API_BASE+'/submit-score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x_username:u,wallet_address:w,score:s})}); const d=await r.json(); if(!d.success) console.warn('Score issue:',d.error); } catch(e) { console.error('Submit failed:',e); document.getElementById('save-msg').textContent='Could not save score (server offline).'; } }

function getCooldownKey(u) { return 'dundie_cooldown_'+u.toLowerCase().replace(/[^a-z0-9]/g,''); }
function setCooldownForUser(u) { localStorage.setItem(getCooldownKey(u),Date.now().toString()); }
function getCooldownRemaining(u) { const l=parseInt(localStorage.getItem(getCooldownKey(u))||'0',10); if(!l) return 0; return Math.max(0,86400000-(Date.now()-l)); }
function formatMs(ms) { const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000),s=Math.floor((ms%60000)/1000); return h+'h '+m+'m '+s+'s'; }

async function loadLeaderboard() { try { const r=await fetch(API_BASE+'/leaderboard'); const d=await r.json(); renderLeaderboard(d); } catch(e) { leaderboardList.innerHTML='<li class="empty-lb">Could not load leaderboard</li>'; } }
function renderLeaderboard(p) { if(!p||p.length===0){leaderboardList.innerHTML='<li class="empty-lb">No scores yet</li>';return;} leaderboardList.innerHTML=p.map(x=>'<li><span class="lb-name">'+escapeHtml(x.x_username)+'</span><span class="lb-score">'+x.weekly_score+'</span></li>').join(''); }
function escapeHtml(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function validateWallet(a) { return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a); }

playBtn.addEventListener('click', () => {
  formError.textContent=''; const user=xUsernameInput.value.trim(), wallet=walletInput.value.trim();
  if(!user){formError.textContent='Enter your X username.';return;}
  if(!wallet){formError.textContent='Enter your Solana wallet.';return;}
  if(!validateWallet(wallet)){formError.textContent='Invalid Solana wallet format.';return;}
  xUsername=user; walletAddress=wallet;
  
  formError.textContent='Loading sprites...'; formError.style.color='#f5c842';
  loadAllImages(()=>{ formError.textContent=''; formError.style.color='';
    formScreen.style.display='none'; canvas.style.display='block'; hud.style.display='flex'; gameoverScreen.style.display='none'; startGame(); });
});

backBtn.addEventListener('click', returnToMenu);
cooldownBackBtn.addEventListener('click', returnToMenu);
function returnToMenu() { gameoverScreen.style.display='none'; cooldownScreen.style.display='none'; canvas.style.display='none'; hud.style.display='none'; formScreen.style.display='block'; loadLeaderboard(); }


// ===== MOBILE TOUCH CONTROLS =====
function createMobileControls() {
  var pad = document.createElement('div');
  pad.id = 'touch-pad';
  pad.style.cssText = 'display:none;width:400px;max-width:100%;margin:10px auto 0;user-select:none;-webkit-user-select:none;touch-action:manipulation;';
  pad.innerHTML =
    '<div style="display:flex;justify-content:center;margin-bottom:6px;">' +
      '<button class="tp-btn" data-dir="up">&#9650;</button>' +
    '</div>' +
    '<div style="display:flex;justify-content:center;gap:8px;">' +
      '<button class="tp-btn" data-dir="left">&#9664;</button>' +
      '<button class="tp-btn" data-dir="down">&#9660;</button>' +
      '<button class="tp-btn" data-dir="right">&#9654;</button>' +
    '</div>';
  var style = document.createElement('style');
  style.textContent =
    '.tp-btn{width:64px;height:64px;font-size:24px;background:#12121f;color:#f5c842;' +
    'border:2px solid #2a2a3d;border-radius:8px;cursor:pointer;display:flex;align-items:center;' +
    'justify-content:center;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}' +
    '.tp-btn:active{background:#2a2a3d;transform:scale(0.9);}';
  document.head.appendChild(style);
  var wrapper = document.getElementById('wrapper'); var hudEl = document.getElementById('hud'); wrapper.insertBefore(pad, hudEl.nextSibling);
  pad.addEventListener('touchstart', function(e) {
    e.preventDefault();
    var btn = e.target.closest('.tp-btn');
    if (!btn || !gameRunning || gameover) return;
    var dir = btn.dataset.dir;
    if (dir === 'up') movePlayer('arrowup');
    else if (dir === 'down') movePlayer('arrowdown');
    else if (dir === 'left') movePlayer('arrowleft');
    else if (dir === 'right') movePlayer('arrowright');
  }, { passive: false });
  pad.addEventListener('click', function(e) {
    var btn = e.target.closest('.tp-btn');
    if (!btn || !gameRunning || gameover) return;
    var dir = btn.dataset.dir;
    if (dir === 'up') movePlayer('arrowup');
    else if (dir === 'down') movePlayer('arrowdown');
    else if (dir === 'left') movePlayer('arrowleft');
    else if (dir === 'right') movePlayer('arrowright');
  });
  return pad;
}
var touchPad = createMobileControls();

// Show/hide controls with game state
var _origStart = startGame;
startGame = function() { _origStart(); touchPad.style.display = 'block'; };
var _origEnd = endGame;
endGame = function() { _origEnd(); touchPad.style.display = 'none'; };
var _origMenu = returnToMenu;
returnToMenu = function() { _origMenu(); touchPad.style.display = 'none'; };

// ===== SOUND TOGGLE =====
var soundEnabled = true;
var _origSfx = playSfx;
playSfx = function(type) { if (soundEnabled) _origSfx(type); };
var _origMusic = startMusic;
startMusic = function() { if (soundEnabled) _origMusic(); };

function createSoundToggle() {
  var btn = document.createElement('button');
  btn.id = 'sound-toggle';
  btn.textContent = '\u{1F50A}';
  btn.title = 'Toggle Sound';
  btn.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:300;width:44px;height:44px;font-size:22px;background:#12121f;border:2px solid #f5c842;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;';
  btn.addEventListener('click', function() {
    soundEnabled = !soundEnabled;
    btn.textContent = soundEnabled ? '\u{1F50A}' : '\u{1F507}';
    if (!soundEnabled) { bgMusic.pause(); musicPlaying = false; }
    else { musicPlaying = false; startMusic(); }
  });
  document.body.appendChild(btn);
}
createSoundToggle();

// ===== LANDING PAGE MUSIC =====
// Browsers require a user gesture before playing audio.
// We try to start music on ANY first interaction.
function tryStartMusic() {
  if (!musicPlaying && soundEnabled) {
    bgMusic.play().then(function() {
      musicPlaying = true;
    }).catch(function(){});
  }
  document.removeEventListener('click', tryStartMusic);
  document.removeEventListener('touchstart', tryStartMusic);
  document.removeEventListener('keydown', tryStartMusic);
}
document.addEventListener('click', tryStartMusic);
document.addEventListener('touchstart', tryStartMusic);
document.addEventListener('keydown', tryStartMusic);

// ===== INIT =====
loadLeaderboard();

// ===== HALL OF FAME =====
async function loadWinners() {
  try {
    var res = await fetch(API_BASE + '/winners');
    var data = await res.json();
    var container = document.getElementById('winners-list');
    if (!data || data.length === 0) {
      container.innerHTML = '<p class="empty-winners">No winners yet — be the first!</p>';
      return;
    }
    container.innerHTML = data.map(function(w) {
      var date = new Date(w.week_ending).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      var prizeText = w.prize_description || w.prize_type || 'TBD';
      var sentBadge = w.prize_sent
        ? '<span class="winner-sent">✅</span>'
        : '<span class="winner-pending">⏳ pending</span>';
      return '<div class="winner-card">' +
        '<span class="winner-name">👑 ' + w.x_username + '</span>' +
        '<span class="winner-score">🏆 ' + w.score + '</span>' +
        '<span class="winner-week">' + date + '</span>' +
        '<span class="winner-prize">' + prizeText + ' ' + sentBadge + '</span>' +
        '</div>';
    }).join('');
  } catch (e) {
    console.error('Failed to load winners:', e);
  }
}
loadWinners();

// ===== ALL TIME HIGH SCORES =====
async function loadAllTime() {
  try {
    var res = await fetch(API_BASE + '/alltime');
    var data = await res.json();
    var list = document.getElementById('alltime-list');
    if (!list) return;
    if (!data || data.length === 0) {
      list.innerHTML = '<li class="empty-at">No scores yet — make history!</li>';
      return;
    }
    list.innerHTML = data.map(function(p) {
      return '<li><span class="at-name">' + escapeHtml(p.x_username) + '</span><span class="at-score">' + p.best_score + '</span></li>';
    }).join('');
  } catch (e) {
    var list = document.getElementById('alltime-list');
    if (list) list.innerHTML = '<li class="empty-at">Could not load</li>';
  }
}
loadAllTime();

// ===== NEW HIGH SCORE DETECTION =====
var _origEndForHighScore = endGame;
endGame = function() {
  var currentScore = Math.min(Math.max(score, 0), MAX_SCORE);

  _origEndForHighScore();

  // Check if this is a new personal best
  fetch(API_BASE + '/alltime').then(function(r) { return r.json(); }).then(function(data) {
    var myBest = 0;
    if (data) {
      for (var i = 0; i < data.length; i++) {
        if (data[i].x_username === xUsername && data[i].best_score > myBest) {
          myBest = data[i].best_score;
        }
      }
    }
    var hsEl = document.getElementById('new-highscore');
    if (hsEl && currentScore >= myBest && currentScore > 0) {
      hsEl.style.display = 'block';
    }
    // Refresh all-time board
    loadAllTime();
  }).catch(function(){});
};

// Hide high score message when returning to menu
var _origMenuForHighScore = returnToMenu;
returnToMenu = function() {
  var hsEl = document.getElementById('new-highscore');
  if (hsEl) hsEl.style.display = 'none';
  _origMenuForHighScore();
  loadAllTime();
};
