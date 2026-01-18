// BULLET HELL - Configuration

const CONFIG = {
    canvas: {
        width: 1280,
        height: 720
    },

    player: {
        speed: 850,
        size: 30
    },

    camera: {
        scrollSpeed: 100
    },

    machineGun: {
        fireRate: 0.08,
        damage: 8,
        spread: 0.2,
        bulletSpeed: 1100
    },

    shotgun: {
        pelletsMin: 3,
        pelletsMax: 12,
        damageMin: 5,
        damageMax: 40,
        spread: 0.4,
        bulletSpeed: 1000,
        range: 0.22  // Fraction of screen width
    },

    charge: {
        rate: 0.8,
        max: 1.0
    },

    dash: {
        duration: 0.25,
        speed: 2000,
        doubleTapWindow: 0.2,
        invulnTime: 0.2,
        damageMin: 10,
        damageMax: 80
    },

    health: {
        shieldMax: 100,
        shieldRegenDelay: 2,
        shieldRegenRate: 30,
        lifeMax: 100
    },

    lifesteal: {
        machineGun: 0.05,
        shotgun: 0.10,
        dash: 0.3
    },

    enemy: {
        spawnRate: 1.2,
        bulletSpeed: 250,
        fireRate: 2.0
    },

    effects: {
        screenShakeDecay: 0.9,
        hitStopDuration: 0.05,
        particleGravity: 400
    },

    knockback: {
        playerHit: 200,           // Base knockback when player is hit
        machineGun: 80,           // Knockback per machine gun hit
        shotgun: 250,             // Knockback per shotgun pellet
        dash: 400                 // Knockback from dash collision
    },

    debug: {
        invincible: false,
        infiniteCharge: false,
        showHitboxes: false,
        noEnemies: false
    }
};
