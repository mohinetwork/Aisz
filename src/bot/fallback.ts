import type { CoinSnapshot, TopCoinTile } from "../types/market";
import { formatPercent, formatUsd, formatUtcTimestamp } from "../utils/format";

export function formatSingleFallback(snapshot: CoinSnapshot): string {
  return [
    `${snapshot.name} (${snapshot.symbol})`,
    `Price: ${formatUsd(snapshot.priceUsd)}`,
    `24h: ${formatPercent(snapshot.change24h)}`,
    `7d: ${formatPercent(snapshot.change7d)}`,
    `Updated: ${formatUtcTimestamp(snapshot.fetchedAtIso)} UTC`
  ].join("\n");
}

export function formatTopFallback(coins: TopCoinTile[], fetchedAtIso: string): string {
  const list = coins
    .map(
      (coin, index) =>
        `${index + 1}. ${coin.name} (${coin.symbol}) | ${formatUsd(coin.priceUsd)} | 24h ${formatPercent(coin.change24h)}`
    )
    .join("\n");

  return [`Top 9 Crypto Snapshot (USD)`, list, `Updated: ${formatUtcTimestamp(fetchedAtIso)} UTC`].join("\n\n");
}
