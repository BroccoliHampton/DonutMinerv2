// js/audio.js
import * as State from './state.js';

// --- Private Module Variables ---
let kick, hiHat, bass, melody;
let kickSequence, hiHatSequence, bassSequence, melodySequence;
let isMusicPlaying = false;
let isAudioInitialized = false;
let purchaseSound, cuteClickSound;

// --- Private Functions ---

/**
 * Initializes all Tone.js instruments and sequences.
 * This is called automatically the first time audio is needed.
 */
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

    const hiHatPattern = [null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'GTesting', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'G5', null, null, null, 'GC5', null];

    hiHatSequence = new Tone.Sequence((time, note) => {
        if (note) hiHat.triggerAttackRelease('8n', time);
    }, hiHatPattern, '8n');
    hiHatSequence.loop = true;

    bass = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        filter: { Q: 2, type: 'lowpass', cutoff: 400 },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.5 }
    }).connect(limiter);

    const bassPattern = [
        'C2', null, 'G2', null, 'C2', null, 'G2', null, 'C2', null, 'G2', null, 'C2', null, 'G2', null,
        'C2', null, 'G2', null, 'C2', null, 'G2', null, 'C2', null, 'G2', null, 'C2', null, 'G2', null,
        'G#1', null, 'D#2', null, 'G#1', null, 'D#2', null, 'G#1', null, 'D#2', null, 'G#1', null, 'D#2', null,
        'G#1', null, 'D#2', null, 'G#1', null, 'D#2', null, 'G#1', null, 'D#2', null, 'G#1', null, 'D#2', null,
        'F1', null, 'C2', null, 'F1', null, 'C2', null, 'F1', null, 'C2', null, 'F1', null, 'C2', null,
        'F1', null, 'C2', null, 'F1', null, 'C2', null, 'F1', null, 'C2', null, 'F1', null, 'C2', null,
        'G1', null, 'D2', null, 'G1', null, 'D2', null, 'G1', null, 'D2', null, 'G1', null, 'D2', null,
        'G1', null, 'D2', null, 'G1', null, 'D2', null, 'G1', null, 'D2', null, 'G1', null, 'D2', null
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

// --- Exported Functions ---

/**
 * Plays a sound effect if SFX are not muted.
 * @param {string} sound - The name of the sound to play ('crunch' or 'purchase').
 */
export function playSoundEffect(sound) {
    if (State.uiState.isSfxMuted) return;

    if (Tone.context.state !== 'running') {
        Tone.start();
    }
    
    if (!isAudioInitialized) {
        initAudio();
    }
    
    const now = Tone.now(); 
    const offset = 0.001;

    if (sound === 'crunch') {
        cuteClickSound.triggerAttackRelease('C6', '32n', now + offset);
    }
    if (sound === 'purchase') {
        purchaseSound.triggerAttackRelease('C5', '16n', now + offset);
        purchaseSound.triggerAttackRelease('E5', '16n', now + 0.05 + offset);
        purchaseSound.triggerAttackRelease('G5', '16n', now + 0.1 + offset);
    }
}

/**
 * Toggles sound effects on or off.
 * @param {object} dom - The cached DOM elements object.
 */
export function toggleSfx(dom) {
    State.uiState.isSfxMuted = !State.uiState.isSfxMuted;
    dom.sfxToggleButton.textContent = State.uiState.isSfxMuted ? '🔇' : '🔊';
    if (!State.uiState.isSfxMuted) {
        playSoundEffect('crunch');
    }
}

/**
 * Toggles background music on or off.
 * @param {object} dom - The cached DOM elements object.
 */
export function toggleMusic(dom) {
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
