"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HELP_TEXT = exports.SUPPORTED_COIN_COMMANDS = exports.COIN_ID_TO_META = exports.COIN_COMMAND_TO_ID = void 0;
exports.COIN_COMMAND_TO_ID = {
    btc: "bitcoin",
    eth: "ethereum",
    sol: "solana",
    ltc: "litecoin"
};
exports.COIN_ID_TO_META = {
    bitcoin: { symbol: "BTC", name: "Bitcoin", accent: "#f7931a" },
    ethereum: { symbol: "ETH", name: "Ethereum", accent: "#627eea" },
    solana: { symbol: "SOL", name: "Solana", accent: "#14f195" },
    litecoin: { symbol: "LTC", name: "Litecoin", accent: "#345d9d" }
};
exports.SUPPORTED_COIN_COMMANDS = Object.keys(exports.COIN_COMMAND_TO_ID);
exports.HELP_TEXT = [
    "Group commands:",
    "/btc - Bitcoin themed price card",
    "/eth - Ethereum themed price card",
    "/sol - Solana themed price card",
    "/ltc - Litecoin themed price card",
    "/top - Top 9 themed collage",
    "/<symbol> - Any coin by symbol (example: /xrp /doge /ton)",
    "",
    "Private setup:",
    "/start - Select theme and add bot to group",
    "/themes - Open theme picker",
    "/settings - Change theme for your groups",
    "",
    "All values are in USD."
].join("\n");
