export const COIN_COMMAND_TO_ID = {
  btc: "bitcoin",
  eth: "ethereum",
  sol: "solana",
  ltc: "litecoin"
} as const;

export const COIN_ID_TO_META = {
  bitcoin: { symbol: "BTC", name: "Bitcoin", accent: "#f7931a" },
  ethereum: { symbol: "ETH", name: "Ethereum", accent: "#627eea" },
  solana: { symbol: "SOL", name: "Solana", accent: "#14f195" },
  litecoin: { symbol: "LTC", name: "Litecoin", accent: "#345d9d" }
} as const;

export const SUPPORTED_COIN_COMMANDS = Object.keys(COIN_COMMAND_TO_ID) as Array<
  keyof typeof COIN_COMMAND_TO_ID
>;

export type SupportedCoinCommand = (typeof SUPPORTED_COIN_COMMANDS)[number];

export const HELP_TEXT = [
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
