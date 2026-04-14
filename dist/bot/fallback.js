"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSingleFallback = formatSingleFallback;
exports.formatTopFallback = formatTopFallback;
const format_1 = require("../utils/format");
function formatSingleFallback(snapshot) {
    return [
        `${snapshot.name} (${snapshot.symbol})`,
        `Price: ${(0, format_1.formatUsd)(snapshot.priceUsd)}`,
        `24h: ${(0, format_1.formatPercent)(snapshot.change24h)}`,
        `7d: ${(0, format_1.formatPercent)(snapshot.change7d)}`,
        `Updated: ${(0, format_1.formatUtcTimestamp)(snapshot.fetchedAtIso)} UTC`
    ].join("\n");
}
function formatTopFallback(coins, fetchedAtIso) {
    const list = coins
        .map((coin, index) => `${index + 1}. ${coin.name} (${coin.symbol}) | ${(0, format_1.formatUsd)(coin.priceUsd)} | 24h ${(0, format_1.formatPercent)(coin.change24h)}`)
        .join("\n");
    return [`Top 9 Crypto Snapshot (USD)`, list, `Updated: ${(0, format_1.formatUtcTimestamp)(fetchedAtIso)} UTC`].join("\n\n");
}
