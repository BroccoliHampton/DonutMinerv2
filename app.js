// js/app.js
// The main application orchestrator.
// Its only job is to import all the modules and wire them together.

import * as State from './js/state.js';
import * as UI from './js/ui.js';
import * as Audio from './js/audio.js';
import * as Scene from './js/scene.js';
import * as Blockchain from './js/blockchain.js';

/**
 * Main entry point. Waits for the DOM to load,
 * then initializes all modules and wires up event listeners.
 */
document.addEventListener('DOMContentLoaded', () => {

    // 1. Find all DOM elements and cache them
    const dom = UI.cacheDOMElements();

    // 2. Initialize the 3D scene
    Scene.initThreeJS(dom);
    Scene.animate(); // Start the render loop

    // 3. Wire up all event listeners
    
    // Wallet connection button (MetaMask)
    dom.connectWalletButton.onclick = Blockchain.handleConnectWallet;
    
    // Blockchain buttons
    dom.glazery.actionButton.onclick = Blockchain.handleGlazeClick;
    dom.glazery.blazeActionButton.onclick = Blockchain.handleBlazeClick;

    // Audio buttons
    dom.musicToggleButton.onclick = () => Audio.toggleMusic(dom);
    dom.sfxToggleButton.onclick = () => Audio.toggleSfx(dom);
    
    // UI/View buttons
    dom.glazery.toggleButton.onclick = () => UI.toggleView(dom, Audio.playSoundEffect, Scene.getComposer());
    dom.darkModeToggleButton.onclick = () => UI.toggleDarkMode(dom, Audio.playSoundEffect);

    // Info Modal buttons
    dom.infoButton.onclick = () => UI.showInfoModal(dom, Audio.playSoundEffect);
    dom.infoModalClose.onclick = () => UI.hideInfoModal(dom);
    dom.infoModalOverlay.onclick = () => UI.hideInfoModal(dom);

    // 3D Scene control buttons
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

    // 4. Start the application logic (connect wallet, fetch data, etc.)
    Blockchain.initApp(dom);
});
