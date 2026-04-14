import type { ThemeId } from "../themes";

export interface CoinSnapshot {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  change7d: number;
  chart7d: number[];
  fetchedAtIso: string;
}

export interface TopCoinTile {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
}

export interface RenderPayloadSingle {
  coin: CoinSnapshot;
  themeId: ThemeId;
}

export interface RenderPayloadTop {
  coins: TopCoinTile[];
  fetchedAtIso: string;
  themeId: ThemeId;
}
