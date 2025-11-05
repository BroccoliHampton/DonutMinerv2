// Import modules
import * as State from './js/state.js';
import * as UI from './js/ui.js';
import * as Audio from './js/audio.js';
import * as Scene from './js/scene.js'; // NEW

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
        Scene.setDonutSpinSpeed(0.5); // NEW
        
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
        Scene.setDonutSpinSpeed(0.5); // NEW
        
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
    // 3D SCENE
    // =============================================================
    // -- This entire block has been moved to js/scene.js --
    // =============================================================

    // =============================================================
    // INITIALIZATION
    // =============================================================
    
    dom.glazery.actionButton.onclick = handleGlazeClick;
    
    if (dom.glazery.blazeActionButton) {
        dom.glazery.blazeActionButton.onclick = handleBlazeClick;
    }

    if (dom.glazery.toggleButton) {
        // UPDATED: Pass the composer from the Scene module to the UI function
        dom.glazery.toggleButton.onclick = () => UI.toggleView(dom, Audio.playSoundEffect, Scene.getComposer());
    }

    dom.musicToggleButton.onclick = () => Audio.toggleMusic(dom);
    dom.sfxToggleButton.onclick = () => Audio.toggleSfx(dom);
    
    dom.darkModeToggleButton.onclick = () => UI.toggleDarkMode(dom, Audio.playSoundEffect);
    
    // UPDATED: Call Scene module functions
    dom.glazery.glazeColorButton.onclick = () => {
        Audio.playSoundEffect('crunch');
        Scene.changeGlazeColor();
    };
    dom.glazery.sprinkleColorButton.onclick = () => {
        Audio.playSoundEffect('crunch');
        Scene.changeSprinkleColor();
    };
    dom.glazery.donutBaseColorButton.onclick = () => {
        Audio.playSoundEffect('crunch');
        Scene.changeDonutBaseColor();
    };

    dom.infoButton.onclick = () => UI.showInfoModal(dom, Audio.playSoundEffect);
    dom.infoModalClose.onclick = () => UI.hideInfoModal(dom);
    dom.infoModalOverlay.onclick = () => UI.hideInfoModal(dom);

    // This listener is part of the scene, so it was moved to js/scene.js
    // dom.glazery.zoomSlider.oninput = () => { ... };

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
    Scene.initThreeJS(dom); // NEW
    Scene.animate(); // NEW
    init(); // This will fetch the blockchain data
});
