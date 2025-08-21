let playColdDown = 0;
const audioCtx = window.AudioContext ? new window.AudioContext() : (window.webkitAudioContext ? new window.webkitAudioContext() : null);
function playSfx(name) {
    if (!audioCtx || (playColdDown > 1e-9 && name !== 'alarm')) return;
    let t = audioCtx.currentTime;
    if (name === 'alarm' || name === 'tip' || name === 'hit') {
        for (let i = 0; i < (name === 'alarm' ? 4 : 1); i++) {
            let o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = 'sine';
            o.frequency.value = (name === 'hit' ? 450 : 1200);
            let real = new Float32Array([0, 1, 0.4, 0.2, 0.1]);
            let imag = new Float32Array(real.length);
            let bell = audioCtx.createPeriodicWave(real, imag);
            o.setPeriodicWave(bell);
            o.connect(g).connect(audioCtx.destination);
            g.gain.value = 0.18;
            let start = t + i * 0.1;
            o.start(start);
            g.gain.setValueAtTime(0.18, start);
            g.gain.linearRampToValueAtTime(0, start + 0.15);
            o.stop(start + 0.16);
        }
    } else if (name === 'parry') {
        let b = audioCtx.createBuffer(1, 2200, audioCtx.sampleRate), d = b.getChannelData(0);
        for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * Math.exp(-j / 400);
        let s = audioCtx.createBufferSource(), g = audioCtx.createGain();
        s.buffer = b;
        s.connect(g).connect(audioCtx.destination);
        g.gain.value = 0.22;
        s.start(t);
        g.gain.setValueAtTime(0.22, t);
        g.gain.linearRampToValueAtTime(0, t + 0.07);
        s.stop(t + 0.14);
    }
    playColdDown = 0.05;
}

const TILE_WIDTH = 32;
const TILE_HEIGHT = 32;
const PLAYER_WIDTH = 26;
const PLAYER_HEIGHT = 40;
const BULLET_SIZE = 14;
const BULLET_OFFSET_Y = -15;
const HIT_RADIUS = 10;
const CAT_WIDTH = 26;
const CAT_HEIGHT = 22;
const MAP_SIZE = 256;

let map = Array.from({length:MAP_SIZE},()=>Array.from({length:MAP_SIZE},()=>""));
const BLOCKS = 8;
const BLOCK_SIZE = 32;

let gameState = 0;
let stage = 0;
let currFrame = 0;
let score = 0;
let continued = false;

let offsetX = 0, offsetY = 0;

let hitPoints = 3;
let shieldPoints = 3;
const maxShieldPoints = 3;
const shieldRegen = 1 / 900;
let invTime = 0;

let playerX = 512, playerY = 512;
let playerCatStatus = false;
let playerBlockX = 0;
let playerBlockY = 0;
let currLevel = 0;
const speed = 4;
const slowSpeed = 2.5;

let dashX = 0, dashY = 0;
let dashTime = 0;
const dashSpeed = 10;
const dashTimeMax = 0.25;

let catPower = 0;
const dashPowerCost = 100;
const catPowerMax = 300;
const convertRadius = 100;

const catPowerRegen = 100 / 126;
const catPowerRegenPerBullet = 0;

let maskAlpha = 1;
let moveFlags = [];

let enemies = []; // {name, x, y, hp}
let bullets = []; // {type, x, y, velX, velY, converted, lifeTime}
let texts = []; // {text, x, y, lifeTime}
let particles = []; // {type, x, y, velX, velY, lifeTime}

const tier1Enemies = [1, 2, 3, 8, 12]
const tier2Enemies = [4, 5, 6, 7, 9, 10, 11, 17, 18];
const tier3Enemies = [13, 14, 15, 16, 19, 20];

let canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
const imgDict = {};
['brick1','brick2','player','cat','enemy', 'bullet1', 'bullet2', 'bullet3', 'bulletc', 'life', 'shield'].forEach(name => {
    const img = new Image();
    img.src = `assets/${name}.png`;
    imgDict[name] = img;
});

function restartMap() {
    playerX = 512; playerY = 512; hitPoints = 3; shieldPoints = 3; enemies = []; map = Array.from({length:MAP_SIZE},()=>Array.from({length:MAP_SIZE},()=>"")); catPower = catPowerMax; moveFlags = [];
    let currRoomX = 0, currRoomY = 0;
    let moveRightFlag = 0;
    while (currRoomX < BLOCKS && currRoomY < BLOCKS) {
        for (let y = 0; y < BLOCK_SIZE; y++) for (let x = 0; x < BLOCK_SIZE; x++)
            map[currRoomY * BLOCK_SIZE + y][currRoomX * BLOCK_SIZE + x] = (x == 0 || y == 0 || x == BLOCK_SIZE - 1 || y == BLOCK_SIZE - 1) ? "brick1" : "brick2";

        if (currRoomX !== 0 || currRoomY !== 0) {
            if (moveRightFlag)
                for(let y=BLOCK_SIZE/2-2;y<BLOCK_SIZE/2+2;y++)
                    map[currRoomY*BLOCK_SIZE+y].splice(currRoomX*BLOCK_SIZE-1,2,"brick2","brick2");
            else
                for(let x=BLOCK_SIZE/2-2;x<BLOCK_SIZE/2+2;x++)
                    [map[currRoomY*BLOCK_SIZE-1][currRoomX*BLOCK_SIZE+x],map[currRoomY*BLOCK_SIZE][currRoomX*BLOCK_SIZE+x]]=["brick2","brick2"];
        }
        if (currRoomX === 0 && currRoomY === 0) { firstMoveRightFlag = moveRightFlag; }
        moveRightFlag = Math.random() < 0.5;
        moveFlags.push(moveRightFlag);
        if (currRoomX === BLOCKS - 1) { moveRightFlag = false; }
        if (currRoomY === BLOCKS - 1) { moveRightFlag = true; }
        if (moveRightFlag) { currRoomX++; } else { currRoomY++; }

        if (currRoomX + currRoomY === 1) {
            enemies.push({type: 1, x: (currRoomX + 0.5) * BLOCK_SIZE * TILE_WIDTH, y: (currRoomY + 0.5) * BLOCK_SIZE * TILE_HEIGHT, hp: 20, maxHp: 20});
        }
        if (currRoomX + currRoomY >= 2 && currRoomX + currRoomY < BLOCKS * 2 - 2) {
            function pick(arr, n) {
                const result = [];
                for (let i = 0; i < n; i++) {
                    result.push(arr[Math.floor(Math.random() * arr.length)]);
                }
                return result;
            }
            let direct = pick(tier1Enemies, 2 + Math.floor(Math.random() * 2));
            let spread = pick(tier2Enemies, Math.floor(Math.random() * 3));
            let disturb = pick(tier3Enemies, Math.floor(Math.random() * 2));
            let allTypes = direct.concat(spread, disturb);
            for (let i = 0; i < allTypes.length; i++) {
                let ex = ((currRoomX * BLOCK_SIZE + 12) + Math.random() * (BLOCK_SIZE - 24)) * TILE_WIDTH;
                let ey = ((currRoomY * BLOCK_SIZE + 12) + Math.random() * (BLOCK_SIZE - 24)) * TILE_HEIGHT;
                enemies.push({ type: allTypes[i], x: ex, y: ey, hp: 30 });
            }
        }
        else if (currRoomX + currRoomY === BLOCKS * 2 - 2) {
            enemies.push({type: 114, x: (currRoomX + 0.5) * BLOCK_SIZE * TILE_WIDTH, y: (currRoomY + 0.5) * BLOCK_SIZE * TILE_HEIGHT, hp: 1500, maxHp: 1500});
        }
    }
}
restartMap();

function resizeCanvas() {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
}

const keyState = {};
document.addEventListener('keydown', e => { keyState[e.key.toLowerCase()] = true; });
document.addEventListener('keyup',   e => { keyState[e.key.toLowerCase()] = false; });

let mouseLeftDown = false;
let mouseRightDown = false;
let mouseDownX = 0, mouseDownY = 0;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousemove', e => {
    mouseDownX = e.offsetX + offsetX;
    mouseDownY = e.offsetY + offsetY;
});
canvas.addEventListener('mousedown', e => {
    if (e.button === 0) {
        mouseLeftDown = true;
    }
    if (e.button === 2 && dashTime <= 0 && catPower >= dashPowerCost) {
        mouseRightDown = true;
        mouseDownX = e.offsetX + offsetX;
        mouseDownY = e.offsetY + offsetY;
        dashTime = dashTimeMax;
        let dx = mouseDownX - playerX, dy = mouseDownY - playerY, len = Math.hypot(dx, dy) || 1;
        dashX = dx / len * dashSpeed;
        dashY = dy / len * dashSpeed;
        catPower -= dashPowerCost;
    }
});
canvas.addEventListener('mouseup', e => {
    if (e.button === 0) mouseLeftDown = false;
    if (e.button === 2) mouseRightDown = false;
});

function update() {
    playColdDown = Math.max(0, playColdDown - 1 / 60);
    if (hitPoints <= 0) { return; }
    playerCatStatus = dashTime > 0;
    if (!playerCatStatus) { catPower += catPowerRegen; }
    let shiftX, shiftY;
    if (dashTime > 0) {
        shiftX = dashX; shiftY = dashY;
        dashTime -= 1 / 60;
    }
    else {
        let speedX = (keyState['a']) ? -1 : 0 + (keyState['d']) ? 1 : 0;
        let speedY = (keyState['w']) ? -1 : 0 + (keyState['s']) ? 1 : 0;
        let length = Math.hypot(speedX, speedY) || 1; if (length === 0) { return; }
        shiftX = speedX * ((mouseLeftDown ? slowSpeed : speed) / length);
        shiftY = speedY * ((mouseLeftDown ? slowSpeed : speed) / length);
    }
    playerX += shiftX;
    if (getCollision(playerX, playerY)) { playerX -= shiftX; }
    playerY += shiftY;
    if (getCollision(playerX, playerY)) { playerY -= shiftY; }

    if (playerCatStatus || invTime > 0) {
        for(const b of bullets){
            let dx = b.x - playerX, dy = b.y - playerY;
            if(!b.converted && Math.hypot(dx, dy) <= convertRadius){
                b.converted = true;
                playSfx('parry');
                particles.push({type: 2, x: b.x, y: b.y, velX: (Math.random()-0.5)*4, velY: (Math.random()-0.5)*4, lifeTime: 0.5});
                catPower += catPowerRegenPerBullet;
                b.lifeTime = 5;
                score += 15;
            }
        }
    }

    if (playerBlockX + playerBlockY === currLevel) {
        shieldPoints = Math.min(shieldPoints + shieldRegen, maxShieldPoints);
    }

    invTime = Math.max(invTime - 1 / 60, 0);
    catPower = Math.min(catPower, catPowerMax);
}

function getCollision(targetX, targetY) {
    playerBlockX = Math.floor(playerX / TILE_WIDTH / BLOCK_SIZE);
    playerBlockY = Math.floor(playerY / TILE_HEIGHT / BLOCK_SIZE);
    let px = Math.floor(targetX / TILE_WIDTH);
    let py = Math.floor(targetY / TILE_HEIGHT);
    return (map[py] && map[py][px] === "brick1") || (playerBlockX + playerBlockY > currLevel);
}

function drawMap() {
    for (let y = 0; y < MAP_SIZE; y++) {
        for (let x = 0; x < MAP_SIZE; x++) {
            const tile = map[y][x];
            if (imgDict[tile]) {
                const imgX = x * TILE_WIDTH - offsetX;
                const imgY = y * TILE_HEIGHT - offsetY;
                ctx.drawImage(imgDict[tile], imgX, imgY, TILE_WIDTH, TILE_HEIGHT);
            }
        }
    }
}

function drawPlayer() {
    if (hitPoints <= 0) { return; }
    const barW = 66, barH = 7;
    const barX = playerX - offsetX - barW/2;
    const barY = playerY - offsetY + 15;
    ctx.save();
    ctx.shadowColor = 'rgba(0,255,255,0.7)';
    ctx.shadowBlur = 32;
    ctx.fillStyle = 'rgba(131, 218, 255, 1)';
    ctx.fillRect(barX, barY, barW * Math.min(catPower, catPowerMax) / catPowerMax, barH);
    ctx.strokeStyle = 'rgba(203, 235, 255, 1)';
    ctx.lineWidth = 1.5;
    for(let i=1;i<=2;i++){
        let tx=barX+barW*i/3;
        ctx.beginPath();
        ctx.moveTo(tx,barY - 5);
        ctx.lineTo(tx,barY + barH + 5);
        ctx.stroke();
    }
    for (let i = 1; i <= hitPoints; i++) {
        ctx.drawImage(imgDict['life'], canvas.width / 2 - 20 - i * (24 + 8), canvas.height - 45, 24, 24);
    }
    for (let i = 1; i <= maxShieldPoints; i++) {
        if (i <= Math.floor(shieldPoints)) {
            ctx.drawImage(imgDict['shield'], canvas.width / 2 + 20 + i * (24 + 8), canvas.height - 45, 24, 24);
        } else if (i - 1 < shieldPoints && shieldPoints < i) {
            const ratio = shieldPoints - Math.floor(shieldPoints);
            if (ratio > 0) ctx.drawImage(imgDict['shield'], 0, 0, ratio * 8, 8, canvas.width / 2 + 20 + i * (24 + 8), canvas.height - 45, 24 * ratio, 24);
        }
    }
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(playerX - offsetX, playerY - offsetY, convertRadius, 0, Math.PI * 2);
    if (playerCatStatus || invTime > 0) {
        ctx.fill();
    } else {
        ctx.strokeStyle = '#7cf';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const width = playerCatStatus ? CAT_WIDTH : PLAYER_WIDTH;
    const height = playerCatStatus ? CAT_HEIGHT : PLAYER_HEIGHT;
    let drawX = playerX - width / 2 - offsetX;
    let drawY = playerY - height - offsetY;
    if (playerCatStatus) { drawY -= Math.sin(Math.PI * (dashTimeMax - dashTime) / dashTimeMax) * 20; }
    let flip = mouseDownX < playerX;
    ctx.save();
    if (flip) {
        ctx.translate(drawX + width / 2, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(imgDict[playerCatStatus ? 'cat' : 'player'], -width / 2, drawY, width, height);
    } else {
        ctx.drawImage(imgDict[playerCatStatus ? 'cat' : 'player'], drawX, drawY, width, height);
    }
    ctx.restore();
    if (mouseLeftDown && !playerCatStatus) {
        ctx.save();
        ctx.fillStyle = '#ff4040ff';
        ctx.shadowColor = '#ff4040ff';
        ctx.shadowBlur = 32;
        ctx.beginPath();
        ctx.arc(playerX - offsetX, playerY + BULLET_OFFSET_Y - offsetY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();

}

function getAngleTowardsPlayer(x, y) {
    let dx = playerX - x; let dy = playerY - y;
    return Math.atan2(dy, dx);
}

function enemyShoot(x, y, angles = [0], types = [1], speeds = [6], lifeTimes = [10]) {
    for (let i = 0; i < angles.length; i++) {
        let angle = angles[i];
        let type = types[i % types.length];
        let speed = speeds[i % speeds.length];
        let lifeTime = lifeTimes[i % lifeTimes.length];
        const bullet = {
            type: type,
            x: x, y: y,
            velX: Math.cos(angle) * speed, velY: Math.sin(angle) * speed,
            lifeTime: lifeTime || 10,
        };
        bullets.push(bullet);
    }
}

function updateEnemies() {
    currLevel = BLOCKS * 2;
    for(const e of enemies) {
        const enemyBlockX = Math.floor(e.x / TILE_WIDTH / BLOCK_SIZE);
        const enemyBlockY = Math.floor(e.y / TILE_HEIGHT / BLOCK_SIZE);
        currLevel = Math.min(currLevel, enemyBlockX + enemyBlockY);
        const a = getAngleTowardsPlayer(e.x, e.y);
        const rAngle = Math.random() * 2 * Math.PI;
        if (playerBlockX === enemyBlockX && playerBlockY === enemyBlockY) {
            if (e.type === 1 && currFrame % 70 % 6 === 0 && currFrame % 70 < 30) {
                // snipe
                enemyShoot(e.x, e.y, [a], [3]);
            }
            else if ((e.type === 2 || e.type === 3) && currFrame % 70 % 5 === 0 && currFrame % 70 < 25) {
                // multi-snipe
                const angles = (e.type === 2 ? [a-Math.PI / 12, a+Math.PI / 12] : [a, a-Math.PI / 18, a+Math.PI / 18]);
                enemyShoot(e.x, e.y, angles, [2]);
            }
            else if (e.type === 4 && currFrame % 80 < 25) {
                // heart
                enemyShoot(e.x, e.y, [a + currFrame % 80 * Math.PI / 24, a - currFrame % 80 * Math.PI / 24], [2], [2.5]);
            }
            else if (((e.type === 5 || e.type === 6 || e.type === 7) && currFrame % 80 === 0) ||
                    ((e.type === 13 || e.type === 14) && currFrame % 100 <= 30 && currFrame % 10 === 0)) {
                // circle && backward circle && turning circle && multi-circle
                for (let i = 0; i < 24; i++) { enemyShoot(e.x, e.y, [a + i * Math.PI / 12], [e.type >= 13 ? [4, 5][e.type - 13] : [1, 4, 5][e.type - 5]], [4.5]); }
            }
            else if ((e.type >= 8 && e.type <= 11) && currFrame % 75 === 0) {
                // line && sweep line && tighening line && random cross
                const angles = [[a], [a, a + Math.PI], [a - Math.PI / 3, a + Math.PI / 3], [rAngle, rAngle + Math.PI / 2, rAngle + Math.PI, rAngle + Math.PI / 2 * 3]][e.type - 8];
                const types = [[1], [5], [5, 6], [1]][e.type - 8];
                for (let i = 0; i < 15; i++) { enemyShoot(e.x, e.y, angles, types, [5 - i * 0.25]); }
            }
            else if (e.type === 12 && currFrame % 60 === 0) {
                // suround bullet
                for (let i = 0; i < 16; i++) { enemyShoot(e.x + Math.cos(i * Math.PI / 8) * 45, e.y + Math.sin(i * Math.PI / 8) * 45, [a], [1], [3]); }
            }
            else if (e.type === 15 && currFrame % 90 <= 45 && currFrame % 3 === 0) {
                // random spread
                const angle = Math.random() * 2 * Math.PI;
                enemyShoot(e.x, e.y, [angle, angle, angle], [2, 5, 6], [3]);
            }
            else if (e.type === 16 && currFrame % 100 <= 60 && currFrame % 2 === 0) {
                // machine gun
                enemyShoot(e.x, e.y, [a + Math.random() * Math.PI / 6 - Math.PI / 12], [2], [2 + Math.random() * 2.5]);
            }
            else if (e.type === 17 && currFrame % 100 <= 60 && currFrame % 15 === 0) {
                // quick shot gun
                for (let i = 0; i < 8; i++) { enemyShoot(e.x, e.y, [a + Math.random() * Math.PI / 2.5 - Math.PI / 5], [2], [3 + Math.random() * 1.5]); }
            }
            else if (e.type === 18 && currFrame % 75 === 0) {
                // boom
                for (let i = 0; i < 6; i++) { enemyShoot(e.x, e.y, [a + i * Math.PI / 3], [7], [2.8]); }
            }
            else if ((e.type === 19 || e.type === 20) && currFrame % 80 === 0) {
                // shotgun with boom
                const angles = (e.type === 20 ? [a-Math.PI / 6, a+Math.PI / 6] : [a, a-Math.PI / 12, a+Math.PI / 12]);
                enemyShoot(e.x, e.y, angles, [7], [4]);
            }
            else if (e.type === 114) {
                const tick = currFrame % 1500;
                if (tick < 400) {
                    if (tick % 2 === 0) { enemyShoot(e.x, e.y, [a + tick * Math.PI / 30], [4], [2.5]); }
                    if (tick % 40 === 0) { for (let i = 0; i < 24; i++) { enemyShoot(e.x, e.y, [a + i * Math.PI / 12], [tick >= 200 ? 5 : 6], [4.5]); } }
                }
                else if (tick >= 400 && tick < 800) {
                    if (tick % 45 === 0) {
                        for (let i = 0; i < 16; i++) {
                            const bx = e.x + Math.cos(i * Math.PI / 8) * 45;
                            const by = e.y + Math.sin(i * Math.PI / 8) * 45;
                            enemyShoot(bx, by, [getAngleTowardsPlayer(bx, by)], [2], [2.5]);
                        }
                    }
                    if (tick % 60 === 0) {
                        const a1 = Math.PI / 4.5 * Math.random(); const a2 = Math.PI / 4.5 * Math.random();
                        for (let i = 0; i < 15; i++) { enemyShoot(e.x, e.y, [a, a + a1, a - a2], [1], [5 - i * 0.25]); }
                    }
                }
                else if (tick >= 800 && tick < 1200) {
                    if (tick % 3 === 0) { enemyShoot(e.x, e.y, [a + Math.random() * Math.PI / 6 - Math.PI / 12], [2], [2 + Math.random() * 2.5]); }
                    if (tick % 120 === 0) { for (let i = 0; i < 15; i++) { enemyShoot(e.x, e.y, [rAngle, rAngle + Math.PI / 2, rAngle + Math.PI, rAngle + Math.PI / 2 * 3], [1], [5 - i * 0.25]); } }
                }
                else if (tick >= 1200) {
                    if (tick % 3 === 0) { for (let i = 0; i < 12; i++) { enemyShoot(e.x, e.y, [a + i * Math.PI / 6], [2, 5, 6][i % 3], [4.5]); }}
                    if (tick % 90 === 0) { for (let i = 0; i < 15; i++) { enemyShoot(e.x, e.y, [a - Math.PI / 2.5, a + Math.PI / 2.5], [5, 6], [5 - i * 0.25]); }}
                }
            }
        }
        ctx.save();
        ctx.shadowColor = 'rgba(255, 27, 99, 0.8)';
        ctx.shadowBlur = 32;
        ctx.drawImage(imgDict['enemy'], e.x - PLAYER_WIDTH/2 - offsetX, e.y - PLAYER_HEIGHT - offsetY, PLAYER_WIDTH, PLAYER_HEIGHT);
        ctx.restore();
    }
    enemies = enemies.filter(e => e.hp > 0);
}

function updateBullets() {
    for(const b of bullets) {
        if(b.converted && enemies.length) {
            let minDist = 1e9, target = null;
            for(const e of enemies) {
                let dx = e.x - b.x, dy = e.y - b.y, d2 = dx*dx+dy*dy;
                const enemyBlockX = Math.floor(e.x / TILE_WIDTH / BLOCK_SIZE);
                const enemyBlockY = Math.floor(e.y / TILE_HEIGHT / BLOCK_SIZE);
                if(d2 < minDist && playerBlockX === enemyBlockX && playerBlockY === enemyBlockY) {
                    minDist = d2; target = e;
                }
                if(d2 <= HIT_RADIUS*HIT_RADIUS) {
                    b.lifeTime = 0;
                    e.hp = (e.hp||1)-1;
                    score += 25;
                    particles.push({type: 1, x: b.x, y: b.y, velX: (Math.random()-0.5)*4, velY: (Math.random()-0.5)*4, lifeTime: 0.5});
                    playSfx('hit');
                    texts.push({text: "Hit", x: b.x + (Math.random()-0.5) * 40, y: b.y + (Math.random()-0.5) * 40, color: 'rgba(0, 255, 234, 1)', lifeTime: 1});
                }
            }
            if(target) {
                let dx = target.x - b.x, dy = target.y - b.y;
                let len = Math.hypot(dx, dy) || 1;
                let speed = Math.hypot(b.velX, b.velY);
                let tx = dx/len*speed, ty = dy/len*speed;
                let dot = b.velX * tx + b.velY * ty;
                if (dot < -0.99 * speed * speed) {
                    let perp = [-b.velY, b.velX];
                    let pl = Math.hypot(perp[0], perp[1]) || 1;
                    b.velX = b.velX * 0.98 + perp[0] / pl * speed * 0.02;
                    b.velY = b.velY * 0.98 + perp[1] / pl * speed * 0.02;
                } else {
                    b.velX = b.velX * 0.82 + tx * 0.18;
                    b.velY = b.velY * 0.82 + ty * 0.18;
                }
                let vlen = Math.hypot(b.velX, b.velY) || 1;
                let ns = Math.min(speed + 0.08, 16);
                b.velX = b.velX / vlen * ns;
                b.velY = b.velY / vlen * ns;
            }
        }
        if(!b.converted){
            let dx = b.x - playerX, dy = b.y - playerY;
            if(Math.hypot(dx, dy) <= HIT_RADIUS && invTime <= 0 && hitPoints > 0){
                b.lifeTime = 0;
                playSfx('alarm');
                for (let i = 0; i < 6; i++) {
                    particles.push({type: 3, x: b.x, y: b.y, velX: (Math.random()-0.5)*4, velY: (Math.random()-0.5)*4, lifeTime: 0.5});
                }
                invTime = 0.6;
                if (shieldPoints >= 1) {
                    shieldPoints--;
                    texts.push({text: "Shield Blocked (" + Math.round(shieldPoints, 1) + " Left)", x: b.x, y: b.y - 20, color: 'rgba(209, 106, 106, 1)', lifeTime: 1});
                }
                else { hitPoints--;
                    if (hitPoints > 1) { texts.push({text: hitPoints + " Lifes Remaining", x: b.x, y: b.y - 20, color: 'rgba(255, 92, 92, 1)', lifeTime: 1}); }
                    else {texts.push({text: "Caution: Last Life!", x: b.x, y: b.y - 20, color: 'rgba(255, 92, 92, 1)', lifeTime: 1});}
                    if (hitPoints <= 0) { stage = -Math.abs(stage); }
                }
            }
            const len = Math.hypot(b.velX, b.velY) || 1;
            if (b.type === 2) {
                b.velX = b.velX / len * Math.min(len + 0.06, 5);
                b.velY = b.velY / len * Math.min(len + 0.06, 5);
            }
            else if (b.type === 3) {
                b.velX = b.velX / len * Math.max(len - 0.06, 2);
                b.velY = b.velY / len * Math.max(len - 0.06, 2);
            }
            else if (b.type === 4) {
                if (!b.velBX || !b.velBY) {
                    b.velBX = -b.velX;
                    b.velBY = -b.velY;
                }
                b.velX = b.velX * 0.992 + b.velBX * 0.008;
                b.velY = b.velY * 0.992 + b.velBY * 0.008;
            }
            else if (b.type === 5 || b.type === 6) {
                b._angle = b._angle ?? Math.atan2(b.velY, b.velX);
                b._angle += (b.type === 5 ? 0.015 : -0.015);
                b.velX = Math.cos(b._angle) * len;
                b.velY = Math.sin(b._angle) * len;
            }
            else if (b.type === 7) {
                if (!b._spawned && len > 2) {
                    let newLen = Math.max(len - 0.06, 2);
                    b.velX = b.velX / len * newLen;
                    b.velY = b.velY / len * newLen;
                    if (newLen <= 2) {
                        b._spawned = true;
                        for (let i = 0; i < 12; i++) { enemyShoot(b.x, b.y, [i * Math.PI / 6], [1], [4.5]); }
                        b.lifeTime = 0;
                    }
                }
            }
        }
        b.x += b.velX;
        b.y += b.velY;
        if (getCollision(b.x, b.y)) {
            b.lifeTime = 0;
            particles.push({type: 1, x: b.x, y: b.y, velX: (Math.random()-0.5)*4, velY: (Math.random()-0.5)*4, lifeTime: 0.5});
        }
        b.lifeTime -= 1 / 60;

        const x = b.x - offsetX;
        const y = b.y - offsetY + BULLET_OFFSET_Y;
        const angle = Math.atan2(b.velY, b.velX);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.drawImage(b.converted ? imgDict['bulletc'] : (b.type >= 5 ? imgDict['bullet1'] : imgDict['bullet2']), -BULLET_SIZE/2, -BULLET_SIZE/2, BULLET_SIZE, BULLET_SIZE);
        ctx.restore();
    }
    bullets = bullets.filter(b => b.lifeTime > 0);
}

function updateTexts() {
    texts = texts.filter(t => t.lifeTime > 0);
    ctx.save();
    ctx.font = 'bold 16px "Press Start 2P", "VT323", "Consolas", "monospace"';
    ctx.textAlign = 'center';
    for (const t of texts) {
        t.lifeTime -= 1 / 60;
        ctx.fillStyle = t.color || '#fff';
        ctx.fillText(t.text, t.x - offsetX, t.y - offsetY - Math.sin((1 - t.lifeTime) * Math.PI / 2) * 12);
    }
    ctx.restore();
}

function updateParticles() {
    particles = particles.filter(p => p.lifeTime > 0);
    for (const p of particles) {
        p.x += p.velX;
        p.y += p.velY;
        p.lifeTime -= 1 / 60;
        if (p.type === 1) {
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(p.x - offsetX, p.y - offsetY, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (p.type === 2 || p.type === 3) {
            ctx.save();
            ctx.translate(p.x - offsetX, p.y - offsetY);
            let r = 22;
            let angle = (p.lifeTime || 0) * 4 * Math.PI;
            ctx.rotate(angle);
            ctx.fillStyle = p.type === 2 ? '#39f' : 'rgba(255, 92, 92, 1)';
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 2;
            ctx.strokeRect(-r/2, -r/2, r, r);
            ctx.restore();
        }
    }
}

let lastProgressDraw = 0;
function drawHint() {
    ctx.save();
    ctx.font = 'bold 18px "Press Start 2P", "VT323", "Consolas", "monospace"';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff73';
    if (stage === 1) {
        ctx.fillText("Use [W][A][S][D] to Move", 512 - offsetX, 392 - offsetY);
        ctx.fillText("Mouse Right Click to turn into a Black Cat and dash", 512 - offsetX, 422 - offsetY);
        let tipX = 512 + (moveFlags[0] ? 1024 : 0);
        let tipY = 512 + (moveFlags[0] ? 0 : 1024);
        ctx.fillText("When transformed into a cat, a field of doom forms around you", tipX - offsetX, tipY - 120 - offsetY);
        ctx.fillText("Enemy bullets affected by doom will turn to attack themselves", tipX - offsetX, tipY - 90 - offsetY);
        ctx.fillText("Try defeat the guard here", tipX - offsetX, tipY - 60 - offsetY);
        tipX += moveFlags[1] ? 675 : 0;
        tipY += moveFlags[1] ? 0 : 675;
        ctx.fillText("Be careful! Being hit by bullets will cause shield/hit-points lost.", tipX - offsetX, tipY - 30 - offsetY);
        ctx.fillText("When hit-points drop to 0, Rin will fail to escape.", tipX - offsetX, tipY - offsetY);
    }

    ctx.shadowColor = 'rgba(0,255,255,0.7)';
    ctx.shadowBlur = 32;
    ctx.fillStyle = 'rgba(131, 218, 255, 1)';
    ctx.strokeStyle = 'rgba(203, 235, 255, 1)';
    ctx.lineWidth = 1.5;

    lastProgressDraw = lerp(lastProgressDraw, (playerBlockX + playerBlockY) / (2 * BLOCKS - 2), 0.02);
    ctx.fillRect(canvas.width / 4, 15, canvas.width / 2 * lastProgressDraw, 10);
    const blockWidth = canvas.width / (4 * BLOCKS - 4);
    for (let i = 0; i < BLOCKS - 1; i++) {
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2 + i * blockWidth, 10);
        ctx.lineTo(canvas.width / 2 + i * blockWidth, 30);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2 - i * blockWidth, 10);
        ctx.lineTo(canvas.width / 2 - i * blockWidth, 30);
        ctx.stroke();
    }
    ctx.fillText(Math.round(lastProgressDraw * 100, 1) + "%", canvas.width / 4 + lastProgressDraw * canvas.width / 2 + 25, 25);

    if (playerBlockX + playerBlockY === currLevel) { ctx.fillText("Eliminate all Enemies in this room", canvas.width / 2, canvas.height - 60); }
    else {
        ctx.fillText("Reach the next room to escape", canvas.width / 2, canvas.height - 60);
        if (shieldPoints < maxShieldPoints - 1e-9) {
            ctx.fillText("Your shield only regenerates during combat", canvas.width / 2, canvas.height - 80);
        }
    }
    ctx.fillText("Score: " + String(score).padStart(6, '0'), canvas.width / 2, 45);
    ctx.restore();
}

let lastRatio = 0;
function drawBossBar() {
    if (enemies.length === 1 && enemies[0].type === 114) {
        const currRatio = enemies.length ? enemies[0].hp / (enemies[0].maxHp || 1) : 0;
        lastRatio = lerp(lastRatio, currRatio, 0.05);
        ctx.save();
        ctx.fillStyle = '#ff3535ff';
        ctx.globalAlpha = 0.5;
        ctx.shadowColor = '#ff3535ff';
        ctx.shadowBlur = 20;
        ctx.textAlign = 'center';
        ctx.font = 'bold 24px "Press Start 2P", "VT323", "Consolas", "monospace"';
        ctx.fillText('Boss', canvas.width - 30, canvas.height / 4 - 30);
        ctx.fillRect(canvas.width - 30, canvas.height / 2 - canvas.height / 4 * lastRatio, 10, canvas.height / 2 * lastRatio);
        ctx.restore();
    }
}

function cameraApproach() {
    const targetX = playerX - canvas.width / 2;
    const targetY = playerY - canvas.height / 2;
    offsetX = lerp(offsetX, targetX, 0.1);
    offsetY = lerp(offsetY, targetY, 0.1);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function drawMenu() {
    ctx.save();
    ctx.fillStyle = '#ffffff73';
    ctx.textAlign = 'center';
    if (stage === 0) {
        ctx.font = 'bold 62px "Press Start 2P", "VT323", "Consolas", "monospace"';
        ctx.fillText("Rin the Cat Sorceresses", canvas.width / 2, canvas.height / 2);
        ctx.font = 'bold 24px "Press Start 2P", "VT323", "Consolas", "monospace"';
        ctx.fillText("Press [Enter] to Start", canvas.width / 2, canvas.height / 2 + 120);
    }
    if (stage >= 2 && stage % 2 === 0) {
        bullets = [];
        ctx.font = 'bold 42px "Press Start 2P", "VT323", "Consolas", "monospace"';
        ctx.fillText("Stage " + Math.floor(stage / 2) + "/3 Clear", canvas.width / 2, canvas.height / 2 - 120);
        ctx.font = 'bold 24px "Press Start 2P", "VT323", "Consolas", "monospace"';
        ctx.fillText("Press [Enter] to Upstairs", canvas.width / 2, canvas.height / 2 + 120);
    }
    if (stage < -1e-9) {
        ctx.font = 'bold 62px "Press Start 2P", "VT323", "Consolas", "monospace"';
        ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2);
        ctx.font = 'bold 24px "Press Start 2P", "VT323", "Consolas", "monospace"';
        ctx.fillText("Press [Enter] to Continue", canvas.width / 2, canvas.height / 2 + 120);
        ctx.fillText("Press [R] to Restart", canvas.width / 2, canvas.height / 2 + 150);
        ctx.font = 'bold 18px "Press Start 2P", "VT323", "Consolas", "monospace"';
        ctx.fillText("Continuing will affect the final ending", canvas.width / 2, canvas.height / 2 + 180);
    }
    ctx.restore();
    if (keyState['enter'] && stage % 2 === 0) {
        stage++; playSfx('tip'); restartMap();
    }
    if (stage > 0 && enemies.length === 0 && stage % 2 === 1) {
        stage++; playSfx('tip');
    }
    if (stage < -1e-9 && keyState['r']) {
        stage = 0; playSfx('tip'); restartMap(); continued = false;
    }
    if (stage < -1e-9 && keyState['enter']) {
        stage = Math.abs(stage); playSfx('tip'); continued = true;
        hitPoints = 3; shieldPoints = 3; catPower = catPowerMax;
    }
}

function drawMask() {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.filter = `blur(${Math.abs(maskAlpha) * 12}px)`;
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    ctx.restore();
    if (stage % 2 == 1) { maskAlpha = lerp(maskAlpha, 0, 0.1); }
    else { maskAlpha = lerp(maskAlpha, 1, 0.1); }
}

function loop() {
    resizeCanvas();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingEnabled = false;
    currFrame++;
    update();
    cameraApproach();
    drawMap();
    drawPlayer();
    updateEnemies();
    updateBullets();
    updateParticles();
    updateTexts();
    drawHint();
    drawBossBar();
    drawMask();
    drawMenu();
}

setInterval(loop, 1000 / 60);