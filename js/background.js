// =============================================================================
// PARALLAX BACKGROUND SYSTEM
// =============================================================================

// Background configuration
const BG_CONFIG = {
    layers: [
        {
            // Layer 1 - Far background (slowest)
            speed: 0.1,  // 10% of camera speed
            elements: [
                { type: 'stars', count: 30, minSize: 1, maxSize: 2, color: '#333333', alpha: 0.6 }
            ]
        },
        {
            // Layer 2 - Far-mid background
            speed: 0.25,
            elements: [
                { type: 'stars', count: 40, minSize: 1.5, maxSize: 3, color: '#444444', alpha: 0.7 },
                { type: 'shapes', count: 8, minSize: 40, maxSize: 80, color: '#242424', alpha: 0.3 }
            ]
        },
        {
            // Layer 3 - Mid background
            speed: 0.45,
            elements: [
                { type: 'shapes', count: 12, minSize: 20, maxSize: 50, color: '#2a2a2a', alpha: 0.4 }
            ]
        },
        {
            // Layer 4 - Near background
            speed: 0.7,
            elements: [
                { type: 'stars', count: 50, minSize: 2, maxSize: 4, color: '#555555', alpha: 0.8 },
                { type: 'lines', count: 15, minLength: 50, maxLength: 150, thickness: 1, color: '#333333', alpha: 0.5 }
            ]
        },
        {
            // Layer 5 - Nearest background
            speed: 1.0,  // Matches camera speed
            elements: [
                { type: 'stars', count: 60, minSize: 2.5, maxSize: 5, color: '#666666', alpha: 0.9 },
                { type: 'shapes', count: 10, minSize: 15, maxSize: 40, color: '#353535', alpha: 0.5 }
            ]
        }
    ]
};

// Background layer state
const bgLayers = [];

// =============================================================================
// INITIALIZATION
// =============================================================================

function initBackground() {
    bgLayers.length = 0;

    BG_CONFIG.layers.forEach((layerConfig, index) => {
        const layer = {
            speed: layerConfig.speed,
            offset: 0,
            elements: [],
            config: layerConfig
        };

        // Generate static elements for this layer
        layerConfig.elements.forEach(elementConfig => {
            switch (elementConfig.type) {
                case 'stars':
                    generateStars(layer, elementConfig);
                    break;
                case 'shapes':
                    generateShapes(layer, elementConfig);
                    break;
                case 'lines':
                    generateLines(layer, elementConfig);
                    break;
                case 'grid':
                    // Grids are drawn procedurally, no generation needed
                    layer.elements.push({ type: 'grid', config: elementConfig });
                    break;
            }
        });

        bgLayers.push(layer);
    });
}

// =============================================================================
// ELEMENT GENERATION
// =============================================================================

function generateStars(layer, config) {
    const screenWidth = CONFIG.canvas.width;
    const screenHeight = CONFIG.canvas.height;
    const spawnWidth = screenWidth * 2; // Generate enough for initial view plus scroll

    for (let i = 0; i < config.count; i++) {
        layer.elements.push({
            type: 'star',
            x: Math.random() * spawnWidth,
            y: Math.random() * screenHeight,
            size: config.minSize + Math.random() * (config.maxSize - config.minSize),
            color: config.color,
            alpha: config.alpha * (0.7 + Math.random() * 0.3), // Slight variation
            twinkle: Math.random() * Math.PI * 2 // Phase offset for twinkling
        });
    }
}

function generateShapes(layer, config) {
    const screenWidth = CONFIG.canvas.width;
    const screenHeight = CONFIG.canvas.height;
    const spawnWidth = screenWidth * 2;

    for (let i = 0; i < config.count; i++) {
        const shapeType = Math.random() < 0.5 ? 'circle' : 'rect';
        const size = config.minSize + Math.random() * (config.maxSize - config.minSize);

        layer.elements.push({
            type: 'shape',
            shapeType: shapeType,
            x: Math.random() * spawnWidth,
            y: Math.random() * screenHeight,
            size: size,
            width: shapeType === 'rect' ? size * (0.5 + Math.random() * 1) : size,
            height: shapeType === 'rect' ? size * (0.5 + Math.random() * 1) : size,
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed: (Math.random() - 0.5) * 0.1, // Slow rotation
            color: config.color,
            alpha: config.alpha
        });
    }
}

function generateLines(layer, config) {
    const screenWidth = CONFIG.canvas.width;
    const screenHeight = CONFIG.canvas.height;
    const spawnWidth = screenWidth * 2;

    for (let i = 0; i < config.count; i++) {
        const length = config.minLength + Math.random() * (config.maxLength - config.minLength);
        const angle = (Math.random() - 0.5) * Math.PI * 0.5; // -45 to +45 degrees

        layer.elements.push({
            type: 'line',
            x: Math.random() * spawnWidth,
            y: Math.random() * screenHeight,
            length: length,
            angle: angle,
            thickness: config.thickness,
            color: config.color,
            alpha: config.alpha * (0.6 + Math.random() * 0.4)
        });
    }
}

// =============================================================================
// UPDATE
// =============================================================================

function updateBackground(dt, cameraScrollSpeed) {
    const screenWidth = CONFIG.canvas.width;
    const screenHeight = CONFIG.canvas.height;

    bgLayers.forEach((layer, layerIndex) => {
        // Update layer offset based on camera speed and layer speed multiplier
        layer.offset += cameraScrollSpeed * layer.speed * dt;

        // Update individual elements
        layer.elements.forEach(element => {
            // Update rotating shapes
            if (element.type === 'shape' && element.rotationSpeed) {
                element.rotation += element.rotationSpeed * dt;
            }

            // Wrap elements that scroll off screen to the right
            // This creates an infinite scrolling effect
            const wrapWidth = screenWidth * 1.5;
            const elementWorldX = element.x - layer.offset;

            if (elementWorldX < -screenWidth * 0.5) {
                // Element has scrolled off left side, move it to the right
                element.x += wrapWidth;
            }
        });

        // For layers with stars/shapes, occasionally spawn new elements on the right
        // to maintain density as we scroll
        if (Math.random() < 0.3 * dt * layer.speed) {
            const config = layer.config.elements.find(e => e.type === 'stars');
            if (config && layer.elements.filter(e => e.type === 'star').length < config.count) {
                layer.elements.push({
                    type: 'star',
                    x: layer.offset + screenWidth * 1.5,
                    y: Math.random() * screenHeight,
                    size: config.minSize + Math.random() * (config.maxSize - config.minSize),
                    color: config.color,
                    alpha: config.alpha * (0.7 + Math.random() * 0.3),
                    twinkle: Math.random() * Math.PI * 2
                });
            }
        }
    });
}

// =============================================================================
// RENDER
// =============================================================================

function renderBackground(ctx, cameraX) {
    const screenWidth = CONFIG.canvas.width;
    const screenHeight = CONFIG.canvas.height;

    // Render layers from back to front
    bgLayers.forEach((layer, index) => {
        ctx.save();

        // Each layer has its own parallax offset
        const layerOffset = layer.offset;

        layer.elements.forEach(element => {
            const elementX = element.x - layerOffset;

            // Only render if on screen (with some margin)
            if (elementX < -100 || elementX > screenWidth + 100) return;

            ctx.globalAlpha = element.alpha || 1;

            switch (element.type) {
                case 'star':
                    renderStar(ctx, element, elementX);
                    break;

                case 'shape':
                    renderShape(ctx, element, elementX);
                    break;

                case 'line':
                    renderLine(ctx, element, elementX);
                    break;

                case 'grid':
                    renderGrid(ctx, element.config, layerOffset, screenWidth, screenHeight);
                    break;
            }
        });

        ctx.restore();
    });
}

function renderStar(ctx, star, x) {
    // Twinkling effect
    const time = performance.now() * 0.001;
    const twinkle = Math.sin(time * 2 + star.twinkle) * 0.5 + 0.5;
    const brightness = 0.6 + twinkle * 0.4;

    ctx.fillStyle = star.color;
    ctx.globalAlpha = star.alpha * brightness;

    // Draw as circle
    ctx.beginPath();
    ctx.arc(x, star.y, star.size, 0, Math.PI * 2);
    ctx.fill();
}

function renderShape(ctx, shape, x) {
    ctx.fillStyle = shape.color;
    ctx.globalAlpha = shape.alpha;

    if (shape.shapeType === 'circle') {
        ctx.beginPath();
        ctx.arc(x, shape.y, shape.size / 2, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.save();
        ctx.translate(x, shape.y);
        ctx.rotate(shape.rotation);
        ctx.fillRect(-shape.width / 2, -shape.height / 2, shape.width, shape.height);
        ctx.restore();
    }
}

function renderLine(ctx, line, x) {
    ctx.strokeStyle = line.color;
    ctx.globalAlpha = line.alpha;
    ctx.lineWidth = line.thickness;

    const endX = x + Math.cos(line.angle) * line.length;
    const endY = line.y + Math.sin(line.angle) * line.length;

    ctx.beginPath();
    ctx.moveTo(x, line.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
}

function renderGrid(ctx, config, layerOffset, screenWidth, screenHeight) {
    ctx.strokeStyle = config.color;
    ctx.globalAlpha = config.alpha;
    ctx.lineWidth = config.thickness;

    const spacing = config.spacing;
    const startX = Math.floor(layerOffset / spacing) * spacing - layerOffset;

    // Vertical lines
    for (let x = startX; x < screenWidth; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, screenHeight);
        ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y < screenHeight; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(screenWidth, y);
        ctx.stroke();
    }
}
