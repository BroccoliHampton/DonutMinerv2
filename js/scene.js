// js/scene.js

// --- Private Module Variables ---
let scene, camera, renderer, donutGroup, glazeMaterial, donutMaterial, sprinkleMeshes = [];
let isDragging = false;
let previousPointerX = 0;
let previousPointerY = 0;
let initialPinchDistance = 0;
let currentCameraZ = 10;
let isThreeJSInitialized = false; 
let donutSpinSpeed = 0.005;

let composer;
let inversionPass;
let clock = new THREE.Clock();

const NegativeShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "time":     { value: 0.0 }
    },
    vertexShader: [
        "varying vec2 vUv;",
        "void main() {",
            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
        "}"
    ].join( "\n" ),
    fragmentShader: [
        "uniform float time;",
        "uniform sampler2D tDiffuse;",
        "varying vec2 vUv;",
        "void main() {",
            "vec4 texel = texture2D( tDiffuse, vUv );",
            "vec3 inverted = vec3(1.0 - texel.r, 1.0 - texel.g, 1.0 - texel.b);",
            "float t = sin(time * 0.5) * 0.05 + 0.05;",
            "inverted.r = inverted.r * (1.0 - t * 0.5);",
            "inverted.g = inverted.g + t;",
            "inverted.b = inverted.b * (1.0 - t * 0.8);",
            "float contrast = 1.3;",
            "inverted = (inverted - 0.5) * contrast + 0.5;",
            "gl_FragColor = vec4(inverted, texel.a);",
        "}"
    ].join( "\n" )
};

const MIN_ZOOM_Z = 3;
const MAX_ZOOM_Z = 20;

const glazeColors = [
    0xFFC0CB, 0xADD8E6, 0x90EE90, 0xFFD700,
    0x800080, 0xFFF8DC, 0xFF0000, 0x000000
];
let currentGlazeColorIndex = 0;

const donutBaseColors = [
    0x5C3317, 0xDEB887, 0x3D2B1F, 0xF5DEB3, 0xFFC0CB, null
];
let currentDonutBaseColorIndex = 0;

const sprinkleColorSets = [
    [0xFF0000, 0xFF7F00, 0xFFFF00, 0x00FF00, 0x0000FF, 0x4B0082, 0x9400D3],
    [0xFFFFFF, 0xF0F0F0, 0xE0E0E0],
    [0x000000, 0x333333, 0x666666],
    [0xFFC0CB, 0xFF9AA2, 0xFFDDE1],
    [0x87CEEB, 0xADD8E6, 0xB0E0E6],
    [0xDAA520, 0xB8860B, 0xFFD700]
];
let currentSprinkleColorSetIndex = 0;

// --- Private Functions ---

function createCrackTexture(size = 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 15; i++) {
        ctx.beginPath();
        let startX = Math.random() * size;
        let startY = Math.random() * size;
        ctx.moveTo(startX, startY);
        let len = Math.random() * 60 + 30;
        let currentX = startX;
        let currentY = startY;
        for (let j = 0; j < 5; j++) {
             currentX += (Math.random() - 0.5) * len;
             currentY += (Math.random() - 0.5) * len;
             currentX = Math.max(0, Math.min(size, currentX));
             currentY = Math.max(0, Math.min(size, currentY));
            ctx.lineTo(currentX, currentY);
            len *= 0.8;
        }
        ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
}

function createSpeckleTexture(size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; 
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = Math.random() * 0.8 + 0.4;
        const alpha = Math.random() * 0.5 + 0.3;
        const shade = Math.floor(Math.random() * 40);
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`; 
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
}

function createSprinkles() {
    sprinkleMeshes.forEach(sprinkle => donutGroup.remove(sprinkle));
    sprinkleMeshes = [];

    const currentColors = sprinkleColorSets[currentSprinkleColorSetIndex];

    const sprinkleShape = new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8); 
    const numSprinkles = 800; 
    const R_sprinkle = 2.8; 
    const r_sprinkle = 1.3 * 0.9; 

    for (let i = 0; i < numSprinkles; i++) {
        const color = currentColors[Math.floor(Math.random() * currentColors.length)];
        const sprinkleMaterial = new THREE.MeshStandardMaterial({ color: color });
        const sprinkle = new THREE.Mesh(sprinkleShape, sprinkleMaterial);
        const u = Math.random() * 2 * Math.PI; 
        const v = Math.random() * 2 * Math.PI; 
        
        sprinkle.position.x = (R_sprinkle + r_sprinkle * Math.cos(u)) * Math.cos(v);
        sprinkle.position.y = (R_sprinkle + r_sprinkle * Math.cos(u)) * Math.sin(v);
        sprinkle.position.z = r_sprinkle * Math.sin(u);

        if (sprinkle.position.z < -0.2 * 1.3) { 
            continue; 
        }

        const centerOfTubeCrossSection = new THREE.Vector3(R_sprinkle * Math.cos(v), R_sprinkle * Math.sin(v), 0);
        const normal = new THREE.Vector3().subVectors(sprinkle.position, centerOfTubeCrossSection).normalize();
        sprinkle.position.addScaledVector(normal, 0.12); 
        sprinkle.lookAt(new THREE.Vector3().addVectors(sprinkle.position, normal));
        sprinkle.rotateX(Math.PI / 2); 
        sprinkle.rotation.z += Math.random() * Math.PI; 
        donutGroup.add(sprinkle);
        sprinkleMeshes.push(sprinkle);
    }
}

function onResize(dom) {
    if (renderer && camera && dom.glazery.rainContainer) {
        const container = dom.glazery.rainContainer;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
            if (composer) {
                composer.setSize(w, h);
            }
        }
    }
}

let pointers = [];

function getPinchDistance(e) {
    if (e.touches && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    return 0;
}

function onPointerDown(e) {
    pointers.push(e);
    if (pointers.length === 1) {
        isDragging = true;
        previousPointerX = e.clientX;
        previousPointerY = e.clientY;
    }
    e.target.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
    const index = pointers.findIndex(p => p.pointerId === e.pointerId);
    if (index > -1) {
        pointers[index] = e;
    }

    if (pointers.length === 2 && initialPinchDistance > 0) {
        const currentPinchDistance = getPinchDistance(e);
        if (currentPinchDistance === 0) return;
        
        const zoomFactor = initialPinchDistance / currentPinchDistance;
        let newZ = currentCameraZ * zoomFactor;
        
        newZ = Math.max(MIN_ZOOM_Z, Math.min(MAX_ZOOM_Z, newZ));
        camera.position.z = newZ;
        camera.updateProjectionMatrix();
        // This is the only DOM element the scene module needs to know about.
        document.getElementById('glazery-zoom-slider').value = newZ;

        initialPinchDistance = currentPinchDistance;
        currentCameraZ = newZ;

    }
    if (isDragging && pointers.length === 1) { 
        const deltaX = e.clientX - previousPointerX;
        const deltaY = e.clientY - previousPointerY;
        
        donutGroup.rotation.y += deltaX * 0.01;
        donutGroup.rotation.x += deltaY * 0.01;
        
        previousPointerX = e.clientX;
        previousPointerY = e.clientY;
    }
}

function onPointerUp(e) {
    pointers = pointers.filter(p => p.pointerId !== e.pointerId);
    e.target.releasePointerCapture(e.pointerId);

    if (isDragging && pointers.length === 0) {
        isDragging = false;
    }

    if (pointers.length < 2) {
        initialPinchDistance = 0;
    }
}

function onMouseWheel(e) {
    e.preventDefault();
    let newZ = currentCameraZ + e.deltaY * 0.02;
    newZ = Math.max(MIN_ZOOM_Z, Math.min(MAX_ZOOM_Z, newZ));
    camera.position.z = newZ;
    camera.updateProjectionMatrix();
    // This is the only DOM element the scene module needs to know about.
    document.getElementById('glazery-zoom-slider').value = newZ;
    currentCameraZ = newZ;
}

// --- Exported Functions ---

/**
 * Initializes the Three.js scene, camera, renderer, and donut.
 * @param {object} dom - The cached DOM elements object.
 */
export function initThreeJS(dom) {
    if (isThreeJSInitialized) return; 
    
    scene = new THREE.Scene();
    
    const container = dom.glazery.rainContainer;
    if (!container) return;
    const w = container.clientWidth || 300;
    const h = container.clientHeight || 300;

    camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    camera.position.z = currentCameraZ;

    if (!dom.glazery.canvas) return;
    renderer = new THREE.WebGLRenderer({ 
        canvas: dom.glazery.canvas,
        alpha: true
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);

    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));

    inversionPass = new THREE.ShaderPass(NegativeShader);
    composer.addPass(inversionPass);
    composer.enabled = false;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7); 
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    donutGroup = new THREE.Group();
    
    const donutGeometry = new THREE.TorusGeometry(2.8, 1.3, 32, 100);

    const crackTexture = createCrackTexture(1024);
    crackTexture.wrapS = crackTexture.wrapT = THREE.RepeatWrapping;
    crackTexture.repeat.set(1, 1);
    
    const speckleTexture = createSpeckleTexture(512);
    speckleTexture.wrapS = speckleTexture.wrapT = THREE.RepeatWrapping;
    speckleTexture.repeat.set(3, 3);

    donutMaterial = new THREE.MeshStandardMaterial({
        color: donutBaseColors[currentDonutBaseColorIndex],
        roughness: 0.8,
        metalness: 0.05,
        map: speckleTexture,
        bumpMap: crackTexture,
        bumpScale: 0.08
    });
    const donutBase = new THREE.Mesh(donutGeometry, donutMaterial);
    donutGroup.add(donutBase);

    const glazeRadius = 2.75; 
    const glazeTubeRadius = 1.35; 
    const radialSegments = 32; 
    const tubularSegments = 100;

    const glazeGeometry = new THREE.TorusGeometry(
        glazeRadius,
        glazeTubeRadius,
        radialSegments,
        tubularSegments
    );
    
    const positionAttribute = glazeGeometry.attributes.position;
    const tempVector = new THREE.Vector3();
    const irregularityFactor = 0.15; 
    const randomOffsets = new Array(tubularSegments).fill(0).map(() => Math.random() * irregularityFactor * 2 - irregularityFactor);

    for (let i = 0; i < positionAttribute.count; i++) {
        tempVector.fromBufferAttribute(positionAttribute, i);

        const x = tempVector.x;
        const y = tempVector.y;
        const z = tempVector.z;
        const r = Math.sqrt(x * x + y * y);
        const angleAroundDonut = Math.atan2(y, x); 
        const distFromGlazeMainRadius = Math.abs(r - glazeRadius);
        const isOuterEdge = distFromGlazeMainRadius < (glazeTubeRadius * 0.4) && r > glazeRadius; 
        const isBottomHalf = z < -0.4 * glazeTubeRadius; 
        const isInnerEdge = distFromGlazeMainRadius < (glazeTubeRadius * 0.4) && r < glazeRadius;

        if (isOuterEdge && isBottomHalf) {
            const segmentIndex = Math.floor((angleAroundDonut / (2 * Math.PI)) * tubularSegments + tubularSegments) % tubularSegments;
            const scallopMagnitude = 0.1 + (randomOffsets[segmentIndex] * 0.8 + 0.5) * 0.1; 
            const currentRadius = Math.sqrt(tempVector.x * tempVector.x + tempVector.y * tempVector.y);
            const normalizedX = tempVector.x / currentRadius;
            const normalizedY = tempVector.y / currentRadius;

            tempVector.x += normalizedX * scallopMagnitude;
            tempVector.y += normalizedY * scallopMagnitude;
            tempVector.z += scallopMagnitude * 0.5; 
            positionAttribute.setXYZ(i, tempVector.x, tempVector.y, tempVector.z);
        } else if (isInnerEdge) {
            if (tempVector.z < -0.1) { 
               tempVector.z = Math.min(tempVector.z + 0.1, 0); 
            }
            positionAttribute.setXYZ(i, tempVector.x, tempVector.y, tempVector.z);
        }
    }
    glazeGeometry.attributes.position.needsUpdate = true;
    glazeGeometry.computeVertexNormals(); 

    glazeMaterial = new THREE.MeshStandardMaterial({
        color: glazeColors[currentGlazeColorIndex],
        roughness: 0.2,  
        metalness: 0.1,  
        transparent: true,
        opacity: 0.85    
    });
    const glaze = new THREE.Mesh(glazeGeometry, glazeMaterial);
    glaze.position.z = 0.05; 
    donutGroup.add(glaze);

    createSprinkles();
    
    scene.add(donutGroup);

    // Add scene-specific listeners
    dom.glazery.canvas.addEventListener('pointerdown', onPointerDown);
    dom.glazery.canvas.addEventListener('pointermove', onPointerMove);
    dom.glazery.canvas.addEventListener('pointerup', onPointerUp);
    dom.glazery.canvas.addEventListener('pointerleave', onPointerUp);
    dom.glazery.canvas.addEventListener('wheel', onMouseWheel, { passive: false });
    
    dom.glazery.zoomSlider.min = MIN_ZOOM_Z;
    dom.glazery.zoomSlider.max = MAX_ZOOM_Z;
    dom.glazery.zoomSlider.value = currentCameraZ;
    dom.glazery.zoomSlider.step = 0.1;
    dom.glazery.zoomSlider.oninput = () => {
        if (!isThreeJSInitialized) return;
        const newZ = parseFloat(dom.glazery.zoomSlider.value);
        camera.position.z = newZ;
        camera.updateProjectionMatrix();
        currentCameraZ = newZ;
    };

    window.addEventListener('resize', () => onResize(dom));

    isThreeJSInitialized = true; 
}

/**
 * The main animation loop.
 */
export function animate() {
    requestAnimationFrame(animate);
    
    if (donutGroup && renderer) {
        donutGroup.rotation.y += donutSpinSpeed; 
        
        if (donutSpinSpeed > 0.005) {
            donutSpinSpeed *= 0.95;
            if (donutSpinSpeed < 0.006) {
                donutSpinSpeed = 0.005;
            }
        }
        
        try {
            if (composer && composer.enabled) {
                inversionPass.uniforms[ 'time' ].value = clock.getElapsedTime();
                composer.render();
            } else {
                renderer.render(scene, camera);
            }
        } catch (e) {
            console.error('[WASM Render Crash] Animation frame failed:', e.message);
        }
    }
}

/**
 * Changes the color of the donut's glaze.
 */
export function changeGlazeColor() {
    if (glazeMaterial) {
        currentGlazeColorIndex = (currentGlazeColorIndex + 1) % glazeColors.length;
        glazeMaterial.color.set(glazeColors[currentGlazeColorIndex]);
    }
}

/**
 * Changes the color/wireframe of the donut base.
 */
export function changeDonutBaseColor() {
    if (donutMaterial) {
        currentDonutBaseColorIndex = (currentDonutBaseColorIndex + 1) % donutBaseColors.length;
        const newColorOrMode = donutBaseColors[currentDonutBaseColorIndex];

        if (newColorOrMode === null) {
            donutMaterial.wireframe = true;
            donutMaterial.color.set(0xF5E6C1); 
        } else {
            donutMaterial.wireframe = false;
            donutMaterial.color.set(newColorOrMode);
        }
    }
}

/**
 * Re-generates the sprinkles with a new color set.
 */
export function changeSprinkleColor() {
    currentSprinkleColorSetIndex = (currentSprinkleColorSetIndex + 1) % sprinkleColorSets.length;
    createSprinkles();
}

/**
 * Sets the spin speed of the donut.
 * @param {number} speed - The new spin speed.
 */
export function setDonutSpinSpeed(speed) {
    donutSpinSpeed = speed;
}

/**
 * Returns the post-processing composer object.
 * @returns {THREE.EffectComposer} The composer.
 */
export function getComposer() {
    return composer;
}
