# BULLET HELL - Claude Development Guide

## Project Overview

A high-energy side-scrolling bullet hell game built with plain HTML, JavaScript, and Canvas. The focus is on **feel over realism** and **fast iteration over code quality**.

## Tech Stack

- Single HTML file or small set of JS files
- No frameworks
- Canvas 2D rendering
- 60 FPS target
- Simple shapes only (rectangles, circles, lines)
- Object pooling for bullets (encouraged)

## File Structure

```
/
├── index.html          # Entry point, contains canvas
├── js/
│   ├── game.js         # Main game loop, state management
│   ├── player.js       # Player entity, input handling
│   ├── enemies.js      # Enemy types and behavior
│   ├── bullets.js      # Bullet pools, collision
│   ├── particles.js    # Visual effects
│   └── utils.js        # Math helpers, constants
└── CLAUDE.md
```

## Core Mechanics

### Fire System (THE CORE MECHANIC)

Single fire input with dual behavior:

**Hold Fire → Machine Gun**
- High fire rate, low damage per bullet
- Random forward angle drift (inaccuracy)
- 10% lifesteal on damage dealt

**Release Fire → Shotgun Blast**
- Damage and pellet count scale with charge time
- Consumes ALL stored charge
- 25% lifesteal on damage dealt
- Charge builds automatically while NOT firing

### Dash System

- Forward dash only (Shift key)
- Consumes shotgun charge
- Grants brief invulnerability
- Collision deals damage (scales with charge)
- 40% lifesteal on damage dealt
- Low/no charge dash is weak and risky but still allowed

### Health System (Halo-style)

**Shield**
- Takes damage first
- Regenerates after X seconds of no damage

**Life**
- Does not regenerate automatically
- Restored via lifesteal when dealing damage
- Lifesteal applies to life first, then shield if full
- No overheal

## Controls

| Action | Keyboard | Gamepad | Mouse |
|--------|----------|---------|-------|
| Move | WASD | Left Stick | - |
| Fire | Space | A | Left Click |
| Dash | Double-tap W/D | Double-tap stick | - |

### Dash Input
- Double-tap a direction (e.g., D D or W W) to dash that direction
- Must tap twice within ~200ms window
- Dash is always forward-facing but input direction affects angle

## Camera & Movement

- Side-scrolling: camera scrolls constantly left-to-right
- Player moves freely vertically
- Horizontal movement limited to screen bounds
- Player clamped to left ~25% of screen (cannot fall behind)
- Forward-facing only, no aiming

## Enemy Types (Initial)

| Type | Behavior | Notes |
|------|----------|-------|
| Drifter | Flies straight toward player | Low health, dies fast |
| Shooter | Slow movement, fires bullets forward | Basic threat |
| Chunk | High mass, less knockback | Dangerous to dash without charge |

## Visual Feedback (Required)

- **Screen shake** on shotgun and dash
- **Hit stop** on high damage hits
- **Particles** for all impacts
- Bullet hell density: aggressive but readable

## Code Style Guidelines

### Priorities
1. Feel and juice first
2. Playable > perfect
3. Tune numbers roughly, iterate fast
4. Avoid over-engineering

### Patterns
```javascript
// Game loop pattern
function gameLoop(timestamp) {
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

// Entity pattern (keep it simple)
const entity = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    width: 0, height: 0,
    active: true,
    update(dt) { },
    render(ctx) { }
};

// Object pool pattern
class BulletPool {
    constructor(size) {
        this.pool = Array(size).fill(null).map(() => ({ active: false }));
    }
    spawn(x, y, vx, vy) {
        const bullet = this.pool.find(b => !b.active);
        if (bullet) { /* init and activate */ }
        return bullet;
    }
}
```

### Constants to Tune
```javascript
// Put these at top of file for easy tweaking
const PLAYER_SPEED = 300;
const MACHINE_GUN_RATE = 0.08;      // seconds between shots
const MACHINE_GUN_DAMAGE = 5;
const MACHINE_GUN_SPREAD = 0.15;    // radians
const SHOTGUN_PELLETS_BASE = 5;
const SHOTGUN_PELLETS_MAX = 15;
const SHOTGUN_DAMAGE_BASE = 10;
const SHOTGUN_DAMAGE_MAX = 50;
const CHARGE_RATE = 1.0;            // charge per second
const DASH_DURATION = 0.2;
const DASH_SPEED = 800;
const DASH_DOUBLE_TAP_WINDOW = 0.2; // seconds to register double-tap
const SHIELD_MAX = 100;
const SHIELD_REGEN_DELAY = 2.0;
const SHIELD_REGEN_RATE = 30;
const LIFE_MAX = 100;
const LIFESTEAL_MG = 0.10;
const LIFESTEAL_SHOTGUN = 0.25;
const LIFESTEAL_DASH = 0.40;
```

## Milestone 1 Checklist

- [ ] Canvas setup and game loop at 60 FPS
- [ ] Player movement (WASD)
- [ ] Camera scrolling
- [ ] Machine gun fire (hold Space)
- [ ] Shotgun blast (release Space)
- [ ] Charge meter UI
- [ ] Dash (Shift) consuming charge
- [ ] Shield and life bars
- [ ] Lifesteal on damage
- [ ] One enemy type (Drifter)
- [ ] Enemy bullets
- [ ] Collision detection
- [ ] Screen shake
- [ ] Hit stop
- [ ] Basic particles
- [ ] Death and restart

## Common Tasks

### Adding a new enemy type
1. Add to `enemies.js` with `update()` and `render()` methods
2. Define behavior pattern and health
3. Add spawn logic to wave system
4. Test damage/collision interactions

### Tuning game feel
1. Adjust constants at top of relevant file
2. Test in browser with F5
3. Use console.log for debugging values
4. Screen shake multiplier in `utils.js`

### Adding visual effects
1. Add to `particles.js`
2. Use simple shapes (circles, lines)
3. Short lifetimes (0.1-0.5s typically)
4. Spawn generously, performance later

## Debug Helpers

```javascript
// Add to game.js for testing
const DEBUG = {
    invincible: false,
    infiniteCharge: false,
    showHitboxes: false,
    spawnRate: 1.0
};

// Press keys to toggle
if (key === 'i') DEBUG.invincible = !DEBUG.invincible;
if (key === 'c') DEBUG.infiniteCharge = !DEBUG.infiniteCharge;
if (key === 'h') DEBUG.showHitboxes = !DEBUG.showHitboxes;
```

## Questions Resolved

- **Dash input**: Double-tap direction (W W, D D, etc.) - no dedicated button
- **Shotgun threshold**: Auto-fires on ANY release (even minimal charge = weak blast)
- **Friendly fire**: OFF - players cannot damage each other

## Notes for Claude

When implementing:
- Start with player movement feeling good before adding combat
- Get one enemy working before adding variety
- Screen shake and hit stop make everything feel better - add early
- If something isn't fun, change the numbers before changing the system
- Console errors are fine during iteration, crashes are not
