// js/walletProvider.js
// Unified wallet provider that supports both Farcaster SDK and MetaMask

import FarcasterSDK from 'https://esm.sh/@farcaster/miniapp-sdk';

// Wallet types
const WALLET_TYPES = {
    FARCASTER: 'farcaster',
    METAMASK: 'metamask',
    NONE: 'none'
};

// Private state
let currentWalletType = WALLET_TYPES.NONE;
let ethereumProvider = null;
let currentAddress = null;

/**
 * Detects if we're running inside Farcaster
 */
function isFarcasterEnvironment() {
    // Check for Farcaster-specific indicators
    if (typeof window === 'undefined') return false;
    
    // Check multiple Farcaster indicators
    const isInIframe = window.location !== window.parent.location;
    const hasFarcasterUA = navigator.userAgent.includes('Farcaster');
    const hasFarcasterName = window.name === 'farcaster';
    
    // Check if the SDK is available (more reliable)
    const hasFarcasterSDK = typeof FarcasterSDK !== 'undefined';
    
    console.log('[WalletProvider] Environment checks:', {
        isInIframe,
        hasFarcasterUA,
        hasFarcasterName,
        hasFarcasterSDK
    });
    
    // If any Farcaster indicator is present, try Farcaster first
    return isInIframe || hasFarcasterUA || hasFarcasterName || hasFarcasterSDK;
}

/**
 * Checks if MetaMask is available
 */
function isMetaMaskAvailable() {
    return typeof window !== 'undefined' && 
           typeof window.ethereum !== 'undefined' && 
           window.ethereum.isMetaMask;
}

/**
 * Initialize the appropriate wallet based on environment
 */
export async function initializeWallet() {
    console.log('[WalletProvider] Initializing...');
    
    // Check for MetaMask availability first (for fallback)
    const hasMetaMask = isMetaMaskAvailable();
    
    if (hasMetaMask) {
        ethereumProvider = window.ethereum;
        currentWalletType = WALLET_TYPES.METAMASK;
        console.log('[WalletProvider] MetaMask available');
    }
    
    // Try Farcaster SDK in parallel (non-blocking)
    // This will succeed if in Farcaster frame, fail silently otherwise
    const tryFarcaster = async () => {
        try {
            console.log('[WalletProvider] Attempting Farcaster SDK initialization...');
            
            const farcasterInitPromise = Promise.race([
                (async () => {
                    await FarcasterSDK.actions.ready();
                    const provider = await FarcasterSDK.wallet.getEthereumProvider();
                    return provider;
                })(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Farcaster SDK timeout')), 2000)
                )
            ]);
            
            const farcasterProvider = await farcasterInitPromise;
            
            if (farcasterProvider) {
                // Farcaster succeeded! Override MetaMask
                ethereumProvider = farcasterProvider;
                currentWalletType = WALLET_TYPES.FARCASTER;
                console.log('[WalletProvider] Farcaster wallet initialized successfully');
                return true;
            }
        } catch (error) {
            console.log('[WalletProvider] Farcaster not available:', error.message);
        }
        return false;
    };
    
    // Try Farcaster
    const farcasterSuccess = await tryFarcaster();
    
    if (farcasterSuccess) {
        return { type: WALLET_TYPES.FARCASTER, success: true, autoConnected: true };
    }
    
    if (hasMetaMask) {
        return { type: WALLET_TYPES.METAMASK, success: true, needsConnection: true };
    }
    
    console.log('[WalletProvider] No wallet available');
    return { type: WALLET_TYPES.NONE, success: false };
}

/**
 * Connect to MetaMask (only needed for browser mode)
 */
export async function connectMetaMask() {
    if (currentWalletType !== WALLET_TYPES.METAMASK) {
        throw new Error('MetaMask not available');
    }
    
    try {
        console.log('[WalletProvider] Requesting MetaMask connection...');
        const accounts = await ethereumProvider.request({ 
            method: 'eth_requestAccounts' 
        });
        
        if (accounts && accounts.length > 0) {
            currentAddress = accounts[0];
            console.log('[WalletProvider] MetaMask connected:', currentAddress);
            
            // Listen for account changes
            ethereumProvider.on('accountsChanged', (accounts) => {
                if (accounts.length > 0) {
                    currentAddress = accounts[0];
                    console.log('[WalletProvider] Account changed:', currentAddress);
                    // Trigger a page reload to refresh game state
                    window.location.reload();
                } else {
                    currentAddress = null;
                    console.log('[WalletProvider] MetaMask disconnected');
                }
            });
            
            // Listen for chain changes
            ethereumProvider.on('chainChanged', () => {
                console.log('[WalletProvider] Chain changed, reloading...');
                window.location.reload();
            });
            
            return currentAddress;
        }
    } catch (error) {
        console.error('[WalletProvider] MetaMask connection failed:', error);
        throw error;
    }
}

/**
 * Get the user's wallet address
 */
export async function getAddress() {
    if (!ethereumProvider) {
        console.log('[WalletProvider] No provider available');
        return null;
    }
    
    // Check if provider has request method
    if (typeof ethereumProvider.request !== 'function') {
        console.log('[WalletProvider] Provider does not have request method');
        return null;
    }
    
    try {
        // For Farcaster, get the address
        if (currentWalletType === WALLET_TYPES.FARCASTER) {
            const accounts = await ethereumProvider.request({ 
                method: 'eth_requestAccounts' 
            });
            if (accounts && accounts.length > 0) {
                currentAddress = accounts[0];
                console.log('[WalletProvider] Farcaster address:', currentAddress);
                return currentAddress;
            }
        }
        
        // For MetaMask, return cached address or try to get it
        if (currentWalletType === WALLET_TYPES.METAMASK) {
            if (currentAddress) {
                // Already have cached address
                return currentAddress;
            }
            
            // Try to get accounts without prompting (eth_accounts doesn't trigger popup)
            try {
                const accounts = await ethereumProvider.request({ 
                    method: 'eth_accounts' 
                });
                if (accounts && accounts.length > 0) {
                    currentAddress = accounts[0];
                    console.log('[WalletProvider] MetaMask address (cached):', currentAddress);
                    return currentAddress;
                }
            } catch (err) {
                console.log('[WalletProvider] Could not get MetaMask accounts:', err.message);
            }
            
            // No cached address, user needs to connect manually
            console.log('[WalletProvider] MetaMask not connected yet');
            return null;
        }
        
        return null;
    } catch (error) {
        console.error('[WalletProvider] Failed to get address:', error);
        return null;
    }
}
    } catch (error) {
        console.error('[WalletProvider] Failed to get address:', error);
        return null;
    }
}

/**
 * Get the Farcaster user context (FID, username, etc.)
 */
export async function getFarcasterContext() {
    if (currentWalletType !== WALLET_TYPES.FARCASTER) {
        return null;
    }
    
    try {
        const context = await FarcasterSDK.context;
        return context;
    } catch (error) {
        console.log('[WalletProvider] Could not get Farcaster context:', error.message);
        return null;
    }
}

/**
 * Send a transaction
 */
export async function sendTransaction(txParams) {
    if (!ethereumProvider) {
        throw new Error('No wallet provider available');
    }
    
    if (!currentAddress) {
        throw new Error('Wallet not connected');
    }
    
    try {
        console.log('[WalletProvider] Sending transaction via', currentWalletType);
        
        const txHash = await ethereumProvider.request({
            method: 'eth_sendTransaction',
            params: [txParams]
        });
        
        console.log('[WalletProvider] Transaction sent:', txHash);
        return txHash;
    } catch (error) {
        console.error('[WalletProvider] Transaction failed:', error);
        throw error;
    }
}

/**
 * Get the current wallet type
 */
export function getWalletType() {
    return currentWalletType;
}

/**
 * Check if wallet is connected
 */
export function isConnected() {
    return currentAddress !== null;
}

/**
 * Get the current provider
 */
export function getProvider() {
    return ethereumProvider;
}

/**
 * Check if we need to show connect button (browser mode only)
 */
export function needsManualConnection() {
    return currentWalletType === WALLET_TYPES.METAMASK && !currentAddress;
}
