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
    return typeof window !== 'undefined' && (
        window.location !== window.parent.location || // Running in iframe
        navigator.userAgent.includes('Farcaster') ||
        window.name === 'farcaster'
    );
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
    
    // Try Farcaster first if we're in that environment
    if (isFarcasterEnvironment()) {
        try {
            await FarcasterSDK.actions.ready();
            ethereumProvider = await FarcasterSDK.wallet.getEthereumProvider();
            if (ethereumProvider) {
                currentWalletType = WALLET_TYPES.FARCASTER;
                console.log('[WalletProvider] Farcaster wallet initialized');
                return { type: WALLET_TYPES.FARCASTER, success: true };
            }
        } catch (error) {
            console.log('[WalletProvider] Farcaster init failed:', error.message);
        }
    }
    
    // Fall back to MetaMask if available
    if (isMetaMaskAvailable()) {
        ethereumProvider = window.ethereum;
        currentWalletType = WALLET_TYPES.METAMASK;
        console.log('[WalletProvider] MetaMask detected (not connected yet)');
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
    
    try {
        // For Farcaster, get the address
        if (currentWalletType === WALLET_TYPES.FARCASTER) {
            const accounts = await ethereumProvider.request({ 
                method: 'eth_requestAccounts' 
            });
            currentAddress = accounts[0];
            console.log('[WalletProvider] Farcaster address:', currentAddress);
            return currentAddress;
        }
        
        // For MetaMask, return cached address (already connected via connectMetaMask)
        if (currentWalletType === WALLET_TYPES.METAMASK) {
            if (!currentAddress) {
                // Try to get accounts without prompting
                const accounts = await ethereumProvider.request({ 
                    method: 'eth_accounts' 
                });
                if (accounts && accounts.length > 0) {
                    currentAddress = accounts[0];
                }
            }
            console.log('[WalletProvider] MetaMask address:', currentAddress);
            return currentAddress;
        }
        
        return null;
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
