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

    // Reinitialize background when canvas size changes
    if (typeof initBackground === 'function') {
        initBackground();
    }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Initialize background system
initBackground();

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

// Global elapsed time for animation
let elapsedTime = 0;

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
    chargeRegenTimer: 0,  // Delay before charge starts regenerating
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

    // Can't dash without charge
    if (player.charge <= 0) return;

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

    // Calculate dash duration and invuln time based on charge
    const chargePercent = player.charge / CONFIG.charge.max;
    const dashDuration = CONFIG.dash.durationMin + (CONFIG.dash.durationMax - CONFIG.dash.durationMin) * chargePercent;
    const invulnTime = CONFIG.dash.invulnTimeMin + (CONFIG.dash.invulnTimeMax - CONFIG.dash.invulnTimeMin) * chargePercent;

    // Start dash
    player.isDashing = true;
    player.dashTimer = dashDuration;
    player.dashCharge = player.charge;
    player.invulnTimer = invulnTime;

    // Consume charge and trigger regen delay
    if (!CONFIG.debug.infiniteCharge) {
        player.charge = 0;
        player.chargeRegenTimer = CONFIG.charge.regenDelay;
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

        // Consume charge when firing
        if (!CONFIG.debug.infiniteCharge) {
            player.charge = Math.max(0, player.charge - CONFIG.machineGun.chargeCost);
        }

        // Random spread
        const angle = (Math.random() - 0.5) * CONFIG.machineGun.spread;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        spawnPlayerBullet(
            player.x + player.width / 2,
            player.y,
            CONFIG.machineGun.bulletSpeed * cos,
            CONFIG.machineGun.bulletSpeed * sin,
            CONFIG.machineGun.damage,
            'machinegun'
        );
    }
}

function fireShotgun() {
    const chargePercent = player.charge / CONFIG.charge.max;

    // If no charge, fire a single machine gun shot instead
    if (chargePercent <= 0) {
        spawnPlayerBullet(
            player.x + player.width / 2,
            player.y,
            CONFIG.machineGun.bulletSpeed,
            0,
            CONFIG.machineGun.damage,
            'machinegun'
        );
        return;
    }

    const pelletCount = Math.floor(CONFIG.shotgun.pelletsMin + (CONFIG.shotgun.pelletsMax - CONFIG.shotgun.pelletsMin) * chargePercent);
    const damage = CONFIG.shotgun.damageMin + (CONFIG.shotgun.damageMax - CONFIG.shotgun.damageMin) * chargePercent;

    for (let i = 0; i < pelletCount; i++) {
        const angle = (Math.random() - 0.5) * CONFIG.shotgun.spread * (1 + chargePercent);
        const speed = CONFIG.shotgun.bulletSpeed * (0.8 + Math.random() * 0.4);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        spawnPlayerBullet(
            player.x + player.width / 2,
            player.y,
            speed * cos,
            speed * sin,
            damage,
            'shotgun'
        );
    }

    // Screen shake scales with charge
    addScreenShake(5 + chargePercent * 15);

    // Consume charge and trigger regen delay
    if (!CONFIG.debug.infiniteCharge) {
        player.charge = 0;
        player.chargeRegenTimer = CONFIG.charge.regenDelay;
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
    // Weighted random selection
    const roll = Math.random();
    let enemyType;
    if (roll < CONFIG.enemyTypes.kamikaze.spawnWeight) {
        enemyType = 'kamikaze';
    } else if (roll < CONFIG.enemyTypes.kamikaze.spawnWeight + CONFIG.enemyTypes.gunship.spawnWeight) {
        enemyType = 'gunship';
    } else {
        enemyType = 'drifter';
    }

    let enemy;
    if (enemyType === 'gunship') {
        const config = CONFIG.enemyTypes.gunship;
        enemy = {
            x: cameraX + CONFIG.canvas.width + 50,
            y: Math.random() * (CONFIG.canvas.height - config.height * 2) + config.height,
            vx: config.vxMin - Math.random() * (config.vxMin - config.vxMax),
            vy: (Math.random() - 0.5) * config.vySpread,
            knockbackVx: 0,  // Separate knockback velocity
            knockbackVy: 0,
            width: config.width,
            height: config.height,
            health: config.health,
            maxHealth: config.health,
            mass: config.mass,
            fireTimer: config.fireRateMin + Math.random() * (config.fireRateMax - config.fireRateMin),
            burstCount: 0,
            burstTimer: 0,
            active: true,
            type: 'gunship'
        };
    } else if (enemyType === 'kamikaze') {
        const config = CONFIG.enemyTypes.kamikaze;
        enemy = {
            x: cameraX + CONFIG.canvas.width + 50,
            y: Math.random() * (CONFIG.canvas.height - config.height * 2) + config.height,
            vx: config.vxMin - Math.random() * (config.vxMin - config.vxMax),
            vy: 0,
            knockbackVx: 0,  // Separate knockback velocity
            knockbackVy: 0,
            width: config.width,
            height: config.height,
            health: config.health,
            maxHealth: config.health,
            mass: config.mass,
            state: 'aligning',           // 'aligning', 'firing', 'destroyed'
            chargeProgress: 0,           // 0 to 1, tracks charge time
            beamTimer: 0,                // Countdown during firing state
            shakeOffset: { x: 0, y: 0 }, // For shake effect
            active: true,
            type: 'kamikaze'
        };
    } else {
        const config = CONFIG.enemyTypes.drifter;
        enemy = {
            x: cameraX + CONFIG.canvas.width + 50,
            y: Math.random() * (CONFIG.canvas.height - config.height * 2) + config.height,
            vx: config.vxMin - Math.random() * (config.vxMin - config.vxMax),
            vy: (Math.random() - 0.5) * config.vySpread,
            knockbackVx: 0,  // Separate knockback velocity
            knockbackVy: 0,
            width: config.width,
            height: config.height,
            health: config.health,
            maxHealth: config.health,
            mass: config.mass,
            fireTimer: Math.random() * config.fireRate,
            active: true,
            type: 'drifter'
        };
    }

    enemies.push(enemy);
}

function updateEnemy(enemy, dt) {
    if (!enemy.active) return;

    if (enemy.type === 'gunship') {
        updateGunship(enemy, dt);
    } else if (enemy.type === 'kamikaze') {
        updateKamikaze(enemy, dt);
    } else {
        updateDrifter(enemy, dt);
    }

    // Remove if off screen left
    if (enemy.x < cameraX - 100) {
        enemy.active = false;
    }
}

function updateDrifter(enemy, dt) {
    const config = CONFIG.enemyTypes.drifter;

    // Move toward player (drift)
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
        enemy.vy += (dy / dist) * 100 * dt;
    }

    // Apply base velocity + knockback
    enemy.x += (enemy.vx + enemy.knockbackVx) * dt;
    enemy.y += (enemy.vy + enemy.knockbackVy) * dt;

    // Decay knockback
    enemy.knockbackVx *= 0.9;
    enemy.knockbackVy *= 0.9;
    if (Math.abs(enemy.knockbackVx) < 1) enemy.knockbackVx = 0;
    if (Math.abs(enemy.knockbackVy) < 1) enemy.knockbackVy = 0;

    // Clamp Y
    enemy.y = Math.max(enemy.height / 2, Math.min(CONFIG.canvas.height - enemy.height / 2, enemy.y));

    // Fire at player
    enemy.fireTimer -= dt;
    if (enemy.fireTimer <= 0) {
        enemy.fireTimer = config.fireRate + Math.random() * 0.5;
        fireEnemyBullet(enemy);
    }
}

function updateGunship(enemy, dt) {
    const config = CONFIG.enemyTypes.gunship;

    // Apply base velocity + knockback
    enemy.x += (enemy.vx + enemy.knockbackVx) * dt;
    enemy.y += (enemy.vy + enemy.knockbackVy) * dt;

    // Decay knockback (slower decay due to higher mass)
    enemy.knockbackVx *= 0.88;
    enemy.knockbackVy *= 0.88;
    if (Math.abs(enemy.knockbackVx) < 1) enemy.knockbackVx = 0;
    if (Math.abs(enemy.knockbackVy) < 1) enemy.knockbackVy = 0;

    // Dampen vertical velocity
    enemy.vy *= 0.95;

    // Clamp Y
    enemy.y = Math.max(enemy.height / 2, Math.min(CONFIG.canvas.height - enemy.height / 2, enemy.y));

    // Burst fire behavior
    if (enemy.burstCount > 0) {
        enemy.burstTimer -= dt;
        if (enemy.burstTimer <= 0) {
            enemy.burstTimer = config.burstFireRate;
            fireGunshipBurst(enemy);
            enemy.burstCount--;
        }
    } else {
        // Wait between bursts
        enemy.fireTimer -= dt;
        if (enemy.fireTimer <= 0) {
            enemy.fireTimer = config.fireRateMin + Math.random() * (config.fireRateMax - config.fireRateMin);
            enemy.burstCount = config.burstBulletsMin + Math.floor(Math.random() * (config.burstBulletsMax - config.burstBulletsMin + 1));
            enemy.burstTimer = 0;
        }
    }
}

function updateKamikaze(enemy, dt) {
    const config = CONFIG.enemyTypes.kamikaze;

    if (enemy.state === 'aligning') {
        // Move vertically toward player Y position
        const playerCenterY = player.y + player.height / 2;
        const enemyCenterY = enemy.y + enemy.height / 2;
        const dy = playerCenterY - enemyCenterY;

        // Move toward player vertically if not aligned
        if (Math.abs(dy) > config.vyAlignThreshold) {
            enemy.vy = Math.sign(dy) * config.vySpeed;
        } else {
            enemy.vy = 0;
        }

        // Apply base velocity + knockback
        enemy.x += (enemy.vx + enemy.knockbackVx) * dt;
        enemy.y += (enemy.vy + enemy.knockbackVy) * dt;

        // Decay knockback
        enemy.knockbackVx *= 0.9;
        enemy.knockbackVy *= 0.9;
        if (Math.abs(enemy.knockbackVx) < 1) enemy.knockbackVx = 0;
        if (Math.abs(enemy.knockbackVy) < 1) enemy.knockbackVy = 0;

        // Clamp Y
        enemy.y = Math.max(enemy.height / 2, Math.min(CONFIG.canvas.height - enemy.height / 2, enemy.y));

        // Increment charge
        enemy.chargeProgress += dt / config.chargeTime;

        // Increase shake as it charges (none at start, max 3 near end)
        const chargeShakeIntensity = enemy.chargeProgress * 3;
        enemy.shakeOffset.x = (Math.random() - 0.5) * chargeShakeIntensity;
        enemy.shakeOffset.y = (Math.random() - 0.5) * chargeShakeIntensity;

        if (enemy.chargeProgress >= 1) {
            enemy.state = 'firing';
            enemy.beamTimer = config.beamDuration;
            enemy.vx = 0;
            enemy.vy = 0;
        }
    } else if (enemy.state === 'firing') {
        // Stop movement and check beam collision
        enemy.vx = 0;
        enemy.vy = 0;

        // Generate shake offset (heavy shake during firing)
        const shakeIntensity = 5 + Math.random() * 3; // 5-8 pixels of shake
        enemy.shakeOffset.x = (Math.random() - 0.5) * shakeIntensity;
        enemy.shakeOffset.y = (Math.random() - 0.5) * shakeIntensity;

        // Check beam collision with player
        checkKamikazeBeam(enemy, dt);

        // Countdown beam timer
        enemy.beamTimer -= dt;
        if (enemy.beamTimer <= 0) {
            enemy.state = 'destroyed';
        }
    } else if (enemy.state === 'destroyed') {
        // Spawn death particles with more drama
        spawnDeathParticles(enemy.x, enemy.y, 40);
        addScreenShake(8);
        enemy.active = false;
    }
}

function checkKamikazeBeam(kamikaze, dt) {
    const config = CONFIG.enemyTypes.kamikaze;

    // Beam extends from kamikaze to far left (shooting backwards)
    const beamLeftX = cameraX - 500;  // Far left edge
    const beamRightX = kamikaze.x + kamikaze.width / 2;  // Kamikaze front

    // Beam Y position (center of beam)
    const beamCenterY = kamikaze.y + kamikaze.height / 2;
    const beamTop = beamCenterY - config.beamHeight / 2;
    const beamBottom = beamCenterY + config.beamHeight / 2;

    const playerHitbox = getPlayerHitbox();

    // Check if player overlaps beam vertically (within beam bounds)
    const playerBottom = playerHitbox.y + playerHitbox.height;
    const playerTop = playerHitbox.y;

    if (playerBottom > beamTop && playerTop < beamBottom) {
        // Check if player is in beam's horizontal range
        const playerRight = playerHitbox.x + playerHitbox.width;
        const playerLeft = playerHitbox.x;

        if (playerRight > beamLeftX && playerLeft < beamRightX) {
            const damage = config.beamDamage * dt;
            damagePlayer(damage, kamikaze.x, kamikaze.y);
        }
    }

    // Damage other enemy ships
    for (const enemy of enemies) {
        if (!enemy.active || enemy === kamikaze) continue;

        const enemyHitbox = getEnemyHitbox(enemy);
        const enemyBottom = enemyHitbox.y + enemyHitbox.height;
        const enemyTop = enemyHitbox.y;

        // Check vertical overlap
        if (enemyBottom > beamTop && enemyTop < beamBottom) {
            // Check horizontal overlap
            const enemyRight = enemyHitbox.x + enemyHitbox.width;
            const enemyLeft = enemyHitbox.x;

            if (enemyRight > beamLeftX && enemyLeft < beamRightX) {
                const damage = config.beamDamage * dt;
                damageEnemy(enemy, damage, 'beam');
            }
        }
    }
}

function fireEnemyBullet(enemy) {
    const config = CONFIG.enemyTypes.drifter;
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const spread = (Math.random() - 0.5) * 0.3;

    enemyBullets.push({
        x: enemy.x,
        y: enemy.y,
        vx: Math.cos(angle + spread) * config.bulletSpeed,
        vy: Math.sin(angle + spread) * config.bulletSpeed,
        width: 20,
        height: 20,
        damage: config.bulletDamage,
        active: true
    });
}

function fireGunshipBurst(enemy) {
    const config = CONFIG.enemyTypes.gunship;
    // Fire in a semi-circular pattern toward the player
    const angleToPlayer = Math.atan2(player.y - enemy.y, player.x - enemy.x);

    // Random spread within semi-circle
    const spreadAngle = (Math.random() - 0.5) * config.spreadAngle;
    const finalAngle = angleToPlayer + spreadAngle;

    enemyBullets.push({
        x: enemy.x - enemy.width / 2,  // Fire from front of ship
        y: enemy.y,
        vx: Math.cos(finalAngle) * config.bulletSpeed,
        vy: Math.sin(finalAngle) * config.bulletSpeed,
        width: 16,
        height: 16,
        damage: config.bulletDamage,
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

    // Apply to knockback velocity instead of base velocity
    enemy.knockbackVx += knockbackForce * knockbackMultiplier;

    // Add slight vertical knockback away from player
    const dy = enemy.y - player.y;
    if (dy !== 0) {
        enemy.knockbackVy += (dy > 0 ? 1 : -1) * knockbackForce * knockbackMultiplier * 0.3;
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

function spawnDeathParticles(x, y, count = 20) {
    for (let i = 0; i < count; i++) {
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
    const shieldPadding = shieldPercent > 0 ? (4 + shieldPercent * 6) : 0;

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
    // Update global elapsed time for animations
    elapsedTime += dt;

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
    updateBackground(dt, CONFIG.camera.scrollSpeed);
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

        // Trail particles while dashing - opposite direction of dash
        // Spawn rate: higher charge = more particles
        const spawnChance = 0.3 + player.dashCharge * 0.7;  // 0.3-1.0 based on charge
        if (Math.random() < spawnChance) {
            // Determine trail color based on charge used
            let trailColor;
            if (player.dashCharge >= 1.0) {
                trailColor = '#ff4400';  // Red for full charge
            } else if (player.dashCharge > 0.5) {
                trailColor = '#ff8800';  // Orange for mid charge
            } else {
                trailColor = '#ffdd00';  // Yellow for low charge
            }

            // Trail goes opposite to dash direction
            const trailSpeed = 150 + Math.random() * 100;
            const spreadAmount = 30;  // Slight random spread
            spawnParticle(
                player.x, player.y,
                -player.dashDirX * trailSpeed + (Math.random() - 0.5) * spreadAmount,
                -player.dashDirY * trailSpeed + (Math.random() - 0.5) * spreadAmount,
                trailColor,
                3 + player.dashCharge * 3,  // Bigger particles with more charge
                0.15 + player.dashCharge * 0.15  // Longer lifetime with more charge
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

    // Update charge regen timer
    if (player.chargeRegenTimer > 0) {
        player.chargeRegenTimer -= dt;
    }

    if (firePressed) {
        fireMachineGun(dt);
        fireHoldTime += dt;
    } else {
        // Charge builds while not firing (only after regen delay expires)
        if (!CONFIG.debug.infiniteCharge) {
            if (player.chargeRegenTimer <= 0) {
                player.charge = Math.min(CONFIG.charge.max, player.charge + CONFIG.charge.rate * dt);
            }
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

    // Background (parallax layers - rendered in screen space, not world space)
    renderBackground(ctx, cameraX);

    // World offset
    ctx.save();
    ctx.translate(-cameraX, 0);

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

// Background rendering is now handled by background.js parallax system

function renderPlayer() {
    const px = player.x;
    const py = player.y;

    // Flash when invuln
    if (player.invulnTimer > 0 && Math.floor(player.invulnTimer * 20) % 2 === 0) {
        ctx.globalAlpha = 0.5;
    }

    // Dash trail effect - directional based on dash direction
    if (player.isDashing) {
        // Determine trail color based on charge used
        let trailColor;
        if (player.dashCharge >= 1.0) {
            trailColor = '#ff4400';  // Red for full charge
        } else if (player.dashCharge > 0.5) {
            trailColor = '#ff8800';  // Orange for mid charge
        } else {
            trailColor = '#ffdd00';  // Yellow for low charge
        }

        // Draw trail in opposite direction of dash
        const trailLength = 30 + player.dashCharge * 30;  // 30-60 pixels based on charge
        const trailWidth = player.height + player.dashCharge * 10;  // Wider with more charge

        // Calculate trail rectangle position based on dash direction
        const trailStartX = px - player.dashDirX * trailLength;
        const trailStartY = py - player.dashDirY * trailLength;

        // Draw gradient trail
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = trailColor;

        // Create gradient along dash direction
        const gradient = ctx.createLinearGradient(
            px, py,
            trailStartX, trailStartY
        );
        gradient.addColorStop(0, trailColor);
        gradient.addColorStop(1, trailColor + '00');  // Transparent at end

        // Draw trail as a thick line
        ctx.strokeStyle = gradient;
        ctx.lineWidth = trailWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(trailStartX, trailStartY);
        ctx.stroke();

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

    // Shield visual (blue circle around ship)
    const shieldPercent = player.shield / CONFIG.health.shieldMax;
    if (shieldPercent > 0) {
        const shieldRadius = (player.width / 2) + 4 + shieldPercent * 6;  // Base radius + padding
        const shieldAlpha = 0.3 + shieldPercent * 0.5;  // 0.3-0.8 alpha
        const shieldWidth = 1 + shieldPercent * 3;  // 1-4px line width

        ctx.strokeStyle = `rgba(68, 136, 255, ${shieldAlpha})`;
        ctx.lineWidth = shieldWidth;
        ctx.beginPath();
        ctx.arc(px, py, shieldRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner glow when shield is strong
        if (shieldPercent > 0.5) {
            ctx.shadowColor = '#4488ff';
            ctx.shadowBlur = shieldPercent * 10;
            ctx.beginPath();
            ctx.arc(px, py, shieldRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }

        ctx.lineWidth = 1;
    }

    // Cannon square (center front square of the ship)
    const cannonSize = 8;
    const cannonX = px + player.width / 2 - cannonSize / 2;
    const cannonY = py - cannonSize / 2;
    ctx.fillStyle = '#666666';
    ctx.fillRect(cannonX, cannonY, cannonSize, cannonSize);

    // Charge circle (grows in front of cannon, only visible when charging)
    const chargePercent = player.charge / CONFIG.charge.max;
    if (chargePercent > 0) {
        const minRadius = 2;
        const maxRadius = 15;  // 30x30 diameter when full
        const radius = minRadius + (maxRadius - minRadius) * chargePercent;
        const circleX = px + player.width / 2 + radius + 6;  // In front of cannon
        const circleY = py;

        // Glow and blink effect when fully charged
        if (chargePercent >= 1) {
            const blink = Math.sin(performance.now() * 0.015) > 0;
            if (blink) {
                ctx.shadowColor = '#ff2200';
                ctx.shadowBlur = 25;
            } else {
                ctx.shadowColor = '#ff4400';
                ctx.shadowBlur = 15;
            }
        }

        // Circle color gradient based on charge (yellow to red)
        if (chargePercent >= 1) {
            const blink = Math.sin(performance.now() * 0.015) > 0;
            ctx.fillStyle = blink ? '#ff2200' : '#ff4400';  // Blinking red when full
        } else if (chargePercent > 0.5) {
            ctx.fillStyle = '#ff8800';  // Orange when high
        } else {
            ctx.fillStyle = '#ffdd00';  // Yellow when low
        }

        ctx.beginPath();
        ctx.arc(circleX, circleY, radius, 0, Math.PI * 2);
        ctx.fill();

        // Reset shadow
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    }

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
    if (enemy.type === 'gunship') {
        renderGunship(enemy);
    } else if (enemy.type === 'kamikaze') {
        renderKamikaze(enemy);
    } else {
        renderDrifter(enemy);
    }
}

function renderDrifter(enemy) {
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

function renderGunship(enemy) {
    // Main body - wider, more rectangular
    ctx.fillStyle = '#cc4444';
    ctx.fillRect(enemy.x - enemy.width / 2, enemy.y - enemy.height / 2, enemy.width, enemy.height);

    // Wing details (darker red accent)
    ctx.fillStyle = '#aa2222';
    ctx.fillRect(enemy.x - enemy.width / 2, enemy.y - enemy.height / 2 + 5, enemy.width * 0.3, enemy.height - 10);
    ctx.fillRect(enemy.x + enemy.width / 2 - enemy.width * 0.3, enemy.y - enemy.height / 2 + 5, enemy.width * 0.3, enemy.height - 10);

    // Gun barrels (indicate it's a gunship)
    ctx.fillStyle = '#666666';
    const gunY1 = enemy.y - enemy.height / 4;
    const gunY2 = enemy.y + enemy.height / 4;
    ctx.fillRect(enemy.x - enemy.width / 2 - 8, gunY1 - 2, 10, 4);
    ctx.fillRect(enemy.x - enemy.width / 2 - 8, gunY2 - 2, 10, 4);

    // Charging indicator when firing burst
    if (enemy.burstCount > 0) {
        const maxBurst = CONFIG.enemyTypes.gunship.burstBulletsMax;
        const chargePercent = 1 - (enemy.burstCount / maxBurst);
        ctx.fillStyle = `rgba(255, 100, 0, ${0.5 + chargePercent * 0.5})`;
        ctx.fillRect(enemy.x - enemy.width / 2 - 10, gunY1 - 3, 12, 6);
        ctx.fillRect(enemy.x - enemy.width / 2 - 10, gunY2 - 3, 12, 6);
    }

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

function renderKamikaze(enemy) {
    const config = CONFIG.enemyTypes.kamikaze;

    // Apply shake offset to render position
    const renderX = enemy.x + enemy.shakeOffset.x;
    const renderY = enemy.y + enemy.shakeOffset.y;

    if (enemy.state === 'aligning') {
        // Calculate blink effect: frequency increases with charge
        const blinkFreq = 2 + enemy.chargeProgress * 8;
        const blinkPhase = Math.sin(elapsedTime * blinkFreq * Math.PI);
        const alpha = blinkPhase > 0 ? 1.0 : 0.3;

        // Color shifts from YELLOW to RED as it charges
        // Start: yellow (255, 255, 0), End: red (255, 0, 0)
        const greenChannel = Math.floor(255 * (1 - enemy.chargeProgress));
        ctx.fillStyle = `rgba(255, ${greenChannel}, 0, ${alpha})`;

        // Body
        ctx.fillRect(renderX - enemy.width / 2, renderY - enemy.height / 2, enemy.width, enemy.height);

        // Eyes/details - bright when blinking
        ctx.fillStyle = `rgba(255, 255, 100, ${alpha})`;
        ctx.fillRect(renderX - 8, renderY - 6, 4, 4);
        ctx.fillRect(renderX + 4, renderY - 6, 4, 4);
    } else if (enemy.state === 'firing') {
        // Solid bright color during firing
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(renderX - enemy.width / 2, renderY - enemy.height / 2, enemy.width, enemy.height);

        // Intense glowing effect
        ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.fillRect(renderX - enemy.width / 2 - 5, renderY - enemy.height / 2 - 5, enemy.width + 10, enemy.height + 10);

        // Draw beam from kamikaze to right edge of screen with shake
        const baseBeamY = renderY;
        const beamShake = (Math.random() - 0.5) * 2; // Small shake to beam
        const beamY = baseBeamY + beamShake;

        // Beam extends far to the left (in world space, shooting backwards)
        const beamEndX = cameraX - 500;

        // Outer glow (semi-transparent, wider, red)
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)';
        ctx.lineWidth = 24;
        ctx.beginPath();
        ctx.moveTo(renderX + enemy.width / 2, beamY);
        ctx.lineTo(beamEndX, beamY);
        ctx.stroke();

        // Main beam (bright red)
        ctx.strokeStyle = 'rgba(255, 50, 0, 0.95)';
        ctx.lineWidth = config.beamHeight + 3;
        ctx.beginPath();
        ctx.moveTo(renderX + enemy.width / 2, beamY);
        ctx.lineTo(beamEndX, beamY);
        ctx.stroke();

        // Bright core (pure white/bright yellow)
        ctx.strokeStyle = '#ffff44';
        ctx.lineWidth = config.beamHeight * 0.5;
        ctx.beginPath();
        ctx.moveTo(renderX + enemy.width / 2, beamY);
        ctx.lineTo(beamEndX, beamY);
        ctx.stroke();
    }

    // Health bar (visible in both states)
    const healthPercent = enemy.health / enemy.maxHealth;
    ctx.fillStyle = '#440000';
    ctx.fillRect(renderX - enemy.width / 2, renderY - enemy.height / 2 - 8, enemy.width, 4);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(renderX - enemy.width / 2, renderY - enemy.height / 2 - 8, enemy.width * healthPercent, 4);

    if (CONFIG.debug.showHitboxes) {
        ctx.strokeStyle = '#ff0000';
        ctx.strokeRect(renderX - enemy.width / 2, renderY - enemy.height / 2, enemy.width, enemy.height);
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
    player.chargeRegenTimer = 0;
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

    // Reinitialize background
    initBackground();

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
