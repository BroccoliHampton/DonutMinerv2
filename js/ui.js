// js/ui.js
import * as State from './state.js';

// --- Private Helper Functions (only used inside this file) ---

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

// --- Exported Functions ---

/**
 * Finds all DOM elements and returns them in an organized object.
 */
export function cacheDOMElements() {
    return {
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
            
            toggleButton: document.getElementById('view-toggle-button'),
            glazeContainer: document.getElementById('glaze-container'),
            blazeContainer: document.getElementById('blaze-container'),
            glazeDpsDisplay: document.getElementById('glaze-dps-display'),

            blazePrice: document.getElementById('blaze-price-display'),
            blazeAvailableBalance: document.getElementById('blaze-available-balance-display'),
            blazeActionButton: document.getElementById('blaze-action-button'),
            blazeClaimAmount: document.getElementById('blaze-claim-amount'),
        },
        profileName: document.getElementById('player-profile-name'),
        connectWalletButton: document.getElementById('connect-wallet-button'),
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
}

/**
 * Updates all UI elements related to the "Blaze" (LP) view.
 * Reads data from the imported State module.
 * @param {object} dom - The DOM elements object from cacheDOMElements().
 */
export function updateBlazeryUI(dom) {
    if (!State.blockchainData.blaze) {
        console.log('[Blaze] No blaze data available');
        return;
    }
    
    console.log('[Blaze] Updating UI');
    
    const userNeedsApproval = State.blockchainData.blaze.userNeedsApproval;
    const blazeButton = dom.glazery.blazeActionButton;
    
    if (dom.glazery.blazePrice) {
        const lpAmount = parseFloat(State.blockchainData.blaze.priceFormatted);
        dom.glazery.blazePrice.textContent = lpAmount.toFixed(4);
    }
    
    if (dom.glazery.blazeClaimAmount) {
        const ethAmount = parseFloat(State.blockchainData.blaze.wethAccumulatedFormatted);
        dom.glazery.blazeClaimAmount.textContent = `${ethAmount.toFixed(6)} ETH`; 
    }
    
    if (dom.glazery.blazeAvailableBalance) {
        const userLpBalance = parseFloat(State.blockchainData.blaze.userLpBalanceFormatted);
        dom.glazery.blazeAvailableBalance.textContent = `${userLpBalance.toFixed(4)} LP available`;
    }
    
    if (blazeButton) {
        if (userNeedsApproval) {
            blazeButton.textContent = 'Approve LP';
            blazeButton.disabled = false;
        } else {
            const lpBalance = parseFloat(State.blockchainData.blaze.userLpBalanceFormatted);
            const lpNeeded = parseFloat(State.blockchainData.blaze.priceFormatted);
            
            blazeButton.textContent = 'Blaze';
            blazeButton.disabled = lpBalance < lpNeeded;
        }
    }
    
    console.log('[Blaze] UI updated successfully');
}

/**
 * Updates all primary UI elements.
 * Reads data from the imported State module.
 * @param {object} dom - The DOM elements object from cacheDOMElements().
 */
export function updateUI(dom) {
    console.log('[Blockchain] Updating UI');
    
    const userIsMiner = State.blockchainData.userAddress && 
                       State.blockchainData.currentMiner && 
                       State.blockchainData.userAddress.toLowerCase() === State.blockchainData.currentMiner.toLowerCase();
    
   let kingGlazerDisplay;

    // Always try to show Farcaster username first
    if (State.blockchainData.currentMinerUsername) {
        kingGlazerDisplay = `@${State.blockchainData.currentMinerUsername}`;
        // Add "(You)" if it's the current user
        if (userIsMiner) {
            kingGlazerDisplay += ' (You)';
        }
    } else if (userIsMiner) {
        kingGlazerDisplay = 'You';
    } else if (State.blockchainData.currentMiner && State.blockchainData.currentMiner !== '0x0000000000000000000000000000000000000000') {
        const address = State.blockchainData.currentMiner;
        kingGlazerDisplay = `${address.slice(0, 6)}...${address.slice(-4)}`;
    } else {
        kingGlazerDisplay = 'None';
    }
    dom.glazery.kingStatus.textContent = kingGlazerDisplay;

    dom.glazery.cps.textContent = State.blockchainData.claimableDonutsFormatted ? formatNumber(State.blockchainData.claimableDonutsFormatted) : '0.00';
    dom.glazery.baked.textContent = formatTime(State.blockchainData.timeAsMiner || 0);
    
    dom.glazery.glazePrice.textContent = `${parseFloat(State.blockchainData.priceInEth || 0).toFixed(6)} ETH`;
    
    dom.glazery.availableBalance.textContent = `${parseFloat(State.blockchainData.userEthBalanceFormatted || 0).toFixed(4)} ETH available`;
    
    if (dom.glazery.blazeAvailableBalance) {
         dom.glazery.blazeAvailableBalance.textContent = `${parseFloat(State.blockchainData.blaze.userLpBalanceFormatted || 0).toFixed(4)} LP available`;
    }
    
    if (dom.glazery.blazeClaimAmount && State.blockchainData.blaze.wethAccumulatedFormatted) {
        const claimEth = parseFloat(State.blockchainData.blaze.wethAccumulatedFormatted);
        dom.glazery.blazeClaimAmount.textContent = `${claimEth.toFixed(6)} ETH`;
    }
    
    if (dom.glazery.glazeDpsDisplay) {
         dom.glazery.glazeDpsDisplay.textContent = parseFloat(State.blockchainData.currentDpsFormatted || 0).toFixed(2);
    }

    dom.glazery.donutBalance.textContent = `🍩 ${formatNumber(State.blockchainData.userDonutBalanceFormatted || 0)}`;
    dom.glazery.totalSupply.textContent = `🍩 ${formatNumber(State.blockchainData.totalDonutSupplyFormatted || 0)}`;
    
    // Calculate percentage mined (user balance / total supply * 100)
    const userBalance = parseFloat(State.blockchainData.userDonutBalanceFormatted || 0);
    const totalSupply = parseFloat(State.blockchainData.totalDonutSupplyFormatted || 0);
    const percentageMined = totalSupply > 0 ? (userBalance / totalSupply * 100) : 0;
    dom.glazery.currentDps.textContent = `${percentageMined.toFixed(4)}%`;
    
    dom.glazery.actionButton.textContent = 'Glaze';
    
    if (dom.modalInfo.totalSupply) {
        dom.modalInfo.totalSupply.textContent = `🍩 ${formatNumber(State.blockchainData.totalDonutSupplyFormatted || 0)}`;
        dom.modalInfo.nextHalving.textContent = formatTime(State.blockchainData.secondsUntilHalving || 0);
        
        const minerDisplay = State.blockchainData.currentMiner 
            ? `${State.blockchainData.currentMiner.slice(0, 6)}...${State.blockchainData.currentMiner.slice(-4)}`
            : 'None';
        dom.modalInfo.currentMiner.textContent = minerDisplay;
    }
}

/**
 * Toggles between the Glaze and Blaze views.
 * @param {object} dom - The DOM elements object.
 * @param {function} playSoundEffect - The function to call for audio.
 * @param {object} composer - The Three.js EffectComposer.
 */
export function toggleView(dom, playSoundEffect, composer) {
    playSoundEffect('crunch');
    State.uiState.isGlazeView = !State.uiState.isGlazeView;
    
    if (State.uiState.isGlazeView) {
        dom.glazery.glazeContainer.classList.remove('hidden');
        dom.glazery.blazeContainer.classList.add('hidden');
        dom.glazery.toggleButton.textContent = '🧊';
        dom.glazery.rainContainer.classList.remove('blaze-active');
        if (composer) {
            composer.enabled = false;
        }
    } else {
        dom.glazery.glazeContainer.classList.add('hidden');
        dom.glazery.blazeContainer.classList.remove('hidden');
        dom.glazery.toggleButton.textContent = '🔥';
        dom.glazery.rainContainer.classList.add('blaze-active');
        if (composer) {
            composer.enabled = true;
        }
    }
}

/**
 * Toggles dark mode on and off.
 * @param {object} dom - The DOM elements object.
 * @param {function} playSoundEffect - The function to call for audio.
 */
export function toggleDarkMode(dom, playSoundEffect) {
    playSoundEffect('crunch');
    State.uiState.isDarkMode = !State.uiState.isDarkMode;
    const body = document.body;
    if (State.uiState.isDarkMode) {
        body.classList.add('dark');
        dom.darkModeToggleButton.textContent = '☀️';
    } else {
        body.classList.remove('dark');
        dom.darkModeToggleButton.textContent = '🌙';
    }
}

/**
 * Shows the info modal.
 * @param {object} dom - The DOM elements object.
 * @param {function} playSoundEffect - The function to call for audio.
 */
export function showInfoModal(dom, playSoundEffect) {
    playSoundEffect('crunch');
    dom.infoModal.classList.remove('hidden');
    dom.infoModalOverlay.classList.remove('hidden');
}

/**
 * Hides the info modal.
 * @param {object} dom - The DOM elements object.
 */
export function hideInfoModal(dom) {
    dom.infoModal.classList.add('hidden');
    dom.infoModalOverlay.classList.add('hidden');
}
