// Constants
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
const BLOCKS = 8;
const BLOCK_SIZE = 32;
const FONTS = '"Press Start 2P", "VT323", "Consolas", "monospace"';
const BLUE = '#3ae1f4ff';
const BRIGHT_BLUE = '#83f3ffff'
const RED = '#ff5c5c';
const GREY = '#d3d3d3ff';

const maxShieldPoints = 3;
const shieldRegen = 1 / 250;
const shieldRecoverMax = 0.5;
const speed = 4;
const slowSpeed = 2.5;
const dashSpeed = 10;
const dashTimeMax = 0.25;
const dashPowerCost = 100;
const catPowerMax = 300;
const catPowerRegen = 100 / 126;
const catPowerRegenPerBullet = 0;
const titleShowTimeMax = 3;

const convertRadius = 100;
const upgradeScore = 100000;
const upgradeRadius = 8;

const tier1Enemies = [1, 2, 3, 8, 12, 21, 22, 25]
const tier2Enemies = [4, 5, 6, 7, 9, 11, 18, 23, 24];
const tier3Enemies = [10, 13, 14, 15, 16, 17, 19, 20, 26];
const tier1StageSpawns = [[2, 3], [2, 4], [3, 4]];
const tier2StageSpawns = [[1, 1], [1, 2], [1, 2]];
const tier3StageSpawns = [[0, 1], [0, 1], [1, 1]];

const imgDict = {};
['brick1','brick2','player','cat','enemy', 'bullet1', 'bullet2', 'bulletc', 'life', 'shield'].forEach(name => {
    const img = new Image();
    img.src = `assets/${name}.png`;
    imgDict[name] = img;
});
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Game Objects
let map = Array.from({length:MAP_SIZE},()=>Array.from({length:MAP_SIZE},()=>""));
let gameState = 0;
let stage = 0;
let currFrame = 0;
let score = 0;
let continued = false;
let practicing = false;
let highScore = 0;
let unlockProgress = 0;
let clearStatus = 0;

let offsetX = 0, offsetY = 0;

let hitPoints = 3;
let shieldPoints = 3;
let shieldRecoverCache = 0;
let invTime = 0;

let playerX = 512, playerY = 512;
let playerCatStatus = false;
let playerBlockX = 0;
let playerBlockY = 0;
let currLevel = 0;

let dashX = 0, dashY = 0;
let dashTime = 0;
let catPower = 0;

let maskAlpha = 1;
let moveFlags = [];
let enemies = []; // {name, x, y, hp}
let bullets = []; // {type, x, y, velX, velY, converted, lifeTime}
let texts = []; // {text, x, y, lifeTime}
let particles = []; // {type, x, y, velX, velY, lifeTime}

let lastProgressDraw = 0;
let lastRatio = 0;

let titleShowTime = 0;

// Input
let mouseLeftDown = false;
let mouseRightDown = false;
let mouseDownX = 0, mouseDownY = 0;
let keyState = {};

document.addEventListener('keydown', e => {
    keyState[e.key.toLowerCase()] = true;
    if (e.key === ' ' && dashTime <= 0 && catPower >= dashPowerCost) {
        doCatDash((keyState['a']) ? -1 : 0 + (keyState['d']) ? 1 : 0,
            (keyState['w']) ? -1 : 0 + (keyState['s']) ? 1 : 0);
    }
});
document.addEventListener('keyup',   e => { keyState[e.key.toLowerCase()] = false; });

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousemove', e => {
    mouseDownX = e.offsetX;
    mouseDownY = e.offsetY;
});
canvas.addEventListener('mousedown', e => {
    if (e.button === 0) {
        mouseLeftDown = true;
    }
    if (e.button === 2 && dashTime <= 0 && catPower >= dashPowerCost) {
        mouseRightDown = true;
        mouseDownX = e.offsetX;
        mouseDownY = e.offsetY;
        doCatDash(mouseDownX + offsetX - playerX, mouseDownY + offsetY - playerY);
    }
});
canvas.addEventListener('mouseup', e => {
    if (e.button === 0) mouseLeftDown = false;
    if (e.button === 2) mouseRightDown = false;
});

// Game Logic
function restartMap() {
    playerX = 512; playerY = 512; bullets = []; enemies = []; map = Array.from({length:MAP_SIZE},()=>Array.from({length:MAP_SIZE},()=>"")); catPower = catPowerMax; moveFlags = [];
    let currRoomX = 0, currRoomY = 0;
    let moveRightFlag = 0;
    while (currRoomX < BLOCKS && currRoomY < BLOCKS) {
        // Spawn Map Tiles
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
        // Move to next room
        if (currRoomX === 0 && currRoomY === 0) { firstMoveRightFlag = moveRightFlag; }
        moveRightFlag = Math.random() < 0.5;
        moveFlags.push(moveRightFlag);
        if (currRoomX === BLOCKS - 1) { moveRightFlag = false; }
        if (currRoomY === BLOCKS - 1) { moveRightFlag = true; }
        if (moveRightFlag) { currRoomX++; } else { currRoomY++; }

        // Spawn Enemies
        if (currRoomX + currRoomY === 1) {
            enemies.push({type: 1, x: (currRoomX + 0.5) * BLOCK_SIZE * TILE_WIDTH, y: (currRoomY + 0.5) * BLOCK_SIZE * TILE_HEIGHT, hp: 20, maxHp: 20});
        }
        if (currRoomX + currRoomY >= 2 && currRoomX + currRoomY < BLOCKS * 2 - 2) {
            function pick(arr, n) {
                const result = [];
                for (let i = 0; i < n; i++) { result.push(arr[Math.floor(Math.random() * arr.length)]); }
                return result;
            }
            const stageIndex = Math.floor(stage / 2);
            let tier1 = pick(tier1Enemies, ranInt(tier1StageSpawns[stageIndex][0], tier1StageSpawns[stageIndex][1]));
            let tier2 = pick(tier2Enemies, ranInt(tier2StageSpawns[stageIndex][0], tier2StageSpawns[stageIndex][1]));
            let tier3 = pick(tier3Enemies, ranInt(tier3StageSpawns[stageIndex][0], tier3StageSpawns[stageIndex][1]));
            let allTypes = tier1.concat(tier2, tier3);
            for (let i = 0; i < allTypes.length; i++) {
                let ex = ((currRoomX * BLOCK_SIZE + 12) + Math.random() * (BLOCK_SIZE - 24)) * TILE_WIDTH;
                let ey = ((currRoomY * BLOCK_SIZE + 12) + Math.random() * (BLOCK_SIZE - 24)) * TILE_HEIGHT;
                enemies.push({ type: allTypes[i], x: ex, y: ey, hp: 30 });
            }
        }
        else if (currRoomX + currRoomY === BLOCKS * 2 - 2) {
            enemies.push({type: 114 + Math.floor(stage / 2), x: (currRoomX + 0.5) * BLOCK_SIZE * TILE_WIDTH, y: (currRoomY + 0.5) * BLOCK_SIZE * TILE_HEIGHT, hp: 1500, maxHp: 1500});
        }
    }
}
restartMap();

function update() {
    currFrame++;

    // Audio Update
    playColdDown = Math.max(0, playColdDown - 1 / 60);

    // Player Motion
    if (hitPoints > 0) {
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
    }

    // Cat Status Action
    playerCatStatus = dashTime > 0;
    if ((playerCatStatus || invTime > 0) && hitPoints > 0) {
        for (const b of bullets) {
            let dx = b.x - playerX, dy = b.y - playerY;
            if (!b.converted && Math.hypot(dx, dy) <= getRadius()){
                if (invTime > 0) {
                    b.lifeTime = 0;
                    particles.push({type: 4, x: b.x, y: b.y, velX: (Math.random()-0.5)*4, velY: (Math.random()-0.5)*4, lifeTime: 0.5});
                    playSound('parry');
                }
                else {
                    b.converted = true;
                    if (shieldRecoverCache < shieldRecoverMax) {
                        if ((Math.floor(shieldPoints + shieldRegen) - Math.floor(shieldPoints) > 0) && shieldPoints < 3) {
                            texts.push({ text: "Shield Recover", x: playerX, y: playerY, lifeTime: 1, color: BLUE }); playSound('tip');
                        }
                        shieldRecoverCache += shieldRegen;
                        shieldPoints += shieldRegen;
                    }
                    playSound('parry');
                    particles.push({type: 2, x: b.x, y: b.y, velX: (Math.random()-0.5)*4, velY: (Math.random()-0.5)*4, lifeTime: 0.5});
                    catPower += catPowerRegenPerBullet;
                    b.lifeTime = 5;
                    score += 15;
                }
            }
        }
    }
    else { catPower = Math.min(catPowerRegen + catPower, catPowerMax); }
    invTime = Math.max(invTime - 1 / 60, 0);

    // Shield Limit
    shieldPoints = Math.min(shieldPoints, maxShieldPoints);
    shieldRecoverCache = Math.max(shieldRecoverCache - 1 / 60, 0);

    // Enemy Update
    currLevel = BLOCKS * 2;
    for (const e of enemies) {
        const enemyBlockX = Math.floor(e.x / TILE_WIDTH / BLOCK_SIZE);
        const enemyBlockY = Math.floor(e.y / TILE_HEIGHT / BLOCK_SIZE);
        currLevel = Math.min(currLevel, enemyBlockX + enemyBlockY);
        const angle = getAngleTowardsPlayer(e.x, e.y);
        const rAngle = Math.random() * 2 * Math.PI;
        const tick = currFrame % 1500;
        // Enemy fire bullets
        if (playerBlockX === enemyBlockX && playerBlockY === enemyBlockY) {
            if (e.type === 1 && currFrame % 70 % 6 === 0 && currFrame % 70 < 30) {
                // snipe
                enemyShoot(e.x, e.y, [angle], [3]);
            }
            else if ((e.type === 2 || e.type === 3) && currFrame % 70 % 5 === 0 && currFrame % 70 < 25) {
                // multi-snipe
                const angles = (e.type === 2 ? [angle-PI2ToX(24), angle+PI2ToX(24)] : [angle, angle-PI2ToX(36), angle+PI2ToX(36)]);
                enemyShoot(e.x, e.y, angles, [2]);
            }
            else if (e.type === 4 && currFrame % 80 < 25) {
                // heart
                enemyShoot(e.x, e.y, [angle + currFrame % 80 * PI2ToX(48), angle - currFrame % 80 * PI2ToX(48)], [2], [2.5]);
            }
            else if (((e.type === 5 || e.type === 6 || e.type === 7) && currFrame % 80 === 0) ||
                    ((e.type === 13 || e.type === 14) && currFrame % 100 <= 30 && currFrame % 10 === 0)) {
                // circle && backward circle && turning circle && multi-circle
                for (let i = 0; i < 24; i++) { enemyShoot(e.x, e.y, [angle + i * PI2ToX(24)], [e.type >= 13 ? [4, 5][e.type - 13] : [1, 4, 5][e.type - 5]], [4.5]); }
            }
            else if ((e.type >= 8 && e.type <= 11) && currFrame % 80 === 0) {
                // line && sweep line && tighening line && random cross
                const angles = [[angle], [angle, angle + Math.PI], [angle - Math.PI / 3, angle + Math.PI / 3], [rAngle, rAngle + Math.PI / 2, rAngle + Math.PI, rAngle + Math.PI / 2 * 3]][e.type - 8];
                const types = [[1], [5], [5, 6], [1]][e.type - 8];
                for (let i = 0; i < 15; i++) { enemyShoot(e.x, e.y, angles, types, [5 - i * 0.25]); }
            }
            else if (e.type === 12 && currFrame % 60 === 0) {
                // suround bullet
                for (let i = 0; i < 16; i++) { enemyShoot(e.x + Math.cos(i * Math.PI / 8) * 45, e.y + Math.sin(i * Math.PI / 8) * 45, [angle], [1], [3]); }
            }
            else if (e.type === 15 && currFrame % 90 <= 45 && currFrame % 6 === 0) {
                // random spread
                const angle = Math.random() * 2 * Math.PI;
                enemyShoot(e.x, e.y, [angle, angle, angle], [2, 2, 2], [2.5, 3.5, 4.5]);
            }
            else if (e.type === 16 && currFrame % 100 <= 60 && currFrame % 3 === 0) {
                // machine gun
                enemyShoot(e.x, e.y, [angle + ranAngle(-PI2ToX(24), PI2ToX(24))], [2], [2 + Math.random() * 2.5]);
            }
            else if (e.type === 17 && currFrame % 100 <= 60 && currFrame % 20 === 0) {
                // quick shot gun
                for (let i = 0; i < 8; i++) { enemyShoot(e.x, e.y, [angle + ranAngle(-PI2ToX(10), PI2ToX(10))], [2], [3 + Math.random() * 1.5]); }
            }
            else if (e.type === 18 && currFrame % 75 === 0) {
                // boom
                for (let i = 0; i < 6; i++) { enemyShoot(e.x, e.y, [angle + i * PI2ToX(6)], [7], [2.8]); }
            }
            else if ((e.type === 19 || e.type === 20) && currFrame % 80 === 0) {
                // shotgun with boom
                const angles = (e.type === 20 ? [angle-PI2ToX(12), angle+PI2ToX(12)] : [angle, angle-PI2ToX(24), angle+PI2ToX(24)]);
                enemyShoot(e.x, e.y, angles, [7], [4]);
            }
            else if (e.type === 21 && currFrame % 60 === 0) {
                // line shot besides
                for (let i = 0; i < 15; i++) { enemyShoot(e.x - Math.sin(angle) * 25, e.y + Math.cos(angle) * 25, [angle], [1], [5 - i * 0.25]);
                    enemyShoot(e.x + Math.sin(angle) * 25, e.y - Math.cos(angle) * 25, [angle], [1], [5 - i * 0.25]); }
            }
            else if (e.type === 22 && currFrame % 75 === 0) {
                // arc shoot
                for (let j = 4; j >= 1; j--) { for (let i = -j; i <= j; i++) { enemyShoot(e.x, e.y, [angle + i / j * PI2ToX(18)], [2], [2 + j * 0.8]); } }
            }
            else if ((e.type === 23 || e.type === 24) && currFrame % 110 <= 40) {
                // turning shoot
                enemyShoot(e.x, e.y, [angle + (currFrame % 90) * PI2ToX(20)], [e.type === 23 ? 2 : 5], [4.5]);
            }
            else if (e.type === 25 && currFrame % 70 % 6 === 0 && currFrame % 70 < 30) {
                // homing snipe
                enemyShoot(e.x, e.y, [angle], [8]);
            }
            else if (e.type === 26 && currFrame % 120 === 0) {
                // homing shot gun
                for (let i = 0; i < 7; i++) { enemyShoot(e.x, e.y, [angle + ranAngle(-PI2ToX(4), PI2ToX(4))], [8], [3 + Math.random() * 1.5]); }
            }
            else if (e.type === 114) {
                if (tick < 400) {
                    if (tick % 2 === 0) { enemyShoot(e.x, e.y, [angle + tick * Math.PI / 30], [4], [2.5]); }
                    if (tick % 40 === 0) { for (let i = 0; i < 24; i++) { enemyShoot(e.x, e.y, [angle + i * Math.PI / 12], [tick >= 200 ? 5 : 6], [4.5]); } }
                }
                else if (tick >= 400 && tick < 800) {
                    if (tick % 40 === 0) {
                        for (let i = 0; i < 16; i++) {
                            const bx = e.x + Math.cos(i * Math.PI / 8) * 45;
                            const by = e.y + Math.sin(i * Math.PI / 8) * 45;
                            enemyShoot(bx, by, [getAngleTowardsPlayer(bx, by)], [2], [2.5]);
                        }
                    }
                    if (tick % 60 === 0) {
                        const a1 = Math.PI / 4.5 * Math.random(); const a2 = Math.PI / 4.5 * Math.random();
                        for (let i = 0; i < 15; i++) { enemyShoot(e.x, e.y, [angle, angle + a1, angle - a2], [1], [5 - i * 0.25]); }
                    }
                }
                else if (tick >= 800 && tick < 1200) {
                    if (tick % 3 === 0) { enemyShoot(e.x, e.y, [angle + Math.random() * Math.PI / 6 - Math.PI / 12], [2], [2 + Math.random() * 2.5]); }
                    if (tick % 120 === 0) { for (let i = 0; i < 15; i++) { enemyShoot(e.x, e.y, [rAngle, rAngle + Math.PI / 2, rAngle + Math.PI, rAngle + Math.PI / 2 * 3], [1], [5 - i * 0.25]); } }
                }
                else if (tick >= 1200) {
                    if (tick % 3 === 0) { for (let i = 0; i < 12; i++) { enemyShoot(e.x, e.y, [angle + i * Math.PI / 6], [2, 5, 6][i % 3], [4.5]); }}
                    if (tick % 90 === 0) { for (let i = 0; i < 15; i++) { enemyShoot(e.x, e.y, [angle - Math.PI / 2.5, angle + Math.PI / 2.5], [5, 6], [5 - i * 0.25]); }}
                }
            } else if (e.type === 115) {
                if (tick <= 600) {
                    if (tick % 45 === 0) {
                        const shiftAngle = ranAngle(-PI2ToX(20), PI2ToX(20));
                        for (let j = 0; j < 10; j++) {
                            const fireAngle = angle + PI2ToX(10) * j + shiftAngle;
                            for (let i = 0; i < 20; i++) { enemyShoot(e.x + Math.cos(i * Math.PI / 10) * 50, e.y + Math.sin(i * Math.PI / 10) * 50, [fireAngle], [2], [2.5]); }
                        }
                    }
                }
                if (tick >= 200 && tick <= 800) {
                    if (tick % 48 === 0) {
                        for (let i = 0; i < 16; i++) {
                            const bx = e.x + Math.cos(i * Math.PI / 8) * 50;
                            const by = e.y + Math.sin(i * Math.PI / 8) * 50;
                            enemyShoot(bx, by, [getAngleTowardsPlayer(bx, by)], [3], [8]);
                        }
                    }
                    if (tick % 3 === 0) { for (let i = 0; i < 12; i++) { enemyShoot(e.x, e.y, [i * Math.PI / 6 + Math.sin(tick / 300 * PI2ToX(2))], [2], [2]); }}
                }
                if (tick >= 800 && tick < 1350) {
                    if (tick % 2 === 0) { enemyShoot(e.x, e.y, [angle + tick / 70 * PI2ToX(1) + ranAngle(-PI2ToX(50), PI2ToX(50)), angle - tick / 70 * PI2ToX(1) + ranAngle(-PI2ToX(50), PI2ToX(50))], [2], [2.5]); }
                    if (tick % 120 === 0) { for (let i = 0; i < 15; i++) { enemyShoot(e.x, e.y, [rAngle, rAngle + PI2ToX(2)], [1], [8 - i * 0.25]); } }
                }
                if (tick >= 1000) {
                    if (tick % 12 === 0) {
                        const rx = ranAngle(-40, 40); const ry = ranAngle(-40, 40); const ra = ranAngle(-PI2ToX(6), PI2ToX(6));
                        for (let i = 0; i < 15; i++) { enemyShoot(e.x + rx, e.y + ry, [angle + ra], [1], [7 - i * 0.25]); }
                    }
                }
            }
            else if (e.type === 116) {
                if (tick <= 600 && tick % 10 === 0) {
                    for (let i = 0; i < 30; i++) { enemyShoot(e.x, e.y, [i * PI2ToX(30) + tick / 400 * PI2ToX(6)], [(tick <= 150 || (tick >= 300 && tick <= 450)) ? 5 : 6], [6.5]); }
                }
                if (tick === 700 || tick === 1400) {
                    for (let i = 0; i < 15; i++) { enemyShoot(e.x, e.y, [angle - Math.PI / 3, angle + Math.PI / 3], [rAngle, rAngle + Math.PI / 2, rAngle + Math.PI, rAngle + Math.PI / 2 * 3], [1], [6 - i * 0.25]); }
                }
                if (tick >= 550 && tick <= 950 && tick % 40 === 0) {
                    for (let i = 0; i < 16; i++) {
                        const bx = e.x + Math.cos(i * Math.PI / 8) * 45;
                        const by = e.y + Math.sin(i * Math.PI / 8) * 45;
                        enemyShoot(bx, by, [getAngleTowardsPlayer(bx, by)], [2], [8]);
                    }
                }
                if (tick >= 650 && tick <= 1300 && tick % 50 === 0) {
                    const shiftAngle = ranAngle(-PI2ToX(20), PI2ToX(20));
                    for (let j = 0; j < 10; j++) {
                        const fireAngle = angle + PI2ToX(10) * j + shiftAngle;
                        for (let i = 0; i < 24; i++) { enemyShoot(e.x + Math.cos(i * Math.PI / 12) * 40, e.y + Math.sin(i * Math.PI / 12) * 40, [fireAngle], [6], [5]); }
                    }
                }
                if (tick >= 900 && tick <= 1350 && tick % 50 === 0) {
                    for (let i = 0; i < 8; i++) { enemyShoot(e.x, e.y, [angle + i * PI2ToX(8)], [7], [4.5]); }
                }
                if (tick >= 950 && tick <= 1450 && tick % 70 === 0) {
                    for (let i = 0; i < 15; i++) { enemyShoot(e.x, e.y, [rAngle, rAngle + Math.PI / 2, rAngle + Math.PI, rAngle + Math.PI / 2 * 3], [1], [5 - i * 0.25]); }
                }
                if (tick >= 1400 && tick % 50 < 25) {
                    enemyShoot(e.x, e.y, [angle + currFrame % 50 * PI2ToX(48), angle - currFrame % 50 * PI2ToX(48)], [2], [2.5]);
                }
            }
        }
    }
    enemies = enemies.filter(e => e.hp > 0);

    // Update Bullets
    for (const b of bullets) {
        if (b.converted && enemies.length) {
            // Player converted Bullets
            let minDist = 1e9, target = null;
            for (const e of enemies) {
                let distance = Math.hypot(b.x - e.x, b.y - e.y);
                const enemyBlockX = Math.floor(e.x / TILE_WIDTH / BLOCK_SIZE);
                const enemyBlockY = Math.floor(e.y / TILE_HEIGHT / BLOCK_SIZE);
                if (distance < minDist && playerBlockX === enemyBlockX && playerBlockY === enemyBlockY) {
                    minDist = distance; target = e;
                }
                if (distance <= HIT_RADIUS) {
                    b.lifeTime = 0; e.hp = (e.hp || 1) - 1; score += 25;
                    particles.push({type: 1, x: b.x, y: b.y, velX: (Math.random()-0.5)*4, velY: (Math.random()-0.5)*4, lifeTime: 0.5});
                    playSound('hit');
                }
            }
            if (target) {
                let dx = target.x - b.x, dy = target.y - b.y;
                let len = Math.hypot(dx, dy) || 1;
                let speed = Math.hypot(b.velX, b.velY);
                let tx = dx / len * speed, ty = dy / len * speed;
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
                let ns = Math.min(speed + 0.08, 10);
                b.velX = b.velX / vlen * ns;
                b.velY = b.velY / vlen * ns;
            }
        }
        if (!b.converted) {
            // Enemy Bullets
            let dx = b.x - playerX, dy = b.y - playerY;
            if (Math.hypot(dx, dy) <= HIT_RADIUS && invTime <= 0 && hitPoints > 0){
                b.lifeTime = 0;
                playSound('alarm');
                for (let i = 0; i < 6; i++) {
                    particles.push({type: 3, x: b.x, y: b.y, velX: (Math.random()-0.5)*4, velY: (Math.random()-0.5)*4, lifeTime: 0.5});
                }
                invTime = 0.65;
                if (shieldPoints >= 1) {
                    shieldPoints--;
                    texts.push({text: "Shield Blocked (" + Math.round(shieldPoints, 1) + " Left)", x: b.x, y: b.y - 20, color: 'rgba(209, 106, 106, 1)', lifeTime: 1});
                }
                else { hitPoints--;
                    if (hitPoints > 1) { texts.push({text: hitPoints + " Lifes Remaining", x: b.x, y: b.y - 20, color: 'rgba(255, 92, 92, 1)', lifeTime: 1}); }
                    else {texts.push({text: "Caution: Last Life!", x: b.x, y: b.y - 20, color: 'rgba(255, 92, 92, 1)', lifeTime: 1});}
                    if (hitPoints <= 0) { stage = -Math.abs(stage); }
                    shieldPoints = maxShieldPoints;
                }
            }
            const len = Math.hypot(b.velX, b.velY) || 1;
            if (b.type === 2) {
                // Speed Up
                b.velX = b.velX / len * Math.min(len + 0.06, 5.8);
                b.velY = b.velY / len * Math.min(len + 0.06, 5.8);
            }
            else if (b.type === 3) {
                // Slow Down
                b.velX = b.velX / len * Math.max(len - 0.06, 2);
                b.velY = b.velY / len * Math.max(len - 0.06, 2);
            }
            else if (b.type === 4) {
                // Turn Around
                if (!b.velBX || !b.velBY) {
                    b.velBX = -b.velX;
                    b.velBY = -b.velY;
                }
                b.velX = b.velX * 0.992 + b.velBX * 0.008;
                b.velY = b.velY * 0.992 + b.velBY * 0.008;
            }
            else if (b.type === 5 || b.type === 6) {
                // Turning Bullets
                b._angle = b._angle ?? Math.atan2(b.velY, b.velX);
                b._angle += (b.type === 5 ? 0.012 : -0.012);
                b.velX = Math.cos(b._angle) * len;
                b.velY = Math.sin(b._angle) * len;
            }
            else if (b.type === 7) {
                // Split Bullets
                if (!b._spawned && len > 2) {
                    let newLen = Math.max(len - 0.06, 2);
                    b.velX = b.velX / len * newLen;
                    b.velY = b.velY / len * newLen;
                    if (newLen <= 2) {
                        b._spawned = true;
                        for (let i = 0; i < 12; i++) { enemyShoot(b.x, b.y, [i * PI2ToX(12)], [1], [4.5]); }
                        b.lifeTime = 0;
                    }
                }
            }
            else if (b.type === 8) {
                // Homing Bullets
                let targetAngle = getAngleTowardsPlayer(b.x, b.y);
                b.velX += Math.cos(targetAngle) * 0.12;
                b.velY += Math.sin(targetAngle) * 0.12;
                let vlen = Math.hypot(b.velX, b.velY) || 1;
                b.velX = b.velX / vlen * Math.min(vlen + 0.1, 5.8);
                b.velY = b.velY / vlen * Math.min(vlen + 0.1, 5.8);
            }
        }
        // Bullets Move
        b.x += b.velX;
        b.y += b.velY;
        if (getCollision(b.x, b.y)) {
            b.lifeTime = 0;
            particles.push({type: 1, x: b.x, y: b.y, velX: (Math.random()-0.5)*4, velY: (Math.random()-0.5)*4, lifeTime: 0.5});
        }
        b.lifeTime -= 1 / 60;
    }
    bullets = bullets.filter(b => b.lifeTime > 0);

    // Update Texts & Particels
    texts = texts.filter(t => t.lifeTime > 0);
    particles = particles.filter(p => p.lifeTime > 0);

    // Update Menu Actions
    if (keyState['enter'] && stage % 2 === 0 && stage < 6 && !practicing) {
        stage++; playSound('tip'); restartMap(); shieldPoints = 3;
        if (stage === 1) { hitPoints = 3; score = 0; }
        else if (stage === 3) { hitPoints += 1; }
        else if (stage === 5) { hitPoints += 2; }
        titleShowTime = titleShowTimeMax;
        saveData();
    }
    if (keyState['r'] && stage === 100) {
        practicing = false; continued = false; stage = 0; restartMap();
    }
    if ((keyState['1'] || keyState['2'] || keyState['3']) && stage === 0 && !practicing) {
        if ((keyState['3'] && unlockProgress < 3) || (keyState['1'] && unlockProgress < 1) || (keyState['2'] && unlockProgress < 2)) { return; }
        practicing = true; playSound('tip'); stage = keyState['1'] ? 1 : keyState['2'] ? 3 : 5; restartMap();
        hitPoints = 3; shieldPoints = 3;
        enemies = [enemies[enemies.length - 1]]; playerX = enemies[0].x - 448; playerY = enemies[0].y - 448;
    }
    if (stage > 0 && enemies.length === 0 && stage % 2 === 1) {
        if (!practicing) { stage++; playSound('tip'); bullets = []; saveData(); }
        else { stage = 100; }
    }
    if (stage < -1e-9 && keyState['r']) {
        saveData();
        stage = 0; playSound('tip'); restartMap(); continued = false; practicing = false; score = 0;
    }
    if (stage < -1e-9 && keyState['enter']) {
        saveData();
        stage = Math.abs(stage); playSound('tip'); continued = true;
        hitPoints = 3; shieldPoints = 3; invTime = 1; catPower = catPowerMax; score = Math.floor(score * 0.5);
    }

    // High Grade
    if (!practicing) {
        highScore = Math.max(highScore, score);
        unlockProgress = Math.max(unlockProgress, Math.floor(stage / 2));
    }
}

function getAngleTowardsPlayer(x, y) {
    let dx = playerX - x; let dy = playerY - y;
    return Math.atan2(dy, dx);
}

function getCollision(targetX, targetY) {
    playerBlockX = Math.floor(playerX / TILE_WIDTH / BLOCK_SIZE);
    playerBlockY = Math.floor(playerY / TILE_HEIGHT / BLOCK_SIZE);
    let px = Math.floor(targetX / TILE_WIDTH);
    let py = Math.floor(targetY / TILE_HEIGHT);
    return (map[py] && map[py][px] === "brick1") || (playerBlockX + playerBlockY > currLevel);
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

function doCatDash(dx, dy) {
    if (dx === 0 && dy === 0) { return; }
    dashTime = dashTimeMax;
    let len = Math.hypot(dx, dy) || 1;
    dashX = dx / len * dashSpeed;
    dashY = dy / len * dashSpeed;
    catPower -= dashPowerCost;
    texts.push({ text: "Meow!", x: playerX, y: playerY, lifeTime: 1, color: BRIGHT_BLUE });
    invTime = 0;
}

function getRadius() {
    return convertRadius + Math.floor(score / upgradeScore) * upgradeRadius;
}

// Display
function draw() {
    // Pre Sets
    resizeCanvas();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.textAlign = 'center';
    // Map
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
    // Camera Move
    const targetX = playerX - canvas.width / 2;
    const targetY = playerY - canvas.height / 2;
    offsetX = lerp(offsetX, targetX, 0.1);
    offsetY = lerp(offsetY, targetY, 0.1);
    // Player
    if (hitPoints > 0) {
        // Convert Area
        ctx.save();
        ctx.fillStyle = BRIGHT_BLUE;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(playerX - offsetX, playerY - offsetY, getRadius(), 0, Math.PI * 2);
        if (playerCatStatus || invTime > 0) {
            ctx.fill();
        } else {
            ctx.strokeStyle = BRIGHT_BLUE;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.restore();
        // Health Bar
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
        // Cat Power Bar
        ctx.save();
        const barW = 66, barH = 7;
        const barX = playerX - offsetX - barW/2;
        const barY = playerY - offsetY + 15;
        ctx.shadowColor = BRIGHT_BLUE; ctx.strokeStyle = BRIGHT_BLUE; ctx.fillStyle = BLUE; ctx.shadowBlur = 32;
        ctx.fillRect(barX, barY, barW * Math.min(catPower, catPowerMax) / catPowerMax, barH);
        ctx.lineWidth = 1.5;
        for (let i = 1; i <= 2; i++) {
            let tx = barX + barW * i / 3;
            ctx.beginPath();
            ctx.moveTo(tx, barY - 5);
            ctx.lineTo(tx, barY + barH + 5);
            ctx.stroke();
        }
        ctx.restore();
        // Player itself
        const width = playerCatStatus ? CAT_WIDTH : PLAYER_WIDTH;
        const height = playerCatStatus ? CAT_HEIGHT : PLAYER_HEIGHT;
        let drawX = playerX - width / 2 - offsetX;
        let drawY = playerY - height - offsetY;
        if (playerCatStatus) { drawY -= Math.sin(Math.PI * (dashTimeMax - dashTime) / dashTimeMax) * 20; }
        let flip = mouseDownX + offsetX < playerX;
        ctx.save();
        ctx.shadowColor = BRIGHT_BLUE;
        ctx.shadowBlur = 64;
        if (flip) {
            ctx.translate(drawX + width / 2, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(imgDict[playerCatStatus ? 'cat' : 'player'], -width / 2, drawY, width, height);
        } else {
            ctx.drawImage(imgDict[playerCatStatus ? 'cat' : 'player'], drawX, drawY, width, height);
        }
        ctx.restore();
        if (mouseLeftDown && !playerCatStatus) {
            // Hit Point
            ctx.save();
            ctx.fillStyle = RED;
            ctx.shadowColor = RED;
            ctx.shadowBlur = 32;
            ctx.beginPath();
            ctx.arc(playerX - offsetX, playerY + BULLET_OFFSET_Y - offsetY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
    // Enemy
    for (const e of enemies) {
        let flip = e.x >= playerX;
        let drawX = e.x - PLAYER_WIDTH / 2 - offsetX;
        let drawY = e.y - PLAYER_HEIGHT - offsetY;
        ctx.save();
        ctx.shadowColor = RED;
        ctx.shadowBlur = 64;
        if (flip) {
            ctx.translate(drawX + PLAYER_WIDTH / 2, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(imgDict['enemy'], -PLAYER_WIDTH / 2, drawY, PLAYER_WIDTH, PLAYER_HEIGHT);
        } else {
            ctx.drawImage(imgDict['enemy'], drawX, drawY, PLAYER_WIDTH, PLAYER_HEIGHT);
        }
        ctx.restore();
    }
    // Bullet
    for (const b of bullets) {
        const x = b.x - offsetX;
        const y = b.y - offsetY + BULLET_OFFSET_Y;
        const angle = Math.atan2(b.velY, b.velX);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.drawImage(b.converted ? imgDict['bulletc'] : (b.type >= 5 ? imgDict['bullet1'] : imgDict['bullet2']), -BULLET_SIZE/2, -BULLET_SIZE/2, BULLET_SIZE, BULLET_SIZE);
        ctx.restore();
    }
    // Texts
    ctx.font = `16px ${FONTS}`;
    for (const t of texts) {
        t.lifeTime -= 1 / 60;
        ctx.fillStyle = t.color || GREY;
        ctx.fillText(t.text, t.x - offsetX, t.y - offsetY - Math.sin((1 - t.lifeTime) * Math.PI / 2) * 12);
    }
    // Particles
    for (const p of particles) {
        p.x += p.velX; p.y += p.velY; p.lifeTime -= 1 / 60;
        if (p.type === 1) {
            ctx.save();
            ctx.fillStyle = GREY;
            ctx.beginPath();
            ctx.arc(p.x - offsetX, p.y - offsetY, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (p.type === 2 || p.type === 3 || p.type === 4) {
            ctx.save();
            ctx.translate(p.x - offsetX, p.y - offsetY);
            let r = 22;
            let angle = (p.lifeTime || 0) * 4 * Math.PI;
            ctx.rotate(angle);
            ctx.strokeStyle = p.type === 2 ? BRIGHT_BLUE : p.type === 3 ? RED : GREY;
            ctx.lineWidth = 2;
            ctx.strokeRect(-r/2, -r/2, r, r);
            ctx.restore();
        }
    }
    // Map Hint
    if (stage === 1) {
        drawText("Use [W][A][S][D] to Move", 512 - offsetX, 392 - offsetY);
        drawText("[Mouse Right Click] Or [Space] to turn into a Black Cat and dash", 512 - offsetX, 422 - offsetY);
        let tipX = 512 + (moveFlags[0] ? 1024 : 0); let tipY = 512 + (moveFlags[0] ? 0 : 1024);
        drawText("When transformed into a cat, a field of doom forms around you", tipX - offsetX, tipY - 120 - offsetY);
        drawText("Enemy bullets affected by doom will turn to attack themselves", tipX - offsetX, tipY - 90 - offsetY);
        drawText("Try defeat the guard here", tipX - offsetX, tipY - 60 - offsetY);
        tipX += moveFlags[1] ? 1024 : 0; tipY += moveFlags[1] ? 0 : 1024;
        drawText("Be careful! You will lose shield/hit-points when being hit.", tipX - offsetX, tipY - 30 - offsetY);
        drawText("When hit-points drop to 0, Rin will fail to escape.", tipX - offsetX, tipY - offsetY);
        tipX += moveFlags[2] ? 1024 : 0; tipY += moveFlags[2] ? 0 : 1024;
        drawText("Lost shield points can be recovered by converting bullets.", tipX - offsetX, tipY - 30 - offsetY);
        drawText("When shield is insufficient to block a bullet, hit-points lost.", tipX - offsetX, tipY - offsetY);
    }
    if (stage === 3) {
        drawText("Each 100000 points will make convert range larger.", 512 - offsetX, 392 - offsetY);
        drawText("When you die and continue, you will lose score.", 512 - offsetX, 422 - offsetY);
    }
    // Progress Bar OR Boss Bar
    if (enemies.length === 1 && enemies[0].type >= 114) {
        const currRatio = enemies.length ? enemies[0].hp / (enemies[0].maxHp || 1) : 0;
        lastRatio = lerp(lastRatio, currRatio, 0.05);
        drawText(['Cauchy\'s Clone v.1.17', 'Cauchy\'s Clone v2.0', 'Cauchy The Cat Witch'][enemies[0].type - 114], canvas.width / 4 - 100, 25, RED, '18px');
        ctx.save();
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = RED;
        ctx.fillRect(canvas.width / 4, 15, canvas.width / 2 * lastRatio, 10);
        ctx.restore();
        drawText(Math.round(lastRatio * 100, 1) + "%", canvas.width / 4 + lastRatio * canvas.width / 2 + 25, 25, RED, '18px');
    }
    else {
        ctx.save();
        ctx.fillStyle = BLUE; ctx.strokeStyle = BRIGHT_BLUE; ctx.shadowColor = BRIGHT_BLUE; ctx.shadowBlur = 16;
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
        drawText(Math.round(lastProgressDraw * 100, 1) + "%", canvas.width / 4 + lastProgressDraw * canvas.width / 2 + 25, 25, BLUE, '18px');
        ctx.restore();
    }
    // Moving Hint
    if (!practicing) {
        if (playerBlockX + playerBlockY === currLevel) { drawText("Eliminate Enemies in this room", canvas.width / 2, canvas.height - 60, BLUE); }
        else { drawText("Reach the next room to escape", canvas.width / 2, canvas.height - 60, BLUE); }
    }
    else {
        drawText("Practice Mode", canvas.width / 2, canvas.height - 60, BLUE);
    }
    drawText("Score: " + String(score).padStart(6, '0'), canvas.width / 2, 45, BLUE);
    // Title
    if (titleShowTime > 0) {
        ctx.globalAlpha = Math.sin(titleShowTime / titleShowTimeMax * Math.PI);
        drawText("Cauchy\'s Basement", canvas.width / 2, canvas.height / 2 - 40, BRIGHT_BLUE, '62px');
        drawText("Floor " + (Math.floor(stage / 2) + 1) + "/3", canvas.width / 2 + 60, canvas.height / 2, BRIGHT_BLUE, '42px');
        titleShowTime -= 1 / 60;
        ctx.globalAlpha = 1;
    }
    // Draw Blur Mask
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.filter = `blur(${Math.abs(maskAlpha) * 12}px)`;
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';
    ctx.restore();
    if (stage % 2 == 1) { maskAlpha = lerp(maskAlpha, 0, 0.1); }
    else { maskAlpha = lerp(maskAlpha, 1, 0.1); }
    // Menu Drawing
    if (stage === 0) {
        drawText("Rin the Cat Sorceresses", canvas.width / 2, canvas.height / 2, GREY, '62px');
        drawText("Press [Enter] to Start", canvas.width / 2, canvas.height / 2 + 120, GREY, '24px');
        let practiceStr = "Defeat Bosses (Accept Continuing) to Unlock Practice Mode";
        if (unlockProgress > 0) {
            practiceStr = "Press "; for (let i = 1; i <= Math.min(unlockProgress, 3); i++) { practiceStr += "[" + i + "] "; }
            practiceStr += " to Practice Boss fights";
        }
        drawText(practiceStr, canvas.width / 2, canvas.height / 2 + 150, GREY, '24px');
        drawText("High-Score: " + highScore, canvas.width / 2, canvas.height - 80, GREY, '24px');
        if (clearStatus === 2) { drawText("True Ending Achieved!", canvas.width / 2, canvas.height - 50, BRIGHT_BLUE, '24px'); }
        else if (clearStatus === 1) { drawText("Normal Ending Achieved!", canvas.width / 2, canvas.height - 50, GREY, '24px'); }
    }
    if (stage >= 2 && stage <= 4 && stage % 2 === 0) {
        bullets = [];
        drawText("Stage " + Math.floor(stage / 2) + "/3 Clear", canvas.width / 2, canvas.height / 2 - 120, GREY, '42px');
        drawText("Press [Enter] to Upstairs", canvas.width / 2, canvas.height / 2 + 120, GREY, '24px');
    }
    if (stage === 6) {
        bullets = [];
        drawText("Stage All Clear!", canvas.width / 2, canvas.height / 2 - 120, GREY, '42px');
        drawText("The Cat Sorceresses Rin Finally Defeat the Evil Cat Witch and Escape!", canvas.width / 2, canvas.height / 2 - 80, GREY, '24px');
        drawText("--- With her Black Cat Power", canvas.width / 2 + 30, canvas.height / 2 - 40, GREY, '24px');
        if (continued) {
            drawText("However, Rin accidently let Cauchy escape", canvas.width / 2, canvas.height / 2 + 40, GREY, '24px');
            drawText("Cauchy, the Evil Cat Witch, is still at large...", canvas.width / 2, canvas.height / 2 + 80, GREY, '24px');
            drawText("[Try beat the game without continuing!]", canvas.width / 2, canvas.height / 2 + 120, GREY, '24px');
            if (clearStatus < 1) { clearStatus = 1; saveData(); }
        }
        else {
            drawText("Congratulations!", canvas.width / 2, canvas.height / 2 + 40, GREY, '24px');
            drawText("Thanks to your skill, Cauchy is sealed away for good.", canvas.width / 2, canvas.height / 2 + 120, GREY, '24px');
            drawText("You Achieved the True Ending! Thanks for Playing!", canvas.width / 2, canvas.height / 2 + 160, BRIGHT_BLUE, '24px');
            if (clearStatus < 2) { clearStatus = 2; saveData(); }
        }
        drawText("Your Final Score: " + score, canvas.width / 2, canvas.height - 80, continued ? GREY : BRIGHT_BLUE, '32px');
    }
    if (stage === 100) {
        bullets = [];
        drawText("Practice Mode Finished!", canvas.width / 2, canvas.height / 2, GREY, '62px');
        drawText("Press [R] to Return to Menu", canvas.width / 2, canvas.height / 2 + 120, GREY, '24px');
    }
    if (stage < -1e-9) {
        drawText("Game Over", canvas.width / 2, canvas.height / 2, GREY, '62px');
        drawText("Press [Enter] to Continue", canvas.width / 2, canvas.height / 2 + 120, GREY, '24px');
        drawText("Press [R] to Restart", canvas.width / 2, canvas.height / 2 + 150, GREY, '24px');
        drawText("Continuing will affect the final ending", canvas.width / 2, canvas.height / 2 + 180, GREY, '18px');
    }
}

function resizeCanvas() {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
}

function drawText(content, x, y, color = GREY, size = '18px') {
    ctx.save();
    ctx.font = `${size} ${FONTS}`;
    ctx.fillStyle = color;
    ctx.fillText(content, x, y);
    ctx.restore();
}

// Audio
let playColdDown = 0;
const audioCtx = window.AudioContext ? new window.AudioContext() : (window.webkitAudioContext ? new window.webkitAudioContext() : null);
function playSound(name) {
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

// Utils
function PI2ToX(x = 1) {
    return 2 * Math.PI / x;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function ranAngle(lower, upper) {
    return Math.random() * (upper - lower) + lower;
}

function ranInt(lower, upper) {
    return Math.floor(Math.random() * (upper - lower + 1)) + lower;
}

function getData() {
    try {
        highScore = parseInt(localStorage.getItem('highScore')) || 0;
        unlockProgress = parseInt(localStorage.getItem('unlockProgress')) || 0;
        clearStatus = parseInt(localStorage.getItem('clearStatus')) || 0;
    }
    catch (e) {}
}

function saveData() {
    if (!practicing) {
        highScore = Math.max(highScore, score);
        unlockProgress = Math.max(unlockProgress, Math.floor(stage / 2));
    }
    try {
        localStorage.setItem('highScore', highScore);
        localStorage.setItem('unlockProgress', unlockProgress);
        localStorage.setItem('clearStatus', clearStatus);
    }
    catch (e) {}
}

// Game Loop
getData();
function loop() {
    update(); draw();
}
setInterval(loop, 1000 / 60);