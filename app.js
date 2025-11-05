// NEW: Farcaster SDK is imported at the top level
import FarcasterSDK from 'https://esm.sh/@farcaster/miniapp-sdk';

// =================================================================
// BLOCKCHAIN CONFIGURATION
// =================================================================
// =================================================================
// CONFIGURATION
// =================================================================
const API_BASE_URL = 'https://last-game-kappa.vercel.app';
const REFRESH_INTERVAL = 10000; // 10 seconds

// CONTRACT ADDRESSES - UPDATED FOR NEW MULTICALL
const MULTICALL_ADDRESS = '0xe03a89eb8b75d73Caf762a81dA260106fD42F18A';
const LP_TOKEN_ADDRESS = '0xc3b9bd6f7d4bfcc22696a7bc1cc83948a33d7fab';

// =================================================================
// BLOCKCHAIN STATE  
// =================================================================
let blockchainData = {
    currentMiner: null,
    price: '0',
    priceInEth: '0.0',
    currentDps: '0',
    currentDpsFormatted: '0',
    userDonutBalance: '0',
    userDonutBalanceFormatted: '0',
    userEthBalance: '0',
    userEthBalanceFormatted: '0',
    claimableDonuts: '0',
    claimableDonutsFormatted: '0',
    totalDonutSupply: '0',
    totalDonutSupplyFormatted: '0',
    timeAsMiner: 0,
    secondsUntilHalving: 0,
    userAddress: null,
    fid: null,
    // NEW: Blaze state
    blaze: {
        epochId: 0,
        price: '0',
        priceFormatted: '0',
        wethBalance: '0',
        wethBalanceFormatted: '0',
        userLpBalance: '0',
        userLpBalanceFormatted: '0',
        paymentToken: null,
        userNeedsApproval: true
    }
};

// =================================================================
// FARCASTER SDK INITIALIZATION (FIX 1: EARLY STARTUP)
// =================================================================
// (FarcasterSDK is already imported at the top of the file)

async function initSDK() {
    try {
        // CRITICAL: Call ready() immediately to clear the splash screen
        await FarcasterSDK.actions.ready();
        console.log('[SDK] Farcaster SDK initialized and ready.');
    } catch (e) {
        console.error('[SDK] Failed to initialize Farcaster SDK:', e.message);
    }
}

// =================================================================
// TRANSACTION RETRY HELPER (FIX 2: WALLET LATENCY)
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
            
            return txHash; // Success! Return hash.

        } catch (error) {
            // Only retry on communication/timeout errors, otherwise assume contract revert/user rejection
            const isRetryable = error.message.includes('timeout') || error.message.includes('Queue is full') || error.message.includes('JSON RPC');

            if (!isRetryable || i === maxAttempts - 1) {
                console.error('[Blockchain] Transaction failed permanently or non-retryable error:', error.message);
                // Using console.log instead of alert (prevents sandboxed modal error)
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
    // UI STATE (Non-blockchain)
    // =============================================================
    
    const state = {
        ui: {
            isDarkMode: false,
            isSfxMuted: false,
            isGlazeView: true, // NEW: Start on Glaze view
        }
    };

    // =============================================================
    // DOM ELEMENTS (Updated to include new Blaze and Toggle elements)
    // =============================================================
    const dom = {
        glazery: {
            kingStatus: document.getElementById('bakery-king-status'),
            cps: document.getElementById('bakery-cps'),
            baked: document.getElementById('bakery-baked'),
            actionButton: document.getElementById('bakery-action-button'),
            canvas: document.getElementById('cookie-canvas'),
            rainContainer: document.getElementById('cookie-rain-container'),
            glazeColorButton: document.getElementById('glaze-color-button'),
            sprinkleColorButton: document.getElementById('sprinkle-color-button'),
            donutBaseColorButton: document.getElementById('donut-base-color-button'),
            zoomSlider: document.getElementById('glazery-zoom-slider'),
            donutBalance: document.getElementById('player-donut-balance'),
            glazePrice: document.getElementById('glaze-price-display'),
            availableBalance: document.getElementById('available-balance-display'),
            totalSupply: document.getElementById('total-supply-display'),
            currentDps: document.getElementById('current-dps-display'),
            
            // NEW: Glaze/Blaze Toggle containers
            toggleButton: document.getElementById('view-toggle-button'), // NEW ELEMENT
            glazeContainer: document.getElementById('glaze-container'), // NEW ELEMENT
            blazeContainer: document.getElementById('blaze-container'), // NEW ELEMENT
            
            // NEW: Glaze DPS Element for height matching
            glazeDpsDisplay: document.getElementById('glaze-dps-display'), // NEW ELEMENT

            // NEW: Blaze elements
            blazePrice: document.getElementById('blaze-price-display'),
            blazeAvailableBalance: document.getElementById('blaze-available-balance-display'),
            blazeActionButton: document.getElementById('blaze-action-button'),
            blazeClaimAmount: document.getElementById('blaze-claim-amount'), // NEW ELEMENT
        },
        profileName: document.getElementById('player-profile-name'),
        musicToggleButton: document.getElementById('music-toggle-button'),
        sfxToggleButton: document.getElementById('sfx-toggle-button'),
        darkModeToggleButton: document.getElementById('dark-mode-toggle-button'),
        infoButton: document.getElementById('info-button'),
        infoModal: document.getElementById('info-modal'),
        infoModalOverlay: document.getElementById('info-modal-overlay'),
        infoModalClose: document.getElementById('info-modal-close'),
        modalInfo: {
            totalSupply: document.getElementById('modal-total-supply'),
            nextHalving: document.getElementById('modal-next-halving'),
            currentMiner: document.getElementById('modal-current-miner'),
        }
    };

    // =============================================================
    // HELPER FUNCTIONS (remains the same)
    // =============================================================

    const formatNumber = (num) => {
        const n = parseFloat(num);
        if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(2) + 'K';
        return n.toFixed(2);
    };
    
    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // =============================================================
    // BLOCKCHAIN FUNCTIONS
    // =============================================================
    
    async function getUserAddress() {
        try {
            console.log('[Blockchain] Getting user address...');
            
            if (!FarcasterSDK) throw new Error("SDK not initialized.");
            
            // Get FID from Farcaster context
            const context = await FarcasterSDK.context;
            if (context && context.user) {
                blockchainData.fid = context.user.fid;
                console.log('[Blockchain] FID:', blockchainData.fid);
            }
            
            const provider = await FarcasterSDK.wallet.getEthereumProvider();
            if (provider) {
                const accounts = await provider.request({ method: 'eth_requestAccounts' });
                const address = accounts[0];
                console.log('[Blockchain] User address:', address);
                blockchainData.userAddress = address;
                
                // Display shortened address
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
            
            // Update glazery state
            blockchainData = { ...blockchainData, ...data };
            
            // NEW: Update blaze state if available
            if (data.blaze) {
                blockchainData.blaze = {
                    epochId: data.blaze.epochId,
                    price: data.blaze.price,
                    priceFormatted: data.blaze.priceFormatted,
                    wethAccumulated: data.blaze.wethAccumulated,
                    wethAccumulatedFormatted: data.blaze.wethAccumulatedFormatted,
                    wethBalance: data.blaze.wethBalance,
                    wethBalanceFormatted: data.blaze.wethBalanceFormatted,
                    userLpBalance: data.blaze.userLpBalance,
                    userLpBalanceFormatted: data.blaze.userLpBalanceFormatted,
                    paymentToken: data.blaze.paymentToken,
                    paymentTokenPrice: data.blaze.paymentTokenPrice,
                    paymentTokenPriceFormatted: data.blaze.paymentTokenPriceFormatted,
                    userNeedsApproval: data.blaze.userNeedsApproval !== undefined ? data.blaze.userNeedsApproval : true
                };
                console.log('[Blockchain] Blaze data loaded:', blockchainData.blaze);
                console.log('[Blockchain] *** userNeedsApproval:', blockchainData.blaze.userNeedsApproval);
                console.log('[Blockchain] *** wethAccumulated (claimable):', blockchainData.blaze.wethAccumulatedFormatted);
            }
            
            // ** DEFENSIVE FIX: Wrap UI updates in a try/catch **
            try {
                updateUI();
                updateBlazeryUI(); // NEW: Update Blaze UI
            } catch (renderError) {
                console.error('[Rendering Error] Failed to update UI after fetch (WASM crash likely):', renderError.message);
                // Prevent the WASM crash from stopping the refresh loop
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
        donutSpinSpeed = 0.5;
        // Removed playSoundEffect('purchase')
        
        try {
            if (!FarcasterSDK) throw new Error("SDK not initialized.");
            
            console.log('[Blockchain] Fetching transaction data...');
            
            const address = blockchainData.userAddress; // User's wallet address
            
            if (!address) {
                console.log('Transaction failed: Please connect your wallet first'); // FIX 6
                return;
            }
            
            // 1. Fetch transaction data from your API
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
                from: address, // Ensure the 'from' address is always set
                to: txData.params.to,
                data: txData.params.data,
                value: txData.params.value, 
            }];

            // 2. Use retry function for reliability (FIX 2)
            const txHash = await sendTxWithRetry(provider, txParams);
            
            console.log('[Blockchain] Transaction sent:', txHash);
            
            // alert replaced with console.log (FIX 6)
            console.log('Transaction submitted! Refreshing game state...'); 
            
            setTimeout(() => {
                console.log('[Blockchain] Refreshing after transaction...');
                fetchGameState(blockchainData.userAddress);
            }, 3000);
            
        } catch (error) {
            console.error('[Blockchain] Transaction error:', error);
            // alert replaced with console.log (FIX 6)
            console.log(`Transaction failed: ${error.message}`); 
        }
    }
    
    function handleGlazeClick() {
        console.log('[Blockchain] Glaze button clicked');
        
        // *** REMOVED THE USER IS MINER CHECK (FIX 5) ***
        
        // Removed playSoundEffect('purchase');
        
        // Always open the glaze frame to initiate a transaction
        openGlazeFrame();
    }

    // NEW: Handle Blaze/Buy click - works like Glaze (direct transaction)
    async function handleBlazeClick() {
        console.log('[Blaze] Blaze button clicked');
        // Removed playSoundEffect('purchase');
        donutSpinSpeed = 0.5; // Spin the donut
        
        try {
            if (!FarcasterSDK) throw new Error("SDK not initialized.");
            
            const address = blockchainData.userAddress;
            
            if (!address) {
                console.log('[Blaze] No wallet connected');
                return;
            }
            
            // Check if user needs approval first
            if (blockchainData.blaze.userNeedsApproval) {
                console.log('[Blaze] Needs approval - calling approve transaction');
                await sendApprovalTransaction(address);
                return;
            }
            
            // Check if user has enough LP tokens
            const lpBalance = parseFloat(blockchainData.blaze.userLpBalanceFormatted);
            const lpNeeded = parseFloat(blockchainData.blaze.priceFormatted); // FIXED: Use already-formatted price from API
            
            if (lpBalance < lpNeeded) {
                console.log('[Blaze] Insufficient LP balance');
                console.log(`Need ${lpNeeded.toFixed(4)} LP but only have ${lpBalance.toFixed(4)} LP`);
                // Consider playing a negative SFX or showing an error message to the user
                return;
            }
            
            // All checks passed - send buy transaction
            console.log('[Blaze] Sending buy transaction...');
            await sendBuyTransaction(address);
            
        } catch (error) {
            console.error('[Blaze] Error:', error);
        }
    }
    
    // NEW: Send LP token approval transaction
    async function sendApprovalTransaction(address) {
        try {
            console.log('[Blaze] Fetching approval transaction data...');
            
            // Fetch approval transaction data from API
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
            
            // Update approval status optimistically
            blockchainData.blaze.userNeedsApproval = false;
            updateBlazeryUI();
            
            // Refresh state after approval
            setTimeout(() => {
                console.log('[Blaze] Refreshing after approval...');
                fetchGameState(blockchainData.userAddress);
            }, 3000);
            
        } catch (error) {
            console.error('[Blaze] Approval error:', error);
            console.log(`Approval failed: ${error.message}`);
        }
    }
    
    // NEW: Send buy transaction (uses LP tokens to get ETH)
    async function sendBuyTransaction(address) {
        try {
            console.log('[Blaze] Fetching buy transaction data...');
            
            // Fetch buy transaction data from API
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
            
            // Refresh state after transaction
            setTimeout(() => {
                console.log('[Blaze] Refreshing after buy...');
                fetchGameState(blockchainData.userAddress);
            }, 3000);
            
        } catch (error) {
            console.error('[Blaze] Buy transaction error:', error);
            console.log(`Buy transaction failed: ${error.message}`);
        }
    }
    
    // NEW: Update Blaze UI elements
    function updateBlazeryUI() {
        if (!blockchainData.blaze) {
            console.log('[Blaze] No blaze data available');
            return;
        }
        
        console.log('[Blaze] Updating UI');
        
        const userNeedsApproval = blockchainData.blaze.userNeedsApproval;
        const blazeButton = dom.glazery.blazeActionButton;
        
        // Update LP price (what user pays)
        if (dom.glazery.blazePrice) {
            const lpAmount = parseFloat(blockchainData.blaze.priceFormatted);
            dom.glazery.blazePrice.textContent = lpAmount.toFixed(4);
        }
        
        // Update claimable ETH (what user gets from auction)
        if (dom.glazery.blazeClaimAmount) {
            const ethAmount = parseFloat(blockchainData.blaze.wethAccumulatedFormatted);
            dom.glazery.blazeClaimAmount.textContent = `${ethAmount.toFixed(6)} ETH`; 
        }
        
        // Update user's LP balance
        if (dom.glazery.blazeAvailableBalance) {
            const userLpBalance = parseFloat(blockchainData.blaze.userLpBalanceFormatted);
            dom.glazery.blazeAvailableBalance.textContent = `${userLpBalance.toFixed(4)} LP available`;
        }
        
        // *** CRITICAL BUTTON LOGIC FIX ***
        if (blazeButton) {
            if (userNeedsApproval) {
                blazeButton.textContent = 'Approve LP';
                blazeButton.disabled = false; // Always allow approval attempt
            } else {
                 // Check if user has enough LP tokens before enabling "Blaze"
                const lpBalance = parseFloat(blockchainData.blaze.userLpBalanceFormatted);
                const lpNeeded = parseFloat(blockchainData.blaze.priceFormatted);
                
                blazeButton.textContent = 'Blaze';
                blazeButton.disabled = lpBalance < lpNeeded;
            }
        }
        
        console.log('[Blaze] UI updated successfully');
    }

    function updateUI() {
        console.log('[Blockchain] Updating UI');
        
        // Check if user is miner
        const userIsMiner = blockchainData.userAddress && 
                           blockchainData.currentMiner && 
                           blockchainData.userAddress.toLowerCase() === blockchainData.currentMiner.toLowerCase();
        
        // --- KING GLAZER DISPLAY FIX (FIX 3) ---
       let kingGlazerDisplay;

        if (userIsMiner) {
            kingGlazerDisplay = 'You';
        } else if (blockchainData.currentMinerUsername) {
            // FIX: Display the fetched Farcaster username
            kingGlazerDisplay = `@${blockchainData.currentMinerUsername}`;
        } else if (blockchainData.currentMiner && blockchainData.currentMiner !== '0x0000000000000000000000000000000000000000') {
            // Fallback: Display the shortened address if username lookup fails
            const address = blockchainData.currentMiner;
            kingGlazerDisplay = `${address.slice(0, 6)}...${address.slice(-4)}`;
        } else {
            kingGlazerDisplay = 'None';
        }
        dom.glazery.kingStatus.textContent = kingGlazerDisplay;
        // --- END FIX 3 ---

        dom.glazery.cps.textContent = blockchainData.claimableDonutsFormatted ? formatNumber(blockchainData.claimableDonutsFormatted) : '0.00';
        dom.glazery.baked.textContent = formatTime(blockchainData.timeAsMiner || 0);
        
        // Glaze Price display (FIXED PRECISION)
        dom.glazery.glazePrice.textContent = `${parseFloat(blockchainData.priceInEth || 0).toFixed(6)} ETH`;
        
        // Available Balance display (FIXED PRECISION & UNIT - FIX 4)
        dom.glazery.availableBalance.textContent = `${parseFloat(blockchainData.userEthBalanceFormatted || 0).toFixed(4)} ETH available`;
        // NEW: Update Blaze Available Balance (LP label)
        if (dom.glazery.blazeAvailableBalance) {
             dom.glazery.blazeAvailableBalance.textContent = `${parseFloat(blockchainData.blaze.userLpBalanceFormatted || 0).toFixed(4)} LP available`;
        }
        
        // NEW: Update Blaze Claim Amount (using actual blaze data)
        if (dom.glazery.blazeClaimAmount && blockchainData.blaze.wethAccumulatedFormatted) {
            const claimEth = parseFloat(blockchainData.blaze.wethAccumulatedFormatted);
            dom.glazery.blazeClaimAmount.textContent = `${claimEth.toFixed(6)} ETH`;
        }
        
        // === NEW: Update Glaze DPS Display for height matching ===
        if (dom.glazery.glazeDpsDisplay) {
             // Display the DPS from the blockchain data, formatted to 2 decimal places.
             dom.glazery.glazeDpsDisplay.textContent = parseFloat(blockchainData.currentDpsFormatted || 0).toFixed(2);
        }
        // =========================================================


        dom.glazery.donutBalance.textContent = `🍩 ${formatNumber(blockchainData.userDonutBalanceFormatted || 0)}`;
        dom.glazery.totalSupply.textContent = `🍩 ${formatNumber(blockchainData.totalDonutSupplyFormatted || 0)}`;
        // FIX: Use high precision (toFixed(2)) and force formatting without the helper's K/M logic.
        dom.glazery.currentDps.textContent = parseFloat(blockchainData.currentDpsFormatted || 0).toFixed(2);
        
        // Update button: Always set to Glaze (FIX 5)
        dom.glazery.actionButton.textContent = 'Glaze';
        
        // Update modal
        if (dom.modalInfo.totalSupply) {
            dom.modalInfo.totalSupply.textContent = `🍩 ${formatNumber(blockchainData.totalDonutSupplyFormatted || 0)}`;
            dom.modalInfo.nextHalving.textContent = formatTime(blockchainData.secondsUntilHalving || 0);
            
            const minerDisplay = blockchainData.currentMiner 
                ? `${blockchainData.currentMiner.slice(0, 6)}...${blockchainData.currentMiner.slice(-4)}`
                : 'None';
            dom.modalInfo.currentMiner.textContent = minerDisplay;
        }
    }

    // =============================================================
    // VIEW TOGGLE LOGIC (NEW FUNCTION)
    // =============================================================
    function toggleView() {
        playSoundEffect('crunch');
        state.ui.isGlazeView = !state.ui.isGlazeView;
        
        // NEW: Toggle the post-processing effect and CSS filter
        if (state.ui.isGlazeView) {
            dom.glazery.glazeContainer.classList.remove('hidden');
            dom.glazery.blazeContainer.classList.add('hidden');
            dom.glazery.toggleButton.textContent = '🧊'; // Ice cube for Glaze view
            dom.glazery.rainContainer.classList.remove('blaze-active');
            if (composer) {
                composer.enabled = false;
            }
        } else {
            dom.glazery.glazeContainer.classList.add('hidden');
            dom.glazery.blazeContainer.classList.remove('hidden');
            dom.glazery.toggleButton.textContent = '🔥'; // Flame for Blaze view
            dom.glazery.rainContainer.classList.add('blaze-active');
            if (composer) {
                composer.enabled = true;
            }
        }
    }


    // =============================================================
    // AUDIO SETUP (Tone.js) - FIXED BASS SYNC ISSUE
    // =============================================================
    let kick, hiHat, bass, melody;
    let kickSequence, hiHatSequence, bassSequence, melodySequence;
    let isMusicPlaying = false;
    let isAudioInitialized = false;
    let purchaseSound, cuteClickSound;

    function initAudio() {
        if (isAudioInitialized) return;

        Tone.Transport.bpm.value = 140;
        Tone.Transport.swing = 0.2;
        Tone.Transport.swingSubdivision = '8n';
        const limiter = new Tone.Limiter(-6).toDestination();

        kick = new Tone.MembraneSynth({
            pitchDecay: 0.01,
            octaves: 6,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.2 }
        }).connect(limiter);
        
        const kickPattern = ['C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'C2', null, null, null, 'GC5', null];
        
        kickSequence = new Tone.Sequence((time, note) => {
            if (note) kick.triggerAttackRelease(note, '8n', time);
        }, kickPattern, '8n');
        kickSequence.loop = true;

        hiHat = new Tone.NoiseSynth({
            noise: { type: 'white' },
            envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 }
        }).connect(limiter);

        const hiHatPattern = [null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'GTesting', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'GC5', null];

        hiHatSequence = new Tone.Sequence((time, note) => {
            if (note) hiHat.triggerAttackRelease('8n', time);
        }, hiHatPattern, '8n');
        hiHatSequence.loop = true;

        bass = new Tone.MonoSynth({
            oscillator: { type: 'sawtooth' },
            filter: { Q: 2, type: 'lowpass', cutoff: 400 },
            envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.5 }
        }).connect(limiter);

        // FIXED BASS PATTERN: 16 bars (128 steps) ensuring the harmonic change is on the downbeat of bar 5 and bar 9.
        const bassPattern = [
            'C2', null, 'G2', null, 'C2', null, 'G2', null, 'C2', null, 'G2', null, 'C2', null, 'G2', null, // Bar 1-2 (C minor)
            'C2', null, 'G2', null, 'C2', null, 'G2', null, 'C2', null, 'G2', null, 'C2', null, 'G2', null, // Bar 3-4 (C minor)
            
            'G#1', null, 'D#2', null, 'G#1', null, 'D#2', null, 'G#1', null, 'D#2', null, 'G#1', null, 'D#2', null, // Bar 5-6 (G# minor)
            'G#1', null, 'D#2', null, 'G#1', null, 'D#2', null, 'G#1', null, 'D#2', null, 'G#1', null, 'D#2', null, // Bar 7-8 (G# minor)

            'F1', null, 'C2', null, 'F1', null, 'C2', null, 'F1', null, 'C2', null, 'F1', null, 'C2', null, // Bar 9-10 (F minor)
            'F1', null, 'C2', null, 'F1', null, 'C2', null, 'F1', null, 'C2', null, 'F1', null, 'C2', null, // Bar 11-12 (F minor)

            'G1', null, 'D2', null, 'G1', null, 'D2', null, 'G1', null, 'D2', null, 'G1', null, 'D2', null, // Bar 13-14 (G minor)
            'G1', null, 'D2', null, 'G1', null, 'D2', null, 'G1', null, 'D2', null, 'G1', null, 'D2', null // Bar 15-16 (G minor - Loop Point)
        ];

        bassSequence = new Tone.Sequence((time, note) => {
            if (note) bass.triggerAttackRelease(note, '8n', time);
        }, bassPattern, '8n');
        bassSequence.loop = true;

        melody = new Tone.FMSynth({
            harmonicity: 3,
            modulationIndex: 10,
            oscillator: { type: 'sine' },
            envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.5 }
        }).connect(limiter);

        const melodyPattern = ['G4', 'A#4', 'C5', null, 'G4', 'D#4', null, null, 'G4', 'A#4', 'C5', null, 'D#5', 'C5', 'A#4', null, 'G4', 'A#4', 'C5', null, 'G4', 'D#4', null, null, 'G4', 'A#4', 'G4', 'D#4', 'C4', null, null, null, 'G#4', 'C5', 'D#5', null, 'C5', 'G#4', null, null, 'G#4', 'C5', 'D#5', null, 'F5', 'D#5', 'C5', null, 'G#4', 'C5', 'D#5', null, 'C5', 'G#4', null, null, 'C5', 'A#4', 'G#4', 'F4', 'D#4', null, null, null, 'F4', 'G#4', 'C5', null, 'G#4', 'F4', null, null, 'F4', 'G#4', 'C5', null, 'D#5', 'C5', 'G#4', null, 'F4', 'G#4', 'C5', null, 'G#4', 'F4', null, null, 'F4', 'G#4', 'F4', 'D#4', 'C4', null, null, null, 'G4', 'B4', 'D5', null, 'D5', 'B4', 'G4', null, 'G4', 'B4', 'D5', 'F5', 'D5', 'B4', 'G4', null, 'A#4', null, 'B4', null, 'C5', null, 'B4', 'A#4', 'G4', 'F4', 'D#4', 'D4', 'C4', null, null, null];
        
        melodySequence = new Tone.Sequence((time, note) => {
            if (note) melody.triggerAttackRelease(note, '8n', time);
        }, melodyPattern, '8n');
        melodySequence.loop = true;

        cuteClickSound = new Tone.FMSynth({
            oscillator: { type: 'sine' },
            envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.1 },
            harmonicity: 0.5,
            modulationIndex: 2
        }).connect(limiter);
        
        purchaseSound = new Tone.Synth({
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.2 }
        }).connect(limiter);

        isAudioInitialized = true;
    }

    function playSoundEffect(sound) {
        if (state.ui.isSfxMuted) return;

        if (Tone.context.state !== 'running') {
            Tone.start();
        }
        
        if (!isAudioInitialized) {
            initAudio();
        }
        
        const now = Tone.now(); 
        const offset = 0.001; // Added offset to prevent timing errors

        if (sound === 'crunch') {
            cuteClickSound.triggerAttackRelease('C6', '32n', now + offset);
        }
        if (sound === 'purchase') {
            purchaseSound.triggerAttackRelease('C5', '16n', now + offset);
            purchaseSound.triggerAttackRelease('E5', '16n', now + 0.05 + offset);
            purchaseSound.triggerAttackRelease('G5', '16n', now + 0.1 + offset);
        }
    }
    
    function toggleSfx() {
        state.ui.isSfxMuted = !state.ui.isSfxMuted;
        dom.sfxToggleButton.textContent = state.ui.isSfxMuted ? '🔇' : '🔊';
        if (!state.ui.isSfxMuted) {
            playSoundEffect('crunch');
        }
    }

    function toggleMusic() {
        if (Tone.context.state !== 'running') {
            Tone.start();
        }

        if (!isAudioInitialized) {
            initAudio();
        }

        if (isMusicPlaying) {
            Tone.Transport.stop();
            dom.musicToggleButton.textContent = '🔇';
        } else {
            Tone.Transport.start();
            if (kickSequence && kickSequence.state === 'stopped') kickSequence.start(0);
            if (hiHatSequence && hiHatSequence.state === 'stopped') hiHatSequence.start(0);
            if (bassSequence && bassSequence.state === 'stopped') bassSequence.start(0);
            if (melodySequence && melodySequence.state === 'stopped') melodySequence.start(0);
            dom.musicToggleButton.textContent = '🎵';
        }
        isMusicPlaying = !isMusicPlaying;
    }

    // =============================================================
    // DARK MODE TOGGLE
    // =============================================================
    function toggleDarkMode() {
        state.ui.isDarkMode = !state.ui.isDarkMode;
        const body = document.body;
        if (state.ui.isDarkMode) {
            body.classList.add('dark');
            dom.darkModeToggleButton.textContent = '☀️';
        } else {
            body.classList.remove('dark');
            dom.darkModeToggleButton.textContent = '🌙';
        }
    }

    // =============================================================
    // INFO MODAL
    // =============================================================
    function showInfoModal() {
        playSoundEffect('crunch');
        dom.infoModal.classList.remove('hidden');
        dom.infoModalOverlay.classList.remove('hidden');
    }

    function hideInfoModal() {
        dom.infoModal.classList.add('hidden');
        dom.infoModalOverlay.classList.add('hidden');
    }

    // =============================================================
    // 3D GLAZERY SETUP - START OF NEW/MODIFIED THREE.JS CODE
    // =============================================================

    let scene, camera, renderer, donutGroup, glazeMaterial, donutMaterial, sprinkleMeshes = [];
    let isDragging = false;
    let previousPointerX = 0;
    let previousPointerY = 0;
    let initialPinchDistance = 0;
    let currentCameraZ = 10;
    let isThreeJSInitialized = false; 
    let donutSpinSpeed = 0.005;

    // NEW: Post-processing variables
    let composer;
    let inversionPass;

    // NEW: Custom Negative/Blaze Shader
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
                
                // Invert Colors (Negative Effect)
                "vec3 inverted = vec3(1.0 - texel.r, 1.0 - texel.g, 1.0 - texel.b);",

                // Color Shift / Glitch (Subtle Eerie Hue)
                // Uses a small time-based shift on the green channel to make it feel unstable
                "float t = sin(time * 0.5) * 0.05 + 0.05;",
                "inverted.r = inverted.r * (1.0 - t * 0.5);",
                "inverted.g = inverted.g + t;",
                "inverted.b = inverted.b * (1.0 - t * 0.8);",

                // Apply Contrast boost to make it pop and look surreal
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

        // NEW: Initialize Post-processing (Composer)
        composer = new THREE.EffectComposer(renderer);
        composer.addPass(new THREE.RenderPass(scene, camera));

        // NEW: Add the custom negative shader pass (disabled initially)
        inversionPass = new THREE.ShaderPass(NegativeShader);
        composer.addPass(inversionPass);
        composer.enabled = false; // Start disabled

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
                // NEW: Update composer size on resize
                if (composer) {
                    composer.setSize(w, h);
                }
            }
        }
    }
    window.addEventListener('resize', onResize);

    let clock = new THREE.Clock(); // NEW: Clock for shader time uniform

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
            
            // ** CRITICAL: Render call inside a try/catch to isolate WASM issues **
            try {
                // MODIFIED: Use composer to render if enabled, otherwise use raw renderer
                if (composer && composer.enabled) {
                    // Update shader uniforms
                    inversionPass.uniforms[ 'time' ].value = clock.getElapsedTime();
                    composer.render();
                } else {
                    renderer.render(scene, camera);
                }
            } catch (e) {
                // This prevents the CanvasKit crash from stopping the entire animation frame loop
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
    
    // NEW: Add click handler for the new Blaze button
    if (dom.glazery.blazeActionButton) {
        dom.glazery.blazeActionButton.onclick = handleBlazeClick;
    }

    // NEW: Add click handler for the view toggle
    if (dom.glazery.toggleButton) {
        dom.glazery.toggleButton.onclick = toggleView;
    }

    dom.musicToggleButton.onclick = toggleMusic;
    dom.sfxToggleButton.onclick = toggleSfx;
    dom.darkModeToggleButton.onclick = () => {
        playSoundEffect('crunch');
        toggleDarkMode();
    };
    dom.glazery.glazeColorButton.onclick = () => {
        playSoundEffect('crunch');
        changeGlazeColor();
    };
    dom.glazery.sprinkleColorButton.onclick = () => {
        playSoundEffect('crunch');
        changeSprinkleColor();
    };
    dom.glazery.donutBaseColorButton.onclick = () => {
        playSoundEffect('crunch');
        changeDonutBaseColor();
    };

    dom.infoButton.onclick = showInfoModal;
    dom.infoModalClose.onclick = hideInfoModal;
    dom.infoModalOverlay.onclick = hideInfoModal;

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
        
        // Get user address
        const userAddress = await getUserAddress();
        
        // Fetch initial state
        await fetchGameState(userAddress);
        
        // Auto-refresh
        setInterval(() => {
            console.log('[Init] Auto-refreshing...');
            fetchGameState(blockchainData.userAddress);
        }, REFRESH_INTERVAL);
        
        console.log('[Init] Complete!');
    }
    
    // Start everything
    setTimeout(initThreeJS, 0);
    animate();
    init();
});
