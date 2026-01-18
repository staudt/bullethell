// =============================================================================
// BULLET HELL - Main Game File
// =============================================================================

// -----------------------------------------------------------------------------
// CANVAS SETUP
// -----------------------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Responsive resize
function resizeCanvas() {
    CONFIG.canvas.width = window.innerWidth;
    CONFIG.canvas.height = window.innerHeight;
    canvas.width = CONFIG.canvas.width;
    canvas.height = CONFIG.canvas.height;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// -----------------------------------------------------------------------------
// GAME STATE
// -----------------------------------------------------------------------------
let gameState = 'playing'; // 'playing', 'dead'
let lastTime = 0;
let cameraX = 0;

// Screen shake
let shakeAmount = 0;
let shakeX = 0;
let shakeY = 0;

// Hit stop
let hitStopTimer = 0;

// Spawn timer
let enemySpawnTimer = 0;

// -----------------------------------------------------------------------------
// INPUT STATE
// -----------------------------------------------------------------------------
const keys = {};
let mouseDown = false;
let firePressed = false;
let fireWasPressed = false;
let fireHoldTime = 0;

// Double-tap dash tracking
const lastKeyPress = { w: 0, a: 0, s: 0, d: 0 };

// -----------------------------------------------------------------------------
// PLAYER
// -----------------------------------------------------------------------------
const player = {
    x: 150,
    y: CONFIG.canvas.height / 2,
    vx: 0,
    vy: 0,
    knockbackVx: 0,  // Separate knockback velocity that decays
    knockbackVy: 0,
    width: CONFIG.player.size,
    height: CONFIG.player.size,

    // Combat
    charge: 0,
    machineGunCooldown: 0,

    // Dash
    isDashing: false,
    dashTimer: 0,
    dashDirX: 1,
    dashDirY: 0,
    dashCharge: 0, // Charge at time of dash (for damage calc)
    invulnTimer: 0,

    // Health
    shield: CONFIG.health.shieldMax,
    life: CONFIG.health.lifeMax,
    shieldRegenTimer: 0,

    // State
    active: true
};

// -----------------------------------------------------------------------------
// OBJECT POOLS
// -----------------------------------------------------------------------------
const playerBullets = [];
const enemyBullets = [];
const enemies = [];
const particles = [];

// -----------------------------------------------------------------------------
// INPUT HANDLERS
// -----------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (!keys[key]) {
        // Check for double-tap dash
        const now = performance.now() / 1000;
        if (lastKeyPress[key] && now - lastKeyPress[key] < CONFIG.dash.doubleTapWindow) {
            triggerDash(key);
            lastKeyPress[key] = 0;
        } else {
            lastKeyPress[key] = now;
        }
    }

    keys[key] = true;

    // Debug toggles
    if (key === 'i') CONFIG.debug.invincible = !CONFIG.debug.invincible;
    if (key === 'h') CONFIG.debug.showHitboxes = !CONFIG.debug.showHitboxes;
    if (key === 'n') CONFIG.debug.noEnemies = !CONFIG.debug.noEnemies;

    // Restart
    if (key === 'r' && gameState === 'dead') {
        restartGame();
    }

    // Allow browser shortcuts (Ctrl/Cmd + key, F5, etc.)
    if (!e.ctrlKey && !e.metaKey && !e.key.startsWith('F')) {
        e.preventDefault();
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

window.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouseDown = true;
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
});

// Prevent context menu
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// -----------------------------------------------------------------------------
// DASH
// -----------------------------------------------------------------------------
function triggerDash(key) {
    if (player.isDashing || !player.active) return;

    // Determine dash direction
    let dx = 1, dy = 0;
    if (key === 'w') { dx = 0.5; dy = -0.866; }
    else if (key === 's') { dx = 0.5; dy = 0.866; }
    else if (key === 'a') { dx = -0.5; dy = 0; }
    else if (key === 'd') { dx = 1; dy = 0; }

    // Normalize
    const len = Math.sqrt(dx * dx + dy * dy);
    player.dashDirX = dx / len;
    player.dashDirY = dy / len;

    // Start dash
    player.isDashing = true;
    player.dashTimer = CONFIG.dash.duration;
    player.dashCharge = player.charge;
    player.invulnTimer = CONFIG.dash.invulnTime;

    // Consume charge
    if (!CONFIG.debug.infiniteCharge) {
        player.charge = 0;
    }

    // Screen shake
    addScreenShake(8 + player.dashCharge * 12);

    // Particles
    spawnDashParticles();
}

// -----------------------------------------------------------------------------
// FIRING
// -----------------------------------------------------------------------------
function fireMachineGun(dt) {
    player.machineGunCooldown -= dt;
    if (player.machineGunCooldown <= 0) {
        player.machineGunCooldown = CONFIG.machineGun.fireRate;

        // Random spread
        const angle = (Math.random() - 0.5) * CONFIG.machineGun.spread;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        spawnPlayerBullet(
            player.x + player.width,
            player.y + player.height / 2,
            CONFIG.machineGun.bulletSpeed * cos,
            CONFIG.machineGun.bulletSpeed * sin,
            CONFIG.machineGun.damage,
            'machinegun'
        );
    }
}

function fireShotgun() {
    const chargePercent = player.charge / CONFIG.charge.max;
    const pelletCount = Math.floor(CONFIG.shotgun.pelletsMin + (CONFIG.shotgun.pelletsMax - CONFIG.shotgun.pelletsMin) * chargePercent);
    const damage = CONFIG.shotgun.damageMin + (CONFIG.shotgun.damageMax - CONFIG.shotgun.damageMin) * chargePercent;

    for (let i = 0; i < pelletCount; i++) {
        const angle = (Math.random() - 0.5) * CONFIG.shotgun.spread * (1 + chargePercent);
        const speed = CONFIG.shotgun.bulletSpeed * (0.8 + Math.random() * 0.4);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        spawnPlayerBullet(
            player.x + player.width,
            player.y + player.height / 2,
            speed * cos,
            speed * sin,
            damage,
            'shotgun'
        );
    }

    // Screen shake scales with charge
    addScreenShake(5 + chargePercent * 15);

    // Consume charge
    if (!CONFIG.debug.infiniteCharge) {
        player.charge = 0;
    }

    // Particles
    spawnShotgunParticles();
}

function spawnPlayerBullet(x, y, vx, vy, damage, type) {
    playerBullets.push({
        x, y, vx, vy,
        spawnX: x,  // Track spawn position for range limit
        width: type === 'shotgun' ? 8 : 6,
        height: type === 'shotgun' ? 8 : 4,
        damage,
        type,
        active: true
    });
}

// -----------------------------------------------------------------------------
// ENEMIES
// -----------------------------------------------------------------------------
function spawnEnemy() {
    const enemy = {
        x: cameraX + CONFIG.canvas.width + 50,
        y: Math.random() * (CONFIG.canvas.height - 60) + 30,
        vx: -80 - Math.random() * 40,
        vy: (Math.random() - 0.5) * 60,
        width: 30,
        height: 30,
        health: 40,
        maxHealth: 40,
        mass: 1.0,  // Mass affects knockback resistance (higher = less knockback)
        fireTimer: Math.random() * CONFIG.enemy.fireRate,
        active: true,
        type: 'drifter'
    };
    enemies.push(enemy);
}

function updateEnemy(enemy, dt) {
    if (!enemy.active) return;

    // Move toward player (drift)
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
        enemy.vy += (dy / dist) * 100 * dt;
    }

    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;

    // Clamp Y
    enemy.y = Math.max(enemy.height / 2, Math.min(CONFIG.canvas.height - enemy.height / 2, enemy.y));

    // Fire at player
    enemy.fireTimer -= dt;
    if (enemy.fireTimer <= 0) {
        enemy.fireTimer = CONFIG.enemy.fireRate + Math.random() * 0.5;
        fireEnemyBullet(enemy);
    }

    // Remove if off screen left
    if (enemy.x < cameraX - 100) {
        enemy.active = false;
    }
}

function fireEnemyBullet(enemy) {
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const spread = (Math.random() - 0.5) * 0.3;

    enemyBullets.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle + spread) * CONFIG.enemy.bulletSpeed,
        vy: Math.sin(angle + spread) * CONFIG.enemy.bulletSpeed,
        width: 10,
        height: 10,
        damage: 15,
        active: true
    });
}

function damageEnemy(enemy, damage, type) {
    enemy.health -= damage;

    // Lifesteal
    let lifestealPercent = CONFIG.lifesteal.machineGun;
    if (type === 'shotgun') lifestealPercent = CONFIG.lifesteal.shotgun;
    if (type === 'dash') lifestealPercent = CONFIG.lifesteal.dash;

    const healAmount = damage * lifestealPercent;
    healPlayer(healAmount);

    // Knockback based on damage type and enemy mass
    let knockbackForce = CONFIG.knockback.machineGun;
    if (type === 'shotgun') knockbackForce = CONFIG.knockback.shotgun;
    if (type === 'dash') knockbackForce = CONFIG.knockback.dash;

    // Scale knockback by damage dealt and inverse of mass
    const knockbackMultiplier = (damage / 10) / enemy.mass;
    enemy.vx += knockbackForce * knockbackMultiplier;

    // Add slight vertical knockback away from player
    const dy = enemy.y - player.y;
    if (dy !== 0) {
        enemy.vy += (dy > 0 ? 1 : -1) * knockbackForce * knockbackMultiplier * 0.3;
    }

    // Spawn hit particles
    spawnHitParticles(enemy.x, enemy.y, type);

    // Hit stop on big damage
    if (damage >= 30) {
        hitStopTimer = CONFIG.effects.hitStopDuration;
    }

    if (enemy.health <= 0) {
        enemy.active = false;
        spawnDeathParticles(enemy.x, enemy.y);
        addScreenShake(6);
    }
}

// -----------------------------------------------------------------------------
// HEALTH
// -----------------------------------------------------------------------------
function damagePlayer(damage, sourceX, sourceY) {
    if (CONFIG.debug.invincible || player.invulnTimer > 0) return;

    player.shieldRegenTimer = CONFIG.health.shieldRegenDelay;

    if (player.shield > 0) {
        player.shield -= damage;
        if (player.shield < 0) {
            player.life += player.shield; // Shield went negative, apply to life
            player.shield = 0;
        }
    } else {
        player.life -= damage;
    }

    // Knockback away from damage source
    if (sourceX !== undefined && sourceY !== undefined) {
        const dx = player.x - sourceX;
        const dy = player.y - sourceY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const knockback = CONFIG.knockback.playerHit * (damage / 15);
        player.knockbackVx += (dx / dist) * knockback;
        player.knockbackVy += (dy / dist) * knockback;
    } else {
        // Default knockback (push left)
        player.knockbackVx -= CONFIG.knockback.playerHit;
    }

    addScreenShake(damage * 0.8);
    spawnHitParticles(player.x, player.y, 'player');

    if (player.life <= 0) {
        player.life = 0;
        player.active = false;
        gameState = 'dead';
        spawnDeathParticles(player.x, player.y);
        addScreenShake(20);
    }
}

function healPlayer(amount) {
    // Heal life first, then shield
    if (player.life < CONFIG.health.lifeMax) {
        player.life = Math.min(CONFIG.health.lifeMax, player.life + amount);
    } else {
        player.shield = Math.min(CONFIG.health.shieldMax, player.shield + amount);
    }
}

// -----------------------------------------------------------------------------
// PARTICLES
// -----------------------------------------------------------------------------
function spawnParticle(x, y, vx, vy, color, size, lifetime) {
    particles.push({
        x, y, vx, vy,
        color,
        size,
        lifetime,
        maxLifetime: lifetime,
        active: true
    });
}

function spawnHitParticles(x, y, type) {
    const count = type === 'shotgun' || type === 'dash' ? 12 : 6;
    const color = type === 'player' ? '#ff4444' : '#ffff44';

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 100 + Math.random() * 200;
        spawnParticle(
            x, y,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            color,
            3 + Math.random() * 4,
            0.2 + Math.random() * 0.2
        );
    }
}

function spawnDeathParticles(x, y) {
    for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 150 + Math.random() * 250;
        spawnParticle(
            x, y,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            '#ff8844',
            5 + Math.random() * 6,
            0.3 + Math.random() * 0.3
        );
    }
}

function spawnDashParticles() {
    for (let i = 0; i < 10; i++) {
        spawnParticle(
            player.x, player.y + (Math.random() - 0.5) * player.height,
            -200 - Math.random() * 100,
            (Math.random() - 0.5) * 100,
            '#44aaff',
            4 + Math.random() * 4,
            0.15 + Math.random() * 0.1
        );
    }
}

function spawnShotgunParticles() {
    for (let i = 0; i < 8; i++) {
        spawnParticle(
            player.x + player.width, player.y + player.height / 2,
            200 + Math.random() * 100,
            (Math.random() - 0.5) * 150,
            '#ffaa44',
            3 + Math.random() * 3,
            0.1 + Math.random() * 0.1
        );
    }
}

// -----------------------------------------------------------------------------
// SCREEN SHAKE
// -----------------------------------------------------------------------------
function addScreenShake(amount) {
    shakeAmount = Math.max(shakeAmount, amount);
}

function updateScreenShake() {
    if (shakeAmount > 0.5) {
        shakeX = (Math.random() - 0.5) * shakeAmount * 2;
        shakeY = (Math.random() - 0.5) * shakeAmount * 2;
        shakeAmount *= CONFIG.effects.screenShakeDecay;
    } else {
        shakeX = 0;
        shakeY = 0;
        shakeAmount = 0;
    }
}

// -----------------------------------------------------------------------------
// COLLISION
// -----------------------------------------------------------------------------
function boxCollision(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

// Get player hitbox (expands when shield is active)
function getPlayerHitbox() {
    const shieldPercent = player.shield / CONFIG.health.shieldMax;
    const shieldPadding = shieldPercent > 0 ? (2 + shieldPercent * 4) : 0;

    return {
        x: player.x - player.width / 2 - shieldPadding,
        y: player.y - player.height / 2 - shieldPadding,
        width: player.width + shieldPadding * 2,
        height: player.height + shieldPadding * 2
    };
}

// Get enemy hitbox (centered coordinates to box)
function getEnemyHitbox(enemy) {
    return {
        x: enemy.x - enemy.width / 2,
        y: enemy.y - enemy.height / 2,
        width: enemy.width,
        height: enemy.height
    };
}

function checkCollisions() {
    const playerHitbox = getPlayerHitbox();

    // Player bullets vs enemies
    for (const bullet of playerBullets) {
        if (!bullet.active) continue;

        for (const enemy of enemies) {
            if (!enemy.active) continue;

            const enemyHitbox = getEnemyHitbox(enemy);
            if (boxCollision(bullet, enemyHitbox)) {
                bullet.active = false;
                damageEnemy(enemy, bullet.damage, bullet.type);
                break;
            }
        }
    }

    // Enemy bullets vs player
    if (player.active) {
        for (const bullet of enemyBullets) {
            if (!bullet.active) continue;

            if (boxCollision(bullet, playerHitbox)) {
                bullet.active = false;
                damagePlayer(bullet.damage, bullet.x, bullet.y);
            }
        }

        // Dash collision vs enemies
        if (player.isDashing) {
            for (const enemy of enemies) {
                if (!enemy.active) continue;

                const enemyHitbox = getEnemyHitbox(enemy);
                if (boxCollision(playerHitbox, enemyHitbox)) {
                    const damage = CONFIG.dash.damageMin + (CONFIG.dash.damageMax - CONFIG.dash.damageMin) * player.dashCharge;
                    damageEnemy(enemy, damage, 'dash');
                }
            }
        }

        // Player vs enemy collision (not dashing)
        if (!player.isDashing) {
            for (const enemy of enemies) {
                if (!enemy.active) continue;

                const enemyHitbox = getEnemyHitbox(enemy);
                if (boxCollision(playerHitbox, enemyHitbox)) {
                    damagePlayer(20, enemy.x, enemy.y);
                    enemy.active = false;
                    spawnDeathParticles(enemy.x, enemy.y);
                }
            }
        }
    }
}

// -----------------------------------------------------------------------------
// UPDATE
// -----------------------------------------------------------------------------
function update(dt) {
    // Hit stop
    if (hitStopTimer > 0) {
        hitStopTimer -= dt;
        return;
    }

    if (gameState === 'playing') {
        updatePlayer(dt);
        updateCamera(dt);
        updateEnemies(dt);
        updateBullets(dt);
        spawnEnemies(dt);
        checkCollisions();
    }

    updateParticles(dt);
    updateScreenShake();
}

function updatePlayer(dt) {
    if (!player.active) return;

    // Move with camera (base movement)
    player.x += CONFIG.camera.scrollSpeed * dt;

    // Dash update
    if (player.isDashing) {
        player.dashTimer -= dt;
        player.x += player.dashDirX * CONFIG.dash.speed * dt;
        player.y += player.dashDirY * CONFIG.dash.speed * dt;

        // Trail particles while dashing
        if (Math.random() < 0.5) {
            spawnParticle(
                player.x, player.y,
                -100, (Math.random() - 0.5) * 50,
                '#44aaff', 3, 0.1
            );
        }

        if (player.dashTimer <= 0) {
            player.isDashing = false;
        }
    } else {
        // Normal movement
        player.vx = 0;
        player.vy = 0;

        if (keys['w'] || keys['arrowup']) player.vy = -CONFIG.player.speed;
        if (keys['s'] || keys['arrowdown']) player.vy = CONFIG.player.speed;
        if (keys['a'] || keys['arrowleft']) player.vx = -CONFIG.player.speed;
        if (keys['d'] || keys['arrowright']) player.vx = CONFIG.player.speed;

        // Normalize diagonal
        if (player.vx !== 0 && player.vy !== 0) {
            player.vx *= 0.707;
            player.vy *= 0.707;
        }

        // Apply knockback on top of input velocity
        player.x += (player.vx + player.knockbackVx) * dt;
        player.y += (player.vy + player.knockbackVy) * dt;

        // Decay knockback
        player.knockbackVx *= 0.85;
        player.knockbackVy *= 0.85;
        if (Math.abs(player.knockbackVx) < 1) player.knockbackVx = 0;
        if (Math.abs(player.knockbackVy) < 1) player.knockbackVy = 0;
    }

    // Clamp position (full screen movement allowed)
    const minX = cameraX + player.width / 2;
    const maxX = cameraX + CONFIG.canvas.width - player.width / 2;
    player.x = Math.max(minX, Math.min(maxX, player.x));
    player.y = Math.max(player.height / 2, Math.min(CONFIG.canvas.height - player.height / 2, player.y));

    // Invuln timer
    if (player.invulnTimer > 0) {
        player.invulnTimer -= dt;
    }

    // Shield regen
    if (player.shieldRegenTimer > 0) {
        player.shieldRegenTimer -= dt;
    } else if (player.shield < CONFIG.health.shieldMax) {
        player.shield = Math.min(CONFIG.health.shieldMax, player.shield + CONFIG.health.shieldRegenRate * dt);
    }

    // Fire input
    firePressed = keys[' '] || keys['space'] || mouseDown;

    if (firePressed) {
        fireMachineGun(dt);
        fireHoldTime += dt;
    } else {
        // Charge builds while not firing
        if (!CONFIG.debug.infiniteCharge) {
            player.charge = Math.min(CONFIG.charge.max, player.charge + CONFIG.charge.rate * dt);
        } else {
            player.charge = CONFIG.charge.max;
        }

        // Fire shotgun on release
        if (fireWasPressed) {
            fireShotgun();
        }
        fireHoldTime = 0;
    }

    fireWasPressed = firePressed;
}

function updateCamera(dt) {
    cameraX += CONFIG.camera.scrollSpeed * dt;
}

function updateEnemies(dt) {
    for (const enemy of enemies) {
        updateEnemy(enemy, dt);
    }
    // Clean up
    for (let i = enemies.length - 1; i >= 0; i--) {
        if (!enemies[i].active) enemies.splice(i, 1);
    }
}

function updateBullets(dt) {
    // Player bullets
    for (const bullet of playerBullets) {
        if (!bullet.active) continue;
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;

        // Shotgun range limit (1/3 of screen)
        if (bullet.type === 'shotgun') {
            const maxRange = CONFIG.canvas.width * CONFIG.shotgun.range;
            if (bullet.x - bullet.spawnX > maxRange) {
                bullet.active = false;
                continue;
            }
        }

        // Off screen
        if (bullet.x > cameraX + CONFIG.canvas.width + 50 || bullet.x < cameraX - 50 ||
            bullet.y < -50 || bullet.y > CONFIG.canvas.height + 50) {
            bullet.active = false;
        }
    }

    // Enemy bullets
    for (const bullet of enemyBullets) {
        if (!bullet.active) continue;
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;

        if (bullet.x > cameraX + CONFIG.canvas.width + 50 || bullet.x < cameraX - 50 ||
            bullet.y < -50 || bullet.y > CONFIG.canvas.height + 50) {
            bullet.active = false;
        }
    }

    // Clean up
    for (let i = playerBullets.length - 1; i >= 0; i--) {
        if (!playerBullets[i].active) playerBullets.splice(i, 1);
    }
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        if (!enemyBullets[i].active) enemyBullets.splice(i, 1);
    }
}

function updateParticles(dt) {
    for (const p of particles) {
        if (!p.active) continue;

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += CONFIG.effects.particleGravity * dt;
        p.lifetime -= dt;

        if (p.lifetime <= 0) {
            p.active = false;
        }
    }

    // Clean up
    for (let i = particles.length - 1; i >= 0; i--) {
        if (!particles[i].active) particles.splice(i, 1);
    }
}

function spawnEnemies(dt) {
    if (CONFIG.debug.noEnemies) return;

    enemySpawnTimer -= dt;
    if (enemySpawnTimer <= 0) {
        enemySpawnTimer = CONFIG.enemy.spawnRate + Math.random() * 0.5;
        spawnEnemy();
    }
}

// -----------------------------------------------------------------------------
// RENDER
// -----------------------------------------------------------------------------
function render() {
    ctx.save();

    // Apply screen shake
    ctx.translate(shakeX, shakeY);

    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

    // World offset
    ctx.save();
    ctx.translate(-cameraX, 0);

    // Background grid (for depth feel)
    renderBackground();

    // Enemies
    for (const enemy of enemies) {
        if (enemy.active) renderEnemy(enemy);
    }

    // Player
    if (player.active || gameState === 'dead') {
        renderPlayer();
    }

    // Bullets
    for (const bullet of playerBullets) {
        if (bullet.active) renderPlayerBullet(bullet);
    }
    for (const bullet of enemyBullets) {
        if (bullet.active) renderEnemyBullet(bullet);
    }

    // Particles
    for (const p of particles) {
        if (p.active) renderParticle(p);
    }

    ctx.restore();

    // UI (screen space)
    renderUI();

    ctx.restore();
}

function renderBackground() {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;

    const gridSize = 80;
    const startX = Math.floor(cameraX / gridSize) * gridSize;

    for (let x = startX; x < cameraX + CONFIG.canvas.width + gridSize; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CONFIG.canvas.height);
        ctx.stroke();
    }

    for (let y = 0; y < CONFIG.canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(cameraX, y);
        ctx.lineTo(cameraX + CONFIG.canvas.width, y);
        ctx.stroke();
    }
}

function renderPlayer() {
    const px = player.x;
    const py = player.y;

    // Flash when invuln
    if (player.invulnTimer > 0 && Math.floor(player.invulnTimer * 20) % 2 === 0) {
        ctx.globalAlpha = 0.5;
    }

    // Dash trail effect
    if (player.isDashing) {
        ctx.fillStyle = '#44aaff';
        ctx.globalAlpha = 0.3;
        ctx.fillRect(px - 30, py - player.height / 2, 30, player.height);
        ctx.globalAlpha = 1;
    }

    // Life-based ship color and blinking
    const lifePercent = player.life / CONFIG.health.lifeMax;
    let shipColor = '#44ff44';  // Healthy green

    if (player.isDashing) {
        shipColor = '#88ddff';
    } else if (lifePercent <= 0.3) {
        // Critical - blink red, faster as life decreases
        const blinkSpeed = 0.02 + (0.3 - lifePercent) * 0.05;
        const blink = Math.sin(performance.now() * blinkSpeed) > 0;
        shipColor = blink ? '#ff4444' : '#aa2222';
    } else if (lifePercent <= 0.5) {
        // Wounded - orange
        shipColor = '#ffaa44';
    } else if (lifePercent <= 0.75) {
        // Damaged - yellow-green
        shipColor = '#aaff44';
    }

    // Main body
    ctx.fillStyle = shipColor;
    ctx.fillRect(px - player.width / 2, py - player.height / 2, player.width, player.height);

    // Shield visual (blue border around ship)
    const shieldPercent = player.shield / CONFIG.health.shieldMax;
    if (shieldPercent > 0) {
        const shieldPadding = 2 + shieldPercent * 4;  // 2-6px padding
        const shieldAlpha = 0.3 + shieldPercent * 0.5;  // 0.3-0.8 alpha
        const shieldWidth = 1 + shieldPercent * 3;  // 1-4px line width

        ctx.strokeStyle = `rgba(68, 136, 255, ${shieldAlpha})`;
        ctx.lineWidth = shieldWidth;
        ctx.strokeRect(
            px - player.width / 2 - shieldPadding,
            py - player.height / 2 - shieldPadding,
            player.width + shieldPadding * 2,
            player.height + shieldPadding * 2
        );

        // Inner glow when shield is strong
        if (shieldPercent > 0.5) {
            ctx.shadowColor = '#4488ff';
            ctx.shadowBlur = shieldPercent * 10;
            ctx.strokeRect(
                px - player.width / 2 - shieldPadding,
                py - player.height / 2 - shieldPadding,
                player.width + shieldPadding * 2,
                player.height + shieldPadding * 2
            );
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }

        ctx.lineWidth = 1;
    }

    // Charge meter (built into ship)
    const chargePercent = player.charge / CONFIG.charge.max;
    const meterMinWidth = 6;
    const meterMaxWidth = player.width;
    const meterWidth = meterMinWidth + (meterMaxWidth - meterMinWidth) * chargePercent;
    const meterHeight = 6;
    const meterX = px + player.width / 2 - meterWidth + 4;  // Anchored to front of ship
    const meterY = py - meterHeight / 2;

    // Glow and blink effect when fully charged
    if (chargePercent >= 1) {
        const blink = Math.sin(performance.now() * 0.015) > 0;
        if (blink) {
            ctx.shadowColor = '#ff4400';
            ctx.shadowBlur = 20;
        }
    }

    // Meter color gradient based on charge (yellow to red)
    if (chargePercent >= 1) {
        const blink = Math.sin(performance.now() * 0.015) > 0;
        ctx.fillStyle = blink ? '#ff2200' : '#ff4400';  // Blinking red when full
    } else if (chargePercent > 0.5) {
        ctx.fillStyle = '#ff8800';  // Orange when high
    } else {
        ctx.fillStyle = '#ffdd00';  // Yellow when low
    }

    ctx.fillRect(meterX, meterY, meterWidth, meterHeight);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    ctx.globalAlpha = 1;

    // Debug hitbox (shows actual collision box including shield)
    if (CONFIG.debug.showHitboxes) {
        const hitbox = getPlayerHitbox();
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(hitbox.x, hitbox.y, hitbox.width, hitbox.height);
        ctx.lineWidth = 1;
    }
}

function renderEnemy(enemy) {
    // Body
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(enemy.x - enemy.width / 2, enemy.y - enemy.height / 2, enemy.width, enemy.height);

    // Health bar
    const healthPercent = enemy.health / enemy.maxHealth;
    ctx.fillStyle = '#440000';
    ctx.fillRect(enemy.x - enemy.width / 2, enemy.y - enemy.height / 2 - 8, enemy.width, 4);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(enemy.x - enemy.width / 2, enemy.y - enemy.height / 2 - 8, enemy.width * healthPercent, 4);

    if (CONFIG.debug.showHitboxes) {
        ctx.strokeStyle = '#ff0000';
        ctx.strokeRect(enemy.x - enemy.width / 2, enemy.y - enemy.height / 2, enemy.width, enemy.height);
    }
}

function renderPlayerBullet(bullet) {
    ctx.fillStyle = bullet.type === 'shotgun' ? '#ffaa44' : '#ffff44';
    // Size based on damage (min 3, scales up with damage)
    const radius = 3 + bullet.damage * 0.15;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, radius, 0, Math.PI * 2);
    ctx.fill();
}

function renderEnemyBullet(bullet) {
    ctx.fillStyle = '#ff6666';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.width / 2, 0, Math.PI * 2);
    ctx.fill();
}

function renderParticle(p) {
    const alpha = p.lifetime / p.maxLifetime;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
}

function renderUI() {
    const uiX = 20;
    const uiY = 20;

    // Life bar
    ctx.fillStyle = '#440000';
    ctx.fillRect(uiX, uiY, 200, 16);
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(uiX, uiY, 200 * (player.life / CONFIG.health.lifeMax), 16);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(uiX, uiY, 200, 16);

    // Shield bar
    ctx.fillStyle = '#000044';
    ctx.fillRect(uiX, uiY + 20, 200, 12);
    ctx.fillStyle = '#4488ff';
    ctx.fillRect(uiX, uiY + 20, 200 * (player.shield / CONFIG.health.shieldMax), 12);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(uiX, uiY + 20, 200, 12);

    // Charge bar
    ctx.fillStyle = '#222';
    ctx.fillRect(uiX, uiY + 40, 200, 20);
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(uiX, uiY + 40, 200 * (player.charge / CONFIG.charge.max), 20);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(uiX, uiY + 40, 200, 20);

    // Labels
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.fillText('LIFE', uiX + 205, uiY + 12);
    ctx.fillText('SHIELD', uiX + 205, uiY + 30);
    ctx.fillText('CHARGE', uiX + 205, uiY + 55);

    // Death screen
    if (gameState === 'dead') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);

        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DEAD', CONFIG.canvas.width / 2, CONFIG.canvas.height / 2);

        ctx.fillStyle = '#ffffff';
        ctx.font = '24px monospace';
        ctx.fillText('Press R to restart', CONFIG.canvas.width / 2, CONFIG.canvas.height / 2 + 50);

        ctx.textAlign = 'left';
    }

    // Debug info
    if (CONFIG.debug.showHitboxes) {
        ctx.fillStyle = '#ffff00';
        ctx.font = '12px monospace';
        ctx.fillText(`Enemies: ${enemies.length}`, uiX, CONFIG.canvas.height - 60);
        ctx.fillText(`Player bullets: ${playerBullets.length}`, uiX, CONFIG.canvas.height - 45);
        ctx.fillText(`Enemy bullets: ${enemyBullets.length}`, uiX, CONFIG.canvas.height - 30);
        ctx.fillText(`Particles: ${particles.length}`, uiX, CONFIG.canvas.height - 15);
    }
}

// -----------------------------------------------------------------------------
// RESTART
// -----------------------------------------------------------------------------
function restartGame() {
    // Reset player
    player.x = 150;
    player.y = CONFIG.canvas.height / 2;
    player.vx = 0;
    player.vy = 0;
    player.knockbackVx = 0;
    player.knockbackVy = 0;
    player.charge = 0;
    player.machineGunCooldown = 0;
    player.isDashing = false;
    player.dashTimer = 0;
    player.invulnTimer = 0;
    player.shield = CONFIG.health.shieldMax;
    player.life = CONFIG.health.lifeMax;
    player.shieldRegenTimer = 0;
    player.active = true;

    // Reset camera
    cameraX = 0;

    // Clear pools
    playerBullets.length = 0;
    enemyBullets.length = 0;
    enemies.length = 0;
    particles.length = 0;

    // Reset timers
    enemySpawnTimer = 1;
    hitStopTimer = 0;
    shakeAmount = 0;

    // Reset input
    fireWasPressed = false;
    fireHoldTime = 0;

    gameState = 'playing';
}

// -----------------------------------------------------------------------------
// GAME LOOP
// -----------------------------------------------------------------------------
function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // Cap delta time
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

// Start
requestAnimationFrame(gameLoop);
