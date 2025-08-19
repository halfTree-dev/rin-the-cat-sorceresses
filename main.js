const audioCtx = window.AudioContext ? new window.AudioContext() : (window.webkitAudioContext ? new window.webkitAudioContext() : null);
function playSfx(name) {
    if (!audioCtx) return;
    let t = audioCtx.currentTime;
    if (name === 'alarm' || name === 'tip') {
        for (let i = 0; i < (name === 'alarm' ? 4 : 1); i++) {
            let o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.type = 'sine';
            o.frequency.value = 1200;
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
    } else if (name === 'hit') {
        let o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = 320;
        let real = new Float32Array([0, 1, 0.7, 0.3, 0.1]);
        let imag = new Float32Array(real.length);
        let impact = audioCtx.createPeriodicWave(real, imag);
        o.setPeriodicWave(impact);
        o.connect(g).connect(audioCtx.destination);
        g.gain.value = 0.19;
        o.start(t);
        g.gain.setValueAtTime(0.19, t);
        g.gain.linearRampToValueAtTime(0, t + 0.09);
        o.frequency.linearRampToValueAtTime(120, t + 0.09);
        o.stop(t + 0.1);
    }
}

const TILE_WIDTH = 32;
const TILE_HEIGHT = 32;
const PLAYER_WIDTH = 26;
const PLAYER_HEIGHT = 42;
const BULLET_SIZE = 14;
const BULLET_OFFSET_Y = -21;
const HIT_RADIUS = 14;
const CAT_WIDTH = 26;
const CAT_HEIGHT = 22;
const MAP_SIZE = 256;

const map = Array.from({length:MAP_SIZE},()=>Array.from({length:MAP_SIZE},()=>""));
const BLOCKS = 8;
const BLOCK_SIZE = 32;

let gameState = 0;
let stage = 0;
let currFrame = 0;
let score = 0;

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

let canvas = document.getElementById('game');
let ctx = canvas.getContext('2d');
const imgDict = {};
['brick1','brick2','player','cat','enemy', 'bullet1', 'bullet2', 'bullet3', 'bulletc', 'life', 'shield'].forEach(name => {
    const img = new Image();
    img.src = `assets/${name}.png`;
    imgDict[name] = img;
});

function restartMap() {
    playerX = 512; playerY = 512;
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
            let enemyCount = 6 + Math.floor(Math.random() * 4);
            for (let i = 0; i < enemyCount; i++) {
                let ex = ((currRoomX * BLOCK_SIZE + 12) + Math.random() * (BLOCK_SIZE - 24)) * TILE_WIDTH;
                let ey = ((currRoomY * BLOCK_SIZE + 12) + Math.random() * (BLOCK_SIZE - 24)) * TILE_HEIGHT;
                enemies.push({ type:Math.floor(Math.random() * 4) + 1, x: ex, y: ey, hp: 15 });
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

let mouseRightDown = false;
let mouseDownX = 0, mouseDownY = 0;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousemove', e => {
    mouseDownX = e.offsetX + offsetX;
    mouseDownY = e.offsetY + offsetY;
});
canvas.addEventListener('mousedown', e => {
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
    if (e.button === 2) mouseRightDown = false;
});

function update() {
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
        shiftX = speedX * speed / length;
        shiftY = speedY * speed / length;
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
                texts.push({text: "Parry", x: b.x, y: b.y, color: '#7cf', lifeTime: 1});
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
    ctx.restore();

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

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    ctx.arc(playerX - offsetX, playerY - offsetY, convertRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#7cf';
    if (playerCatStatus || invTime > 0) {
        ctx.fill();
    } else {
        ctx.strokeStyle = '#7cf';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    ctx.restore();

    const width = playerCatStatus ? CAT_WIDTH : PLAYER_WIDTH;
    const height = playerCatStatus ? CAT_HEIGHT : PLAYER_HEIGHT;
    let drawX = playerX - width / 2 - offsetX;
    let drawY = playerY - height - offsetY;
    if (playerCatStatus) { drawY -= Math.sin(Math.PI * (dashTimeMax - dashTime) / dashTimeMax) * 20; }
    ctx.save();
    let flip = mouseDownX < playerX;
    if (flip) {
        ctx.translate(drawX + width / 2, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(imgDict[playerCatStatus ? 'cat' : 'player'], -width / 2, drawY, width, height);
    } else {
        ctx.drawImage(imgDict[playerCatStatus ? 'cat' : 'player'], drawX, drawY, width, height);
    }
    ctx.restore();

}

function enemyShoot1(x, y, shiftAngles = [0], type = 1, speed = 6) {
    let dx = playerX - x; let dy = playerY - y;
    for (let shiftAngle of shiftAngles) {
        let angle = Math.atan2(dy, dx) + shiftAngle;
        const bullet = {
            type: type,
            x: x, y: y,
            velX: Math.cos(angle) * speed, velY: Math.sin(angle) * speed,
            lifeTime: 5
        };
        bullets.push(bullet);
    }
}

function enemyShoot2(x, y, gapAngle, type = 1) {
    let currAngle = 0;
    const angles = [];
    while (currAngle < Math.PI * 2 - 1e-9) {
        angles.push(currAngle);
        currAngle += gapAngle;
    }
    for (let angle of angles) {
        enemyShoot1(x, y, [angle], type);
    }
}

function enemyShoot3(x, y, radius, gapAngle, type = 1, speed = 6, shiftAngles = [0]) {
    let currAngle = 0;
    const angles = [];
    while (currAngle < Math.PI * 2 - 1e-9) {
        enemyShoot1(x + Math.cos(currAngle) * radius, y + Math.sin(currAngle) * radius,
        shiftAngles, type, speed);
        currAngle += gapAngle;
    }
}

function enemyShoot4(x, y, shiftAngles = [0], type = 1, speed = 6, amount = 1, decreaseSpeed = 0.5) {
    for (let i = 0; i < amount; i++) {
        enemyShoot1(x, y, shiftAngles, type, speed - i * decreaseSpeed);
    }
}

function enemyShoot5(x, y, radius, type = 1, speed = 6, amount = 1, continAmount = 1, decreaseSpeed = 0.5) {
    for (let i = 0; i < amount; i++) {
        const len = (0.5 + 0.5 * Math.random()) * radius;
        const angle = Math.random() * Math.PI * 2;
        enemyShoot4(x + len * Math.cos(angle), y + len * Math.sin(angle), [0], type, speed, continAmount, decreaseSpeed);
    }
}

function updateEnemies() {
    currLevel = BLOCKS * 2;
    for(const e of enemies) {
        const enemyBlockX = Math.floor(e.x / TILE_WIDTH / BLOCK_SIZE);
        const enemyBlockY = Math.floor(e.y / TILE_HEIGHT / BLOCK_SIZE);
        currLevel = Math.min(currLevel, enemyBlockX + enemyBlockY);
        if (playerBlockX === enemyBlockX && playerBlockY === enemyBlockY) {
            if (e.type === 1) {
                if (currFrame % 100 % 6 === 0 && currFrame % 100 < 30) {
                    enemyShoot1(e.x, e.y, [0], 3);
                }
            }
            else if (e.type === 2) {
                if (currFrame % 100 % 5 === 0 && currFrame % 100 < 25) {
                    enemyShoot1(e.x, e.y, [-Math.PI / 12, Math.PI / 12], 2);
                }
            }
            else if (e.type === 3) {
                if (currFrame % 240 === 0) {
                    enemyShoot2(e.x, e.y, Math.PI / 24, 4);
                }
            }
            else if (e.type === 4) {
                if (currFrame % 240 === 0) {
                    enemyShoot2(e.x, e.y, Math.PI / 18, 5);
                }
            }
            else if (e.type === 114) {
                const tick = currFrame % 1400;
                if (tick < 230 && tick % 3 == 0) {
                    enemyShoot1(e.x, e.y, [(Math.random()-0.5)*Math.PI/10], 2, 7.5);
                }
                else if (tick >= 300 && tick <= 600 && tick % 50 == 0) {
                    enemyShoot3(e.x, e.y, 50, Math.PI / 24, 2, 3.5, [0, -Math.PI / 4, Math.PI / 4]);
                }
                else if (tick >= 500 && tick <= 900 && tick % 45 == 0) {
                    enemyShoot4(e.x, e.y, [0, -Math.PI / 12, Math.PI / 12], 3, 8, 10, 0.5);
                }
                else if (tick >= 1000 && tick <= 1100 && tick % 20 == 0) {
                    enemyShoot2(e.x, e.y, Math.PI / 24, 5);
                }
                else if ((tick >= 1200 || tick <= 100) && tick % 60 == 0) {
                    enemyShoot5(e.x, e.y, 145, 2, 4, 5, 15, 0.2);
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
            if(Math.hypot(dx, dy) <= HIT_RADIUS){
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
                }
            }
            const len = Math.hypot(b.velX, b.velY) || 1;
            if (b.type === 2) {
                b.velX = b.velX / len * Math.min(len + 0.06, 7);
                b.velY = b.velY / len * Math.min(len + 0.06, 7);
            }
            else if (b.type === 3) {
                b.velX = b.velX / len * Math.max(len - 0.06, 2.5);
                b.velY = b.velY / len * Math.max(len - 0.06, 2.5);
            }
            else if (b.type === 4) {
                if (!b.velBX || !b.velBY) {
                    b.velBX = -b.velX;
                    b.velBY = -b.velY;
                }
                b.velX = b.velX * 0.992 + b.velBX * 0.008;
                b.velY = b.velY * 0.992 + b.velBY * 0.008;
            }
            else if (b.type === 5) {
                b._angle = b._angle ?? Math.atan2(b.velY, b.velX);
                b._angle += 0.015;
                b.velX = Math.cos(b._angle) * len;
                b.velY = Math.sin(b._angle) * len;
            }
            else if (b.type === 6) {
                if (!b._spawned && len > 2) {
                    let newLen = Math.max(len - 0.06, 2);
                    b.velX = b.velX / len * newLen;
                    b.velY = b.velY / len * newLen;
                    if (newLen <= 2) {
                        b._spawned = true;
                        // Add Spawn Code
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
        ctx.drawImage(b.converted ? imgDict['bulletc'] : imgDict['bullet1'], -BULLET_SIZE/2, -BULLET_SIZE/2, BULLET_SIZE, BULLET_SIZE);
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
    ctx.restore();
    if (keyState['enter'] && stage % 2 === 0) {
        stage++; playSfx('tip');
    }
    if (enemies.length === 0 && stage % 2 === 1) {
        stage++; playSfx('tip');
    }
}

function drawMask() {
    ctx.save();
    ctx.globalAlpha = maskAlpha;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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