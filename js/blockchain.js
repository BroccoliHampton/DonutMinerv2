// js/blockchain.js
import * as State from './state.js';
import * as UI from './ui.js';
import * as Scene from './scene.js';
import * as WalletProvider from './walletProvider.js';

// =================================================================
// CONFIGURATION
// =================================================================
const API_BASE_URL = 'https://last-game-kappa.vercel.app';
const REFRESH_INTERVAL = 10000;
const MULTICALL_ADDRESS = '0xe03a89eb8b75d73Caf762a81dA260106fD42F18A';
const LP_TOKEN_ADDRESS = '0xc3b9bd6f7d4bfcc22696a7bc1cc83948a33d7fab';

// Caching the DOM object when the app initializes
let dom;

// =================================================================
// PRIVATE HELPERS
// =================================================================

/**
 * Sends a transaction with retry logic.
 */
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
 * Gets the user's wallet address from the wallet provider.
 */
async function getUserAddress() {
    try {
        console.log('[Blockchain] Getting user address...');
        
        const address = await WalletProvider.getAddress();
        
        if (address) {
            State.blockchainData.userAddress = address;
            console.log('[Blockchain] User address:', address);
            
            // Try to get Farcaster context if available
            const farcasterContext = await WalletProvider.getFarcasterContext();
            if (farcasterContext && farcasterContext.user) {
                State.blockchainData.fid = farcasterContext.user.fid;
                console.log('[Blockchain] FID:', State.blockchainData.fid);
            }
            
            // Update profile name display
            if (dom.profileName) {
                const walletType = WalletProvider.getWalletType();
                const walletLabel = walletType === 'metamask' ? ' 🦊' : '';
                dom.profileName.textContent = `${address.slice(0, 6)}...${address.slice(-4)}${walletLabel}`;
            }
            
            return address;
        }
        
        // If no address, check if we need manual connection
        if (WalletProvider.needsManualConnection()) {
            console.log('[Blockchain] Wallet needs manual connection');
            if (dom.profileName) {
                dom.profileName.textContent = 'Connect Wallet';
            }
            if (dom.connectWalletButton) {
                dom.connectWalletButton.classList.remove('hidden');
            }
        } else {
            if (dom.profileName) {
                dom.profileName.textContent = 'No Wallet';
            }
        }
        
        return null;
    } catch (error) {
        console.log('[Blockchain] Could not get address:', error.message);
        if (dom.profileName) {
            dom.profileName.textContent = 'Error';
        }
        return null;
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
    dom = domElements; // Cache the DOM for other functions in this module
    
    // Initialize wallet provider
    const walletInit = await WalletProvider.initializeWallet();
    console.log('[Init] Wallet initialization result:', walletInit);
    
    // Get user address (will show connect button if needed)
    const userAddress = await getUserAddress();
    
    // Fetch initial game state
    await fetchGameState(userAddress);
    
    // Set up auto-refresh
    setInterval(() => {
        console.log('[Init] Auto-refreshing...');
        fetchGameState(State.blockchainData.userAddress);
    }, REFRESH_INTERVAL);
    
    console.log('[Init] Application complete!');
}

/**
 * Public handler for connecting MetaMask wallet (browser mode only)
 */
export async function handleConnectWallet() {
    console.log('[Blockchain] Connect wallet clicked');
    
    try {
        const address = await WalletProvider.connectMetaMask();
        
        if (address) {
            State.blockchainData.userAddress = address;
            
            // Update UI
            if (dom.profileName) {
                dom.profileName.textContent = `${address.slice(0, 6)}...${address.slice(-4)} 🦊`;
            }
            if (dom.connectWalletButton) {
                dom.connectWalletButton.classList.add('hidden');
            }
            
            // Fetch game state with new address
            await fetchGameState(address);
            
            console.log('[Blockchain] Wallet connected successfully');
        }
    } catch (error) {
        console.error('[Blockchain] Failed to connect wallet:', error);
        alert('Failed to connect wallet. Please make sure MetaMask is installed and try again.');
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
