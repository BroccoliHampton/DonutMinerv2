// js/state.js
// This file holds the shared "source of truth" for the application.
// Other modules will import this to read or write data.

// LP Token URL - Update this when you have it
// Example: 'https://app.uniswap.org/explore/pools/base/0xc3b9bd6f7d4bfcc22696a7bc1cc83948a33d7fab'
export const LP_TOKEN_URL = '';

export let blockchainData = {
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

export let uiState = {
    isDarkMode: false,
    isSfxMuted: false,
    isGlazeView: true,
};
