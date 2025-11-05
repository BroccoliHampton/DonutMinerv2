// Import modules
import * as State from './js/state.js';
import * as UI from './js/ui.js';
import * as Audio from './js/audio.js'; // NEW

// Farcaster SDK is imported at the top level
import FarcasterSDK from 'https://esm.sh/@farcaster/miniapp-sdk';

// =================================================================
// BLOCKCHAIN CONFIGURATION
// =================================================================
const API_BASE_URL = 'https://last-game-kappa.vercel.app';
const REFRESH_INTERVAL = 10000;
const MULTICALL_ADDRESS = '0xe03a89eb8b75d73Caf762a81dA260106fD42F18A';
const LP_TOKEN_ADDRESS = '0xc3b9bd6f7d4bfcc22696a7bc1cc83948a33d7fab';

// =================================================================
// FARCASTER SDK INITIALIZATION
// =================================================================
async function initSDK() {
    try {
        await FarcasterSDK.actions.ready();
        console.log('[SDK] Farcaster SDK initialized and ready.');
    } catch (e) {
        console.error('[SDK] Failed to initialize Farcaster SDK:', e.message);
    }
}

// =================================================================
// TRANSACTION RETRY HELPER
// =================================================================
async function sendTxWithRetry(provider, txParams, maxAttempts = 3, delay = 500) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            if (i > 0) {
                console.log(`[Blockchain] Retrying transaction... Attempt ${i + 1}/${maxAttempts}`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            const txHash = await provider.request({
                method: 'eth_sendTransaction',
                params: txParams
            });
            
            return txHash;

        } catch (error) {
            const isRetryable = error.message.includes('timeout') || error.message.includes('Queue is full') || error.message.includes('JSON RPC');

            if (!isRetryable || i === maxAttempts - 1) {
                console.error('[Blockchain] Transaction failed permanently or non-retryable error:', error.message);
                console.log(`Transaction failed: ${error.message}`); 
                throw error;
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Farcaster SDK before anything else
    await initSDK(); 

    // =============================================================
    // DOM ELEMENTS
    // =============================================================
    const dom = UI.cacheDOMElements();

    // =============================================================
    // BLOCKCHAIN FUNCTIONS
    // =============================================================
    
    async function getUserAddress() {
        try {
            console.log('[Blockchain] Getting user address...');
            
            if (!FarcasterSDK) throw new Error("SDK not initialized.");
            
            const context = await FarcasterSDK.context;
            if (context && context.user) {
                State.blockchainData.fid = context.user.fid;
                console.log('[Blockchain] FID:', State.blockchainData.fid);
            }
            
            const provider = await FarcasterSDK.wallet.getEthereumProvider();
            if (provider) {
                const accounts = await provider.request({ method: 'eth_requestAccounts' });
                const address = accounts[0];
                console.log('[Blockchain] User address:', address);
                State.blockchainData.userAddress = address;
                
                if (dom.profileName) {
                    dom.profileName.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
                }
                
                return address;
            }
        } catch (error) {
            console.log('[Blockchain] Could not get address:', error.message);
        }
        
        if (dom.profileName) {
            dom.profileName.textContent = 'Not Connected';
        }
        return null;
    }

    async function fetchGameState(userAddress = null) {
        try {
            const url = userAddress 
                ? `${API_BASE_URL}/api/get-game-state?userAddress=${userAddress}`
                : `${API_BASE_URL}/api/get-game-state`;
            
            console.log('[Blockchain] Fetching:', url);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                mode: 'cors'
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            console.log('[Blockchain] Data received:', data);
            
            Object.assign(State.blockchainData, data);
            
            if (data.blaze) {
                Object.assign(State.blockchainData.blaze, data.blaze, {
                    userNeedsApproval: data.blaze.userNeedsApproval !== undefined ? data.blaze.userNeedsApproval : true
                });

                console.log('[Blockchain] Blaze data loaded:', State.blockchainData.blaze);
            }
            
            try {
                UI.updateUI(dom);
                UI.updateBlazeryUI(dom);
            } catch (renderError) {
                console.error('[Rendering Error] Failed to update UI after fetch (WASM crash likely):', renderError.message);
                return;
            }
            
            return data;
        } catch (error) {
            console.error('[Blockchain] Fetch error:', error);
            return null;
        }
    }

    async function openGlazeFrame() {
        console.log('[Blockchain] Starting transaction...');
        donutSpinSpeed = 0.5; // This variable is still global in app.js for now
        
        try {
            if (!FarcasterSDK) throw new Error("SDK not initialized.");
            
            console.log('[Blockchain] Fetching transaction data...');
            
            const address = State.blockchainData.userAddress;
            
            if (!address) {
                console.log('Transaction failed: Please connect your wallet first');
                return;
            }
            
            const txDataResponse = await fetch(`${API_BASE_URL}/api/transaction?player=${address}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                mode: 'cors'
            });
            
            if (!txDataResponse.ok) {
                const errorText = await txDataResponse.text();
                console.error('[Blockchain] Transaction API error:', errorText);
                throw new Error(`Failed to get transaction data: ${txDataResponse.status}`);
            }
            
            const txData = await txDataResponse.json();
            console.log('[Blockchain] Transaction data received:', txData);
            
            const provider = await FarcasterSDK.wallet.getEthereumProvider();
            
            if (!provider) {
                throw new Error('Wallet provider not available');
            }
            
            console.log('[Blockchain] Sending transaction...');
            
            const txParams = [{
                from: address,
                to: txData.params.to,
                data: txData.params.data,
                value: txData.params.value, 
            }];

            const txHash = await sendTxWithRetry(provider, txParams);
            
            console.log('[Blockchain] Transaction sent:', txHash);
            console.log('Transaction submitted! Refreshing game state...'); 
            
            setTimeout(() => {
                console.log('[Blockchain] Refreshing after transaction...');
                fetchGameState(State.blockchainData.userAddress);
            }, 3000);
            
        } catch (error) {
            console.error('[Blockchain] Transaction error:', error);
            console.log(`Transaction failed: ${error.message}`); 
        }
    }
    
    function handleGlazeClick() {
        console.log('[Blockchain] Glaze button clicked');
        openGlazeFrame();
    }

    async function handleBlazeClick() {
        console.log('[Blaze] Blaze button clicked');
        donutSpinSpeed = 0.5; // This variable is still global in app.js for now
        
        try {
            if (!FarcasterSDK) throw new Error("SDK not initialized.");
            
            const address = State.blockchainData.userAddress;
            
            if (!address) {
                console.log('[Blaze] No wallet connected');
                return;
            }
            
            if (State.blockchainData.blaze.userNeedsApproval) {
                console.log('[Blaze] Needs approval - calling approve transaction');
                await sendApprovalTransaction(address);
                return;
            }
            
            const lpBalance = parseFloat(State.blockchainData.blaze.userLpBalanceFormatted);
            const lpNeeded = parseFloat(State.blockchainData.blaze.priceFormatted);
            
            if (lpBalance < lpNeeded) {
                console.log('[Blaze] Insufficient LP balance');
                console.log(`Need ${lpNeeded.toFixed(4)} LP but only have ${lpBalance.toFixed(4)} LP`);
                return;
            }
            
            console.log('[Blaze] Sending buy transaction...');
            await sendBuyTransaction(address);
            
        } catch (error) {
            console.error('[Blaze] Error:', error);
        }
    }
    
    async function sendApprovalTransaction(address) {
        try {
            console.log('[Blaze] Fetching approval transaction data...');
            
            const approvalResponse = await fetch(`${API_BASE_URL}/api/approve-lp?player=${address}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                mode: 'cors'
            });
            
            if (!approvalResponse.ok) {
                throw new Error(`Failed to get approval data: ${approvalResponse.status}`);
            }
            
            const txData = await approvalResponse.json();
            console.log('[Blaze] Approval transaction data received:', txData);
            
            const provider = await FarcasterSDK.wallet.getEthereumProvider();
            
            if (!provider) {
                throw new Error('Wallet provider not available');
            }
            
            console.log('[Blaze] Sending approval transaction...');
            
            const txParams = [{
                from: address,
                to: txData.params.to,
                data: txData.params.data,
                value: txData.params.value || '0x0',
            }];
            
            const txHash = await sendTxWithRetry(provider, txParams);
            
            console.log('[Blaze] Approval transaction sent:', txHash);
            console.log('Approval submitted! Now you can Blaze.');
            
            State.blockchainData.blaze.userNeedsApproval = false;
            UI.updateBlazeryUI(dom);
            
            setTimeout(() => {
                console.log('[Blaze] Refreshing after approval...');
                fetchGameState(State.blockchainData.userAddress);
            }, 3000);
            
        } catch (error) {
            console.error('[Blaze] Approval error:', error);
            console.log(`Approval failed: ${error.message}`);
        }
    }
    
    async function sendBuyTransaction(address) {
        try {
            console.log('[Blaze] Fetching buy transaction data...');
            
            const buyResponse = await fetch(`${API_BASE_URL}/api/blaze-transaction?player=${address}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                mode: 'cors'
            });
            
            if (!buyResponse.ok) {
                throw new Error(`Failed to get buy transaction data: ${buyResponse.status}`);
            }
            
            const txData = await buyResponse.json();
            console.log('[Blaze] Buy transaction data received:', txData);
            
            const provider = await FarcasterSDK.wallet.getEthereumProvider();
            
            if (!provider) {
                throw new Error('Wallet provider not available');
            }
            
            console.log('[Blaze] Sending buy transaction...');
            
            const txParams = [{
                from: address,
                to: txData.params.to,
                data: txData.params.data,
                value: txData.params.value || '0x0',
            }];
            
            const txHash = await sendTxWithRetry(provider, txParams);
            
            console.log('[Blaze] Buy transaction sent:', txHash);
            console.log('Buy transaction submitted! You received ETH.');
            
            setTimeout(() => {
                console.log('[Blaze] Refreshing after buy...');
                fetchGameState(State.blockchainData.userAddress);
            }, 3000);
            
        } catch (error) {
            console.error('[Blaze] Buy transaction error:', error);
            console.log(`Buy transaction failed: ${error.message}`);
        }
    }

    // =============================================================
    // AUDIO SETUP
    // =============================================================
    // -- This entire block has been moved to js/audio.js --
    // =============================================================

    // =============================================================
    // 3D GLAZERY SETUP
    // =============================================================
    // (This is the next block to be moved)

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

    function initThreeJS() {
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

        dom.glazery.canvas.addEventListener('pointerdown', onPointerDown);
        dom.glazery.canvas.addEventListener('pointermove', onPointerMove);
        dom.glazery.canvas.addEventListener('pointerup', onPointerUp);
        dom.glazery.canvas.addEventListener('pointerleave', onPointerUp);
        dom.glazery.canvas.addEventListener('wheel', onMouseWheel, { passive: false });
        
        dom.glazery.zoomSlider.min = MIN_ZOOM_Z;
        dom.glazery.zoomSlider.max = MAX_ZOOM_Z;
        dom.glazery.zoomSlider.value = currentCameraZ;
        dom.glazery.zoomSlider.step = 0.1;

        isThreeJSInitialized = true; 
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

    // =============================================================
    // 3D CONTROLS & ANIMATION
    // =============================================================

    function onResize() {
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
    window.addEventListener('resize', onResize);

    let clock = new THREE.Clock(); 

    function animate() {
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
        dom.glazery.canvas.setPointerCapture(e.pointerId);
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
            dom.glazery.zoomSlider.value = newZ;

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
        dom.glazery.canvas.releasePointerCapture(e.pointerId);

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
        dom.glazery.zoomSlider.value = newZ;
        currentCameraZ = newZ;
    }

    function changeGlazeColor() {
        if (glazeMaterial) {
            currentGlazeColorIndex = (currentGlazeColorIndex + 1) % glazeColors.length;
            glazeMaterial.color.set(glazeColors[currentGlazeColorIndex]);
        }
    }

    function changeDonutBaseColor() {
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

    function changeSprinkleColor() {
        currentSprinkleColorSetIndex = (currentSprinkleColorSetIndex + 1) % sprinkleColorSets.length;
        createSprinkles();
    }

    // =============================================================
    // INITIALIZATION
    // =============================================================
    
    dom.glazery.actionButton.onclick = handleGlazeClick;
    
    if (dom.glazery.blazeActionButton) {
        dom.glazery.blazeActionButton.onclick = handleBlazeClick;
    }

    // UPDATED: Pass Audio.playSoundEffect to the UI function
    if (dom.glazery.toggleButton) {
        dom.glazery.toggleButton.onclick = () => UI.toggleView(dom, Audio.playSoundEffect, composer);
    }

    // UPDATED: Call Audio module functions
    dom.musicToggleButton.onclick = () => Audio.toggleMusic(dom);
    dom.sfxToggleButton.onclick = () => Audio.toggleSfx(dom);
    
    // UPDATED: Pass Audio.playSoundEffect to the UI function
    dom.darkModeToggleButton.onclick = () => UI.toggleDarkMode(dom, Audio.playSoundEffect);
    
    // UPDATED: Call Audio.playSoundEffect
    dom.glazery.glazeColorButton.onclick = () => {
        Audio.playSoundEffect('crunch');
        changeGlazeColor();
    };
    dom.glazery.sprinkleColorButton.onclick = () => {
        Audio.playSoundEffect('crunch');
        changeSprinkleColor();
    };
    dom.glazery.donutBaseColorButton.onclick = () => {
        Audio.playSoundEffect('crunch');
        changeDonutBaseColor();
    };

    // UPDATED: Pass Audio.playSoundEffect to the UI function
    dom.infoButton.onclick = () => UI.showInfoModal(dom, Audio.playSoundEffect);
    dom.infoModalClose.onclick = () => UI.hideInfoModal(dom);
    dom.infoModalOverlay.onclick = () => UI.hideInfoModal(dom);

    dom.glazery.zoomSlider.oninput = () => {
        if (!isThreeJSInitialized) return;
        const newZ = parseFloat(dom.glazery.zoomSlider.value);
        camera.position.z = newZ;
        camera.updateProjectionMatrix();
        currentCameraZ = newZ;
    };

    // Init blockchain
    async function init() {
        console.log('[Init] Starting...');
        
        const userAddress = await getUserAddress();
        
        await fetchGameState(userAddress);
        
        setInterval(() => {
            console.log('[Init] Auto-refreshing...');
            fetchGameState(State.blockchainData.userAddress);
        }, REFRESH_INTERVAL);
        
        console.log('[Init] Complete!');
    }
    
    // Start everything
    setTimeout(initThreeJS, 0);
    animate();
    init();
});
