// js/walletProvider.js
// Simplified wallet provider

import FarcasterSDK from 'https://esm.sh/@farcaster/miniapp-sdk';

let provider = null;
let userAddress = null;
let walletType = 'none'; // 'farcaster', 'metamask', or 'none'

/**
 * Initialize wallet - try Farcaster, fall back to showing connect button for MetaMask
 */
export async function initializeWallet() {
    console.log('[Wallet] Initializing...');
    
    // Try Farcaster first (for frames)
    try {
        await FarcasterSDK.actions.ready({ timeout: 1000 });
        provider = await FarcasterSDK.wallet.getEthereumProvider();
        
        if (provider) {
            walletType = 'farcaster';
            console.log('[Wallet] Farcaster detected');
            
            // Get address automatically
            const accounts = await provider.request({ method: 'eth_requestAccounts' });
            if (accounts && accounts[0]) {
                userAddress = accounts[0];
                console.log('[Wallet] Farcaster connected:', userAddress);
                return { type: 'farcaster', address: userAddress, connected: true };
            }
        }
    } catch (err) {
        console.log('[Wallet] Farcaster not available:', err.message);
    }
    
    // Check for MetaMask
    if (window.ethereum) {
        provider = window.ethereum;
        walletType = 'metamask';
        console.log('[Wallet] MetaMask available, waiting for user to connect');
        return { type: 'metamask', address: null, connected: false };
    }
    
    console.log('[Wallet] No wallet found');
    return { type: 'none', address: null, connected: false };
}

/**
 * Connect MetaMask (called when user clicks button)
 */
export async function connectWallet() {
    console.log('[Wallet] Connect button clicked');
    
    if (!provider) {
        if (window.ethereum) {
            provider = window.ethereum;
            walletType = 'metamask';
        } else {
            throw new Error('No wallet available');
        }
    }
    
    try {
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        
        if (accounts && accounts[0]) {
            userAddress = accounts[0];
            console.log('[Wallet] Connected:', userAddress);
            
            // Listen for account changes
            provider.on('accountsChanged', (accounts) => {
                if (accounts[0]) {
                    console.log('[Wallet] Account changed, reloading...');
                    window.location.reload();
                }
            });
            
            // Listen for network changes
            provider.on('chainChanged', () => {
                console.log('[Wallet] Network changed, reloading...');
                window.location.reload();
            });
            
            return userAddress;
        }
    } catch (error) {
        console.error('[Wallet] Connection failed:', error);
        throw error;
    }
}

/**
 * Get current address
 */
export function getAddress() {
    return userAddress;
}

/**
 * Get wallet type
 */
export function getWalletType() {
    return walletType;
}

/**
 * Send a transaction
 */
export async function sendTransaction(txParams) {
    if (!provider) {
        throw new Error('No wallet connected');
    }
    
    const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [txParams]
    });
    
    return txHash;
}

/**
 * Get Farcaster context if available
 */
export async function getFarcasterContext() {
    if (walletType === 'farcaster') {
        try {
            return await FarcasterSDK.context;
        } catch (err) {
            return null;
        }
    }
    return null;
}
