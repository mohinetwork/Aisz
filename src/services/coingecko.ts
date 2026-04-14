import axios, { type AxiosInstance } from "axios";
import type { Logger } from "pino";
import { COIN_COMMAND_TO_ID, COIN_ID_TO_META } from "../bot/constants";
import type { CoinSnapshot, TopCoinTile } from "../types/market";
import { TtlCache } from "../utils/cache";

const TTL_SINGLE_MS = 30_000;
const TTL_CHART_MS = 300_000;
const TTL_TOP_MS = 60_000;
const TTL_RESOLVE_MS = 6 * 60 * 60 * 1000;
const MAX_HTTP_ATTEMPTS = 3;

type SpotResponse = Record<
  string,
  {
    usd: number;
    usd_24h_change: number | null;
  }
>;

interface ChartResponse {
  prices: [number, number][];
}

interface MarketsCoin {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number | null;
}

interface SearchCoin {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank: number | null;
}

interface SearchResponse {
  coins: SearchCoin[];
}

interface ResolvedCoin {
  id: string;
  symbol: string;
  name: string;
}

export interface CoinGeckoServiceOptions {
  logger: Logger;
  apiKeys?: string[];
  httpClient?: AxiosInstance;
}

export class CoinGeckoService {
  private readonly logger: Logger;
  private readonly http: AxiosInstance;
  private readonly spotCache = new TtlCache<SpotResponse[string]>();
  private readonly chartCache = new TtlCache<number[]>();
  private readonly topCache = new TtlCache<TopCoinTile[]>();
  private readonly resolveCache = new TtlCache<ResolvedCoin>();
  private readonly inflightSpot = new Map<string, Promise<SpotResponse[string]>>();
  private readonly inflightChart = new Map<string, Promise<number[]>>();
  private readonly inflightTop = new Map<string, Promise<TopCoinTile[]>>();
  private readonly inflightResolve = new Map<string, Promise<ResolvedCoin>>();
  private readonly lastGoodSpot = new Map<string, SpotResponse[string]>();
  private readonly lastGoodChart = new Map<string, number[]>();
  private readonly lastGoodTop = new Map<string, TopCoinTile[]>();

  private keyIndex = 0;

  constructor(options: CoinGeckoServiceOptions) {
    this.logger = options.logger;
    this.http =
      options.httpClient ??
      axios.create({
        baseURL: "https://api.coingecko.com/api/v3",
        timeout: 10_000
      });

    const keys = options.apiKeys ?? [];
    if (keys.length > 0) {
      this.http.interceptors.request.use((config) => {
        const key = keys[this.keyIndex % keys.length];
        this.keyIndex += 1;
        
        this.logger.debug({ keySuffix: key.slice(-4), index: (this.keyIndex - 1) % keys.length }, "Using API key rotation");

        config.params = {
          ...config.params,
          x_cg_demo_api_key: key
        };
        
        return config;
      });
    }
  }

  async getCoinSnapshot(commandOrSymbol: string): Promise<CoinSnapshot> {
    const resolved = await this.resolveCoin(commandOrSymbol);

    const [spot, chart] = await Promise.all([this.getSpotData(resolved.id), this.getChartData(resolved.id)]);

    const change7d = this.calculateChange7d(chart);

    return {
      id: resolved.id,
      symbol: resolved.symbol,
      name: resolved.name,
      priceUsd: spot.usd,
      change24h:
        typeof spot.usd_24h_change === "number" && Number.isFinite(spot.usd_24h_change) ? spot.usd_24h_change : 0,
      change7d,
      chart7d: chart,
      fetchedAtIso: new Date().toISOString()
    };
  }

  async getTopCoins(limit = 9): Promise<TopCoinTile[]> {
    const cacheKey = `top:${limit}`;
    const cached = this.topCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = this.inflightTop.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const pending = this.fetchTopCoins(limit, cacheKey).finally(() => {
      this.inflightTop.delete(cacheKey);
    });
    this.inflightTop.set(cacheKey, pending);
    return pending;
  }

  private async fetchTopCoins(limit: number, cacheKey: string): Promise<TopCoinTile[]> {
    const startedAt = Date.now();
    try {
      const response = await this.requestWithRetry("/coins/markets", () =>
        this.http.get<MarketsCoin[]>("/coins/markets", {
          params: {
            vs_currency: "usd",
            order: "market_cap_desc",
            per_page: limit,
            page: 1,
            sparkline: false,
            price_change_percentage: "24h"
          }
        })
      );

      this.logger.info({ latencyMs: Date.now() - startedAt, endpoint: "/coins/markets" }, "CoinGecko request");

      const tiles = response.data.slice(0, limit).map((coin) => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        priceUsd: coin.current_price,
        change24h: coin.price_change_percentage_24h ?? 0
      }));

      this.topCache.set(cacheKey, tiles, TTL_TOP_MS);
      this.lastGoodTop.set(cacheKey, tiles);
      return tiles;
    } catch (error) {
      const stale = this.lastGoodTop.get(cacheKey);
      if (stale) {
        this.logger.warn({ err: this.formatError(error) }, "Top market request failed, serving stale data");
        return stale;
      }
      throw error;
    }
  }

  private async getSpotData(coinId: string): Promise<SpotResponse[string]> {
    const cacheKey = `spot:${coinId}`;
    const cached = this.spotCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = this.inflightSpot.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const pending = this.fetchSpotData(coinId, cacheKey).finally(() => {
      this.inflightSpot.delete(cacheKey);
    });
    this.inflightSpot.set(cacheKey, pending);
    return pending;
  }

  private async fetchSpotData(coinId: string, cacheKey: string): Promise<SpotResponse[string]> {
    const startedAt = Date.now();
    try {
      const response = await this.requestWithRetry("/simple/price", () =>
        this.http.get<SpotResponse>("/simple/price", {
          params: {
            ids: coinId,
            vs_currencies: "usd",
            include_24hr_change: true
          }
        })
      );

      this.logger.info({ latencyMs: Date.now() - startedAt, endpoint: "/simple/price", coinId }, "CoinGecko request");

      const payload = response.data[coinId];

      if (!payload || typeof payload.usd !== "number") {
        throw new Error(`Invalid spot response for ${coinId}`);
      }

      this.spotCache.set(cacheKey, payload, TTL_SINGLE_MS);
      this.lastGoodSpot.set(cacheKey, payload);
      return payload;
    } catch (error) {
      const stale = this.lastGoodSpot.get(cacheKey);
      if (stale) {
        this.logger.warn({ err: this.formatError(error), coinId }, "Spot request failed, serving stale data");
        return stale;
      }
      throw error;
    }
  }

  private async getChartData(coinId: string): Promise<number[]> {
    const cacheKey = `chart:${coinId}`;
    const cached = this.chartCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = this.inflightChart.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const pending = this.fetchChartData(coinId, cacheKey).finally(() => {
      this.inflightChart.delete(cacheKey);
    });
    this.inflightChart.set(cacheKey, pending);
    return pending;
  }

  private async fetchChartData(coinId: string, cacheKey: string): Promise<number[]> {
    const startedAt = Date.now();
    try {
      const response = await this.requestWithRetry(`/coins/${coinId}/market_chart`, () =>
        this.http.get<ChartResponse>(`/coins/${coinId}/market_chart`, {
          params: {
            vs_currency: "usd",
            days: 7
          }
        })
      );

      this.logger.info(
        { latencyMs: Date.now() - startedAt, endpoint: `/coins/${coinId}/market_chart`, coinId },
        "CoinGecko request"
      );

      const values = response.data.prices?.map((entry) => entry[1]).filter((entry) => Number.isFinite(entry)) ?? [];

      if (values.length < 2) {
        throw new Error(`Not enough chart points for ${coinId}`);
      }

      this.chartCache.set(cacheKey, values, TTL_CHART_MS);
      this.lastGoodChart.set(cacheKey, values);
      return values;
    } catch (error) {
      const stale = this.lastGoodChart.get(cacheKey);
      if (stale) {
        this.logger.warn({ err: this.formatError(error), coinId }, "Chart request failed, serving stale data");
        return stale;
      }
      throw error;
    }
  }

  private calculateChange7d(chart: number[]): number {
    if (chart.length < 2) {
      return 0;
    }

    const start = chart[0];
    const end = chart[chart.length - 1];

    if (start === 0) {
      return 0;
    }

    return ((end - start) / start) * 100;
  }

  private async resolveCoin(commandOrSymbol: string): Promise<ResolvedCoin> {
    const normalized = this.normalizeCoinInput(commandOrSymbol);
    if (!normalized) {
      throw new Error("Coin symbol is empty");
    }

    if (normalized in COIN_COMMAND_TO_ID) {
      const coinId = COIN_COMMAND_TO_ID[normalized as keyof typeof COIN_COMMAND_TO_ID];
      const meta = COIN_ID_TO_META[coinId];
      return {
        id: coinId,
        symbol: meta.symbol,
        name: meta.name
      };
    }

    const cacheKey = `resolve:${normalized}`;
    const cached = this.resolveCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const inflight = this.inflightResolve.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const pending = this.fetchResolvedCoin(normalized, cacheKey).finally(() => {
      this.inflightResolve.delete(cacheKey);
    });
    this.inflightResolve.set(cacheKey, pending);
    return pending;
  }

  private async fetchResolvedCoin(normalized: string, cacheKey: string): Promise<ResolvedCoin> {
    const response = await this.requestWithRetry("/search", () =>
      this.http.get<SearchResponse>("/search", {
        params: { query: normalized }
      })
    );

    const coins = response.data.coins ?? [];
    if (coins.length === 0) {
      throw new Error(`Coin not found for ${normalized}`);
    }

    const pickByRank = (items: SearchCoin[]): SearchCoin | undefined =>
      items.sort((a, b) => (a.market_cap_rank ?? Number.MAX_SAFE_INTEGER) - (b.market_cap_rank ?? Number.MAX_SAFE_INTEGER))[0];

    const exactId = coins.find((coin) => coin.id.toLowerCase() === normalized);
    const exactSymbol = pickByRank(coins.filter((coin) => coin.symbol.toLowerCase() === normalized));
    const exactName = pickByRank(coins.filter((coin) => coin.name.toLowerCase() === normalized));
    const startsWithSymbol = pickByRank(coins.filter((coin) => coin.symbol.toLowerCase().startsWith(normalized)));
    const fallback = pickByRank(coins);

    const selected = exactId ?? exactSymbol ?? exactName ?? startsWithSymbol ?? fallback;
    if (!selected) {
      throw new Error(`Coin not found for ${normalized}`);
    }

    const resolved: ResolvedCoin = {
      id: selected.id,
      symbol: selected.symbol.toUpperCase(),
      name: selected.name
    };

    this.resolveCache.set(cacheKey, resolved, TTL_RESOLVE_MS);
    return resolved;
  }

  private normalizeCoinInput(value: string): string {
    return value.trim().replace(/^\//, "").replace(/@.+$/, "").toLowerCase();
  }

  private async requestWithRetry<T>(label: string, request: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_HTTP_ATTEMPTS; attempt += 1) {
      try {
        return await request();
      } catch (error) {
        lastError = error;
        const retryable = this.isRetryableError(error);
        this.logger.warn(
          {
            endpoint: label,
            attempt,
            retryable,
            err: this.formatError(error)
          },
          "CoinGecko request attempt failed"
        );

        if (!retryable || attempt >= MAX_HTTP_ATTEMPTS) {
          break;
        }

        await this.sleep(220 * attempt + Math.floor(Math.random() * 130));
      }
    }

    throw (lastError as Error) ?? new Error(`CoinGecko request failed for ${label}`);
  }

  private isRetryableError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return true;
    }

    const status = error.response?.status;
    if (!status) {
      return true;
    }

    return status === 429 || status >= 500;
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
