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
        scrollSpeed: 200
    },

    machineGun: {
        fireRate: 0.07,
        damage: 8,
        spread: 0.2,
        bulletSpeed: 1400,
        chargeCost: 0.12  // Charge consumed per shot
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
        max: 1.0,
        regenDelay: 1.4  // Seconds before charge starts regenerating after use
    },

    dash: {
        durationMin: 0.1,   // Minimum dash duration (no charge)
        durationMax: 0.22,  // Maximum dash duration (full charge)
        speed: 1800,
        doubleTapWindow: 0.2,
        invulnTimeMin: 0.1,   // Minimum invuln time (no charge)
        invulnTimeMax: 0.25,  // Maximum invuln time (full charge)
        damageMin: 10,
        damageMax: 80
    },

    health: {
        shieldMax: 100,
        shieldRegenDelay: 4,
        shieldRegenRate: 30,
        lifeMax: 100
    },

    lifesteal: {
        machineGun: 0.01,
        shotgun: 0.03,
        dash: 0.1
    },

    enemyTypes: {
        drifter: {
            width: 50,
            height: 30,
            health: 40,
            mass: 1.0,
            vxMin: -180,
            vxMax: -120,
            vySpread: 60,
            fireRate: 2.0,
            bulletSpeed: 187.5,  // 1/4 slower (250 * 0.75)
            bulletDamage: 15,
            spawnWeight: 0.7  // 70% spawn chance
        },
        gunship: {
            width: 80,
            height: 40,
            health: 250,
            mass: 3.5,
            vxMin: -60,
            vxMax: -35,
            vySpread: 30,
            fireRateMin: 2.5,
            fireRateMax: 4.0,
            burstBulletsMin: 11,  // 1/4 fewer bullets (15 * 0.75 ≈ 11)
            burstBulletsMax: 19,  // 1/4 fewer bullets (25 * 0.75 = 18.75 ≈ 19)
            burstFireRate: 0.08,
            bulletSpeed: 225,  // 1/4 slower (300 * 0.75)
            bulletDamage: 12,
            spreadAngle: Math.PI / 1.3,  // ±70 degrees
            spawnWeight: 0.3  // 30% spawn chance
        },
        kamikaze: {
            width: 55,
            height: 35,
            health: 80,
            mass: 0.5,
            vxMin: -100,
            vxMax: -70,
            vySpeed: 150,              // Speed when aligning with player
            vyAlignThreshold: 5,       // Pixels within player Y to consider aligned
            chargeTime: 4,           // Total time from spawn to beam fire
            beamDuration: 1.0,         // How long the beam persists
            beamDamage: 300,           // Damage per second (continuous)
            beamHeight: 10,             // Visual thickness of beam
            spawnWeight: 0.15          // 15% spawn chance
        }
    },

    enemy: {
        spawnRate: 1.2
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
    },

    mobile: {
        enabled: true,  // Will be set dynamically at runtime
        joystick: {
            radius: 100,
            innerRadius: 40,
            deadZone: 0.15,  // 15% of radius
            opacity: 0.4
        },
        buttons: {
            fireRadius: 80,
            dashRadius: 60,
            spacing: 20,  // Gap between buttons
            opacity: 0.4,
            activeOpacity: 0.7
        },
        layout: {
            edgePadding: 40  // Distance from screen edges
        }
    }
};
