// js/blockchain.js
import * as State from './state.js';
import * as UI from './ui.js';
import * as Scene from './scene.js';
import * as WalletProvider from './walletProvider.js';

const API_BASE_URL = 'https://last-game-kappa.vercel.app';
const REFRESH_INTERVAL = 10000;

// LP Token URL - Update this when you have the URL
// Example: 'https://app.uniswap.org/explore/pools/base/0xc3b9bd6f7d4bfcc22696a7bc1cc83948a33d7fab'
const LP_TOKEN_URL = '';

// Caching the DOM object when the app initializes
let dom;

// =================================================================
// PRIVATE HELPERS
// =================================================================

async function sendTxWithRetry(txParams, maxAttempts = 3, delay = 500) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            if (i > 0) {
                console.log(`[Blockchain] Retrying transaction... Attempt ${i + 1}/${maxAttempts}`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            
            const txHash = await WalletProvider.sendTransaction(txParams);
            return txHash;

        } catch (error) {
            const isRetryable = error.message.includes('timeout') || 
                               error.message.includes('Queue is full') || 
                               error.message.includes('JSON RPC');

            if (!isRetryable || i === maxAttempts - 1) {
                console.error('[Blockchain] Transaction failed permanently or non-retryable error:', error.message);
                console.log(`Transaction failed: ${error.message}`); 
                throw error;
            }
        }
    }
}

/**
 * Fetches the main game state from the API.
 */
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

/**
 * Prepares and sends the "Glaze" transaction.
 */
async function openGlazeFrame() {
    console.log('[Blockchain] Starting transaction...');
    Scene.setDonutSpinSpeed(0.5);
    
    try {
        const address = State.blockchainData.userAddress;
        
        if (!address) {
            console.log('Transaction failed: Please connect your wallet first');
            alert('Please connect your wallet first');
            return;
        }
        
        console.log('[Blockchain] Fetching transaction data...');
        
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
        
        console.log('[Blockchain] Sending transaction...');
        
        const txParams = {
            from: address,
            to: txData.params.to,
            data: txData.params.data,
            value: txData.params.value, 
        };

        const txHash = await sendTxWithRetry(txParams);
        
        console.log('[Blockchain] Transaction sent:', txHash);
        console.log('Transaction submitted! Refreshing game state...'); 
        
        setTimeout(() => {
            console.log('[Blockchain] Refreshing after transaction...');
            fetchGameState(State.blockchainData.userAddress);
        }, 3000);
        
    } catch (error) {
        console.error('[Blockchain] Transaction error:', error);
        console.log(`Transaction failed: ${error.message}`);
        alert(`Transaction failed: ${error.message}`);
    }
}

/**
 * Prepares and sends the LP approval transaction.
 */
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
        
        console.log('[Blaze] Sending approval transaction...');
        
        const txParams = {
            from: address,
            to: txData.params.to,
            data: txData.params.data,
            value: txData.params.value || '0x0',
        };
        
        const txHash = await sendTxWithRetry(txParams);
        
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
        alert(`Approval failed: ${error.message}`);
    }
}

/**
 * Prepares and sends the "Blaze" (buy) transaction.
 */
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
        
        console.log('[Blaze] Sending buy transaction...');
        
        const txParams = {
            from: address,
            to: txData.params.to,
            data: txData.params.data,
            value: txData.params.value || '0x0',
        };
        
        const txHash = await sendTxWithRetry(txParams);
        
        console.log('[Blaze] Buy transaction sent:', txHash);
        console.log('Buy transaction submitted! You received ETH.');
        
        setTimeout(() => {
            console.log('[Blaze] Refreshing after buy...');
            fetchGameState(State.blockchainData.userAddress);
        }, 3000);
        
    } catch (error) {
        console.error('[Blaze] Buy transaction error:', error);
        console.log(`Buy transaction failed: ${error.message}`);
        alert(`Buy transaction failed: ${error.message}`);
    }
}

// =================================================================
// EXPORTED FUNCTIONS
// =================================================================

/**
 * Main app initializer. Caches the DOM, inits wallet provider, gets user address,
 * fetches initial state, and sets up the auto-refresh interval.
 * @param {object} domElements - The cached DOM elements from UI.cacheDOMElements().
 */
export async function initApp(domElements) {
    console.log('[Init] Starting application...');
    dom = domElements;
    
    // Initialize wallet
    const result = await WalletProvider.initializeWallet();
    console.log('[Init] Wallet init:', result);
    
    if (result.connected) {
        // Farcaster auto-connected
        State.blockchainData.userAddress = result.address;
        
        // Update UI
        const walletLabel = result.type === 'farcaster' ? '' : ' 🦊';
        dom.profileName.textContent = `${result.address.slice(0, 6)}...${result.address.slice(-4)}${walletLabel}`;
        dom.connectWalletButton.classList.add('hidden');
        
        // Get Farcaster context if available
        const context = await WalletProvider.getFarcasterContext();
        if (context && context.user) {
            State.blockchainData.fid = context.user.fid;
        }
        
        // Fetch game state
        await fetchGameState(result.address);
    } else if (result.type === 'metamask') {
        // MetaMask available but not connected - show button
        dom.profileName.textContent = 'Not Connected';
        dom.connectWalletButton.classList.remove('hidden');
        
        // Fetch game state without address
        await fetchGameState(null);
    } else {
        // No wallet
        dom.profileName.textContent = 'No Wallet';
        dom.connectWalletButton.classList.add('hidden');
        
        // Fetch game state without address
        await fetchGameState(null);
    }
    
    // Set up auto-refresh
    setInterval(() => {
        console.log('[Init] Auto-refreshing...');
        fetchGameState(State.blockchainData.userAddress);
    }, REFRESH_INTERVAL);
    
    console.log('[Init] Application complete!');
}

export async function handleConnectWallet() {
    console.log('[Blockchain] Connect wallet clicked');
    
    try {
        const address = await WalletProvider.connectWallet();
        
        if (address) {
            State.blockchainData.userAddress = address;
            
            // Update UI
            dom.profileName.textContent = `${address.slice(0, 6)}...${address.slice(-4)} 🦊`;
            dom.connectWalletButton.classList.add('hidden');
            
            // Fetch game state
            await fetchGameState(address);
            
            console.log('[Blockchain] Wallet connected successfully');
        }
    } catch (error) {
        console.error('[Blockchain] Failed to connect:', error);
        alert('Failed to connect wallet. Please try again.');
    }
}

/**
 * Public handler for the Glaze button click.
 */
export function handleGlazeClick() {
    console.log('[Blockchain] Glaze button clicked');
    openGlazeFrame();
}

/**
 * Public handler for the Blaze button click.
 */
export async function handleBlazeClick() {
    console.log('[Blaze] Blaze button clicked');
    Scene.setDonutSpinSpeed(0.5);
    
    try {
        const address = State.blockchainData.userAddress;
        
        if (!address) {
            console.log('[Blaze] No wallet connected');
            alert('Please connect your wallet first');
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
            alert(`Insufficient LP balance. Need ${lpNeeded.toFixed(4)} LP but only have ${lpBalance.toFixed(4)} LP`);
            return;
        }
        
        console.log('[Blaze] Sending buy transaction...');
        await sendBuyTransaction(address);
        
    } catch (error) {
        console.error('[Blaze] Error:', error);
    }
}
