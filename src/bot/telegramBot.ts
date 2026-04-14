import { Input, Markup, Telegraf, type Context } from "telegraf";
import type { Logger } from "pino";
import type { AppConfig } from "../config";
import { HELP_TEXT, SUPPORTED_COIN_COMMANDS, type SupportedCoinCommand } from "./constants";
import { formatSingleFallback, formatTopFallback } from "./fallback";
import { ChatRateLimiter } from "../utils/throttle";
import type { CoinSnapshot, TopCoinTile } from "../types/market";
import { DEFAULT_THEME_ID, THEME_IDS, THEME_META, getThemeLabel, parseThemeId, type ThemeId } from "../themes";

export interface MarketDataProvider {
  getCoinSnapshot(commandOrSymbol: string): Promise<CoinSnapshot>;
  getTopCoins(limit: number): Promise<TopCoinTile[]>;
}

export interface RenderProvider {
  renderSingleCard(payload: { coin: CoinSnapshot; themeId: ThemeId }): Promise<Buffer>;
  renderTopCollage(payload: { coins: TopCoinTile[]; fetchedAtIso: string; themeId: ThemeId }): Promise<Buffer>;
  renderThemePreview(themeId: ThemeId): Promise<Buffer>;
}

export interface ThemeStateProvider {
  getGroupTheme(chatId: number): ThemeId;
  getGroup(chatId: number): { chatId: number; title: string; themeId: ThemeId } | undefined;
  listUserGroups(userId: number): Array<{ chatId: number; title: string; themeId: ThemeId }>;
  getPendingTheme(userId: number): ThemeId | undefined;
  setPendingTheme(userId: number, themeId: ThemeId): Promise<void>;
  clearPendingTheme(userId: number): Promise<void>;
  assignGroupTheme(options: { chatId: number; title: string; themeId: ThemeId; actorUserId: number }): Promise<void>;
  linkUserGroup(userId: number, chatId: number): Promise<void>;
}

export interface TelegramBotDeps {
  config: AppConfig;
  logger: Logger;
  marketService: MarketDataProvider;
  renderer: RenderProvider;
  themeState: ThemeStateProvider;
  rateLimiter?: ChatRateLimiter;
}

export interface CommandExecutionContext {
  readonly chatId?: number;
  readonly isGroupChat?: boolean;
  reply(text: string): Promise<unknown>;
  sendChatAction(action: "upload_photo"): Promise<unknown>;
  replyWithPhoto(
    photo: {
      source: Buffer;
      filename: string;
    },
    options: {
      caption?: string;
    }
  ): Promise<unknown>;
}

interface MinimalChatMember {
  status: string;
}

interface PanelReference {
  chatId: number;
  messageId: number;
}

type InlineKeyboard = ReturnType<typeof Markup.inlineKeyboard>["reply_markup"];

type InlineButton = ReturnType<typeof Markup.button.callback> | ReturnType<typeof Markup.button.url>;

interface PrivatePanelPayload {
  image: Buffer;
  filename: string;
  caption: string;
  keyboard: InlineKeyboard;
}

const ACTIVE_STATUSES = new Set(["member", "administrator"]);
const SETTINGS_GROUP_LIMIT = 24;
const RESERVED_COMMANDS = new Set(["start", "help", "themes", "settings", "top", ...SUPPORTED_COIN_COMMANDS]);

function getCommandLabel(command: string): string {
  return command.replace(/^\//, "").replace(/@.+$/, "").toUpperCase();
}

function isRateLimited(chatId: number | undefined, limiter: ChatRateLimiter): boolean {
  if (!chatId) {
    return false;
  }

  return !limiter.tryConsume(Math.abs(chatId));
}

function isPrivateChat(ctx: Context): boolean {
  return ctx.chat?.type === "private";
}

function isGroupChat(ctx: Context): boolean {
  return ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
}

function isAdminStatus(status: string): boolean {
  return status === "administrator" || status === "creator";
}

function parseStartPayload(ctx: Context): string | undefined {
  const text = "message" in ctx.update && ctx.update.message && "text" in ctx.update.message ? ctx.update.message.text : "";
  const [, payload] = text.split(/\s+/, 2);
  return payload;
}

function truncateLabel(value: string, max = 26): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1)}…`;
}

function getPrivateChatId(ctx: Context): number | undefined {
  return ctx.chat?.type === "private" ? ctx.chat.id : undefined;
}

function getIncomingMessageId(ctx: Context): number | undefined {
  const update = ctx.update;
  if (!("message" in update) || !update.message) {
    return undefined;
  }

  return "message_id" in update.message ? update.message.message_id : undefined;
}

function getCallbackPanelReference(ctx: Context): PanelReference | undefined {
  const update = ctx.update;
  if (!("callback_query" in update) || !update.callback_query) {
    return undefined;
  }

  const message = update.callback_query.message;
  if (!message || !("chat" in message) || !("message_id" in message)) {
    return undefined;
  }

  return {
    chatId: message.chat.id,
    messageId: message.message_id
  };
}

function uniqueRefs(...items: Array<PanelReference | undefined>): PanelReference[] {
  const deduped = new Map<string, PanelReference>();

  for (const item of items) {
    if (!item) {
      continue;
    }

    deduped.set(`${item.chatId}:${item.messageId}`, item);
  }

  return [...deduped.values()];
}

function isSameRef(a: PanelReference | undefined, b: PanelReference | undefined): boolean {
  if (!a || !b) {
    return false;
  }

  return a.chatId === b.chatId && a.messageId === b.messageId;
}

function themeButtons(prefix: "theme:preview" | "settings:preview", groupId?: number) {
  const rows = [
    [THEME_IDS[0], THEME_IDS[1]],
    [THEME_IDS[2], THEME_IDS[3]]
  ] as const;

  return rows.map((row) =>
    row.map((themeId) => {
      const label = THEME_META[themeId].label;
      const callback =
        prefix === "theme:preview" ? `${prefix}:${themeId}` : `${prefix}:${groupId}:${themeId}`;
      return Markup.button.callback(label, callback);
    })
  );
}

async function filterAdminGroups(
  ctx: Context,
  userId: number,
  groups: Array<{ chatId: number; title: string; themeId: ThemeId }>
): Promise<Array<{ chatId: number; title: string; themeId: ThemeId }>> {
  const allowed: Array<{ chatId: number; title: string; themeId: ThemeId }> = [];

  for (const group of groups) {
    try {
      const member = (await ctx.telegram.getChatMember(group.chatId, userId)) as MinimalChatMember;
      if (isAdminStatus(member.status)) {
        allowed.push(group);
      }
    } catch {
      // Ignore inaccessible chats; they might have removed the bot.
    }
  }

  return allowed;
}

async function resolveBotUsername(ctx: Context): Promise<string | undefined> {
  if (ctx.botInfo?.username) {
    return ctx.botInfo.username;
  }

  try {
    const me = await ctx.telegram.getMe();
    return me.username;
  } catch {
    return undefined;
  }
}

async function deleteMessageQuietly(
  telegram: Context["telegram"],
  chatId: number,
  messageId: number,
  logger: Logger
): Promise<void> {
  try {
    await telegram.deleteMessage(chatId, messageId);
  } catch (error) {
    logger.debug({ chatId, messageId, err: String(error) }, "Failed to delete message");
  }
}

async function editPanelMessage(
  telegram: Context["telegram"],
  reference: PanelReference,
  panel: PrivatePanelPayload,
  logger: Logger
): Promise<boolean> {
  try {
    await telegram.editMessageMedia(
      reference.chatId,
      reference.messageId,
      undefined,
      {
        type: "photo",
        media: Input.fromBuffer(panel.image, panel.filename),
        caption: panel.caption
      },
      {
        reply_markup: panel.keyboard
      }
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("message is not modified")) {
      return true;
    }

    logger.debug(
      {
        chatId: reference.chatId,
        messageId: reference.messageId,
        err: message
      },
      "Failed to edit setup panel message"
    );

    return false;
  }
}

async function sendPanelMessage(
  telegram: Context["telegram"],
  chatId: number,
  panel: PrivatePanelPayload
): Promise<PanelReference> {
  const sent = await telegram.sendPhoto(chatId, Input.fromBuffer(panel.image, panel.filename), {
    caption: panel.caption,
    reply_markup: panel.keyboard
  });

  return {
    chatId,
    messageId: sent.message_id
  };
}

async function cleanupIncomingPrivateCommand(ctx: Context, logger: Logger): Promise<void> {
  const chatId = getPrivateChatId(ctx);
  const messageId = getIncomingMessageId(ctx);

  if (!chatId || !messageId) {
    return;
  }

  await deleteMessageQuietly(ctx.telegram, chatId, messageId, logger);
}

export async function executeCoinCommand(
  command: string,
  deps: Pick<TelegramBotDeps, "logger" | "marketService" | "renderer">,
  ctx: CommandExecutionContext,
  themeId: ThemeId
): Promise<void> {
  try {
    deps.logger.info({ command, chatId: ctx.chatId, themeId }, "Handling coin command");
    await ctx.sendChatAction("upload_photo");

    const snapshot = await deps.marketService.getCoinSnapshot(command);

    try {
      const image = await deps.renderer.renderSingleCard({ coin: snapshot, themeId });
      await ctx.replyWithPhoto(
        {
          source: image,
          filename: `${snapshot.id}-${themeId}-card.png`
        },
        ctx.isGroupChat ? {} : { caption: `${snapshot.name} (${getCommandLabel(command)}) • ${getThemeLabel(themeId)}` }
      );
    } catch (renderError) {
      deps.logger.warn(
        { command, err: renderError instanceof Error ? renderError.message : String(renderError) },
        "Image render failed, sending text fallback"
      );
      await ctx.reply(formatSingleFallback(snapshot));
    }
  } catch (error) {
    deps.logger.error(
      { command, err: error instanceof Error ? error.message : String(error) },
      "Coin command failed"
    );
    await ctx.reply(`Could not fetch ${getCommandLabel(command)} price right now. Please retry in a few seconds.`);
  }
}

export async function executeTopCommand(
  deps: Pick<TelegramBotDeps, "logger" | "marketService" | "renderer">,
  ctx: CommandExecutionContext,
  themeId: ThemeId
): Promise<void> {
  try {
    deps.logger.info({ command: "top", chatId: ctx.chatId, themeId }, "Handling top command");
    await ctx.sendChatAction("upload_photo");
    const coins = await deps.marketService.getTopCoins(9);
    const fetchedAtIso = new Date().toISOString();

    try {
      const image = await deps.renderer.renderTopCollage({ coins, fetchedAtIso, themeId });
      await ctx.replyWithPhoto(
        {
          source: image,
          filename: `top-crypto-${themeId}.png`
        },
        ctx.isGroupChat ? {} : { caption: `Top 9 Crypto Snapshot • ${getThemeLabel(themeId)}` }
      );
    } catch (renderError) {
      deps.logger.warn(
        { err: renderError instanceof Error ? renderError.message : String(renderError) },
        "Top render failed, sending text fallback"
      );
      await ctx.reply(formatTopFallback(coins, fetchedAtIso));
    }
  } catch (error) {
    deps.logger.error({ err: error instanceof Error ? error.message : String(error) }, "Top command failed");
    await ctx.reply("Could not fetch top market data right now. Please retry in a few seconds.");
  }
}

export function createTelegramBot(deps: TelegramBotDeps): Telegraf<Context> {
  const bot = new Telegraf<Context>(deps.config.TELEGRAM_BOT_TOKEN);
  const limiter = deps.rateLimiter ?? new ChatRateLimiter(2000);

  const previewCache = new Map<ThemeId, Buffer>();
  const setupPanelByUser = new Map<number, PanelReference>();

  const getPreviewImage = async (themeId: ThemeId): Promise<Buffer> => {
    const cached = previewCache.get(themeId);
    if (cached) {
      return cached;
    }

    const image = await deps.renderer.renderThemePreview(themeId);
    previewCache.set(themeId, image);
    return image;
  };

  const upsertPrivatePanelFromContext = async (
    ctx: Context,
    userId: number,
    panel: PrivatePanelPayload,
    options?: { cleanupIncomingCommand?: boolean }
  ): Promise<void> => {
    const chatId = getPrivateChatId(ctx);
    if (!chatId) {
      return;
    }

    const stored = setupPanelByUser.get(userId);
    const callbackRef = getCallbackPanelReference(ctx);

    const fromCallback = callbackRef && callbackRef.chatId === chatId ? callbackRef : undefined;
    const fromStore = stored && stored.chatId === chatId ? stored : undefined;
    
    // Explicitly do not fallback to fromStore for text commands.
    // If there's no callback (e.g. user sent /start), provide a fresh message at the bottom.
    const candidate = fromCallback;

    let activeRef: PanelReference | undefined;

    if (candidate) {
      const updated = await editPanelMessage(ctx.telegram, candidate, panel, deps.logger);
      if (updated) {
        activeRef = candidate;
      }
    }

    if (!activeRef) {
      activeRef = await sendPanelMessage(ctx.telegram, chatId, panel);
    }

    setupPanelByUser.set(userId, activeRef);

    const staleRefs = uniqueRefs(fromStore, fromCallback).filter((item) => !isSameRef(item, activeRef));
    for (const stale of staleRefs) {
      await deleteMessageQuietly(ctx.telegram, stale.chatId, stale.messageId, deps.logger);
    }

    if (options?.cleanupIncomingCommand) {
      const incomingMessageId = getIncomingMessageId(ctx);
      if (incomingMessageId && incomingMessageId !== activeRef.messageId) {
        await deleteMessageQuietly(ctx.telegram, chatId, incomingMessageId, deps.logger);
      }
    }
  };

  const upsertPrivatePanelByUserId = async (
    userId: number,
    panel: PrivatePanelPayload
  ): Promise<void> => {
    const chatId = userId;
    const existing = setupPanelByUser.get(userId);

    let activeRef: PanelReference | undefined;

    if (existing) {
      const updated = await editPanelMessage(bot.telegram, existing, panel, deps.logger);
      if (updated) {
        activeRef = existing;
      }
    }

    if (!activeRef) {
      activeRef = await sendPanelMessage(bot.telegram, chatId, panel);
    }

    setupPanelByUser.set(userId, activeRef);

    if (existing && !isSameRef(existing, activeRef)) {
      await deleteMessageQuietly(bot.telegram, existing.chatId, existing.messageId, deps.logger);
    }
  };

  const getThemeHomePanel = async (): Promise<PrivatePanelPayload> => ({
    image: await getPreviewImage(DEFAULT_THEME_ID),
    filename: "welcome-theme-home.png",
    caption: "Welcome",
    keyboard: Markup.inlineKeyboard([
      ...themeButtons("theme:preview"),
      [Markup.button.callback("Open Group Settings", "settings:open")]
    ]).reply_markup
  });

  const getHelpPanel = async (): Promise<PrivatePanelPayload> => ({
    image: await getPreviewImage(DEFAULT_THEME_ID),
    filename: "help-panel.png",
    caption: `How to use\n\n${HELP_TEXT}`,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback("Back to Themes", "theme:home")],
      [Markup.button.callback("Open Group Settings", "settings:open")]
    ]).reply_markup
  });

  const getThemePreviewPanel = async (themeId: ThemeId): Promise<PrivatePanelPayload> => ({
    image: await getPreviewImage(themeId),
    filename: `preview-${themeId}.png`,
    caption: `${getThemeLabel(themeId)}\n${THEME_META[themeId].shortDescription}`,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback("Confirm This Theme", `theme:confirm:${themeId}`)],
      [Markup.button.callback("Back to Theme List", "theme:home")],
      [Markup.button.callback("Open Group Settings", "settings:open")]
    ]).reply_markup
  });

  const getThemeConfirmedPanel = async (
    themeId: ThemeId,
    addUrl: string | undefined
  ): Promise<PrivatePanelPayload> => {
    const rows: InlineButton[][] = [];

    if (addUrl) {
      rows.push([Markup.button.url("Add Bot To Group", addUrl)]);
    }

    rows.push([Markup.button.callback("Open Group Settings", "settings:open")]);
    rows.push([Markup.button.callback("Back", "theme:home")]);

    return {
      image: await getPreviewImage(themeId),
      filename: `confirmed-${themeId}.png`,
      caption: `Theme saved: ${getThemeLabel(themeId)}\nNow tap Add Bot To Group and make bot admin.`,
      keyboard: Markup.inlineKeyboard(rows).reply_markup
    };
  };

  const getSettingsHomePanel = async (ctx: Context, userId: number): Promise<PrivatePanelPayload> => {
    const knownGroups = deps.themeState.listUserGroups(userId);
    const manageableGroups = await filterAdminGroups(ctx, userId, knownGroups);

    if (manageableGroups.length === 0) {
      return {
        image: await getPreviewImage(DEFAULT_THEME_ID),
        filename: "settings-empty.png",
        caption: "No manageable groups found. First confirm a theme, then add bot as admin in your group.",
        keyboard: Markup.inlineKeyboard([
          [Markup.button.callback("Back to Themes", "theme:home")]
        ]).reply_markup
      };
    }

    const limitedGroups = manageableGroups.slice(0, SETTINGS_GROUP_LIMIT);
    const groupRows = limitedGroups.map((group) => [
      Markup.button.callback(
        `${truncateLabel(group.title)} • ${getThemeLabel(group.themeId)}`,
        `settings:group:${group.chatId}`
      )
    ]);

    const extraCount = manageableGroups.length - limitedGroups.length;

    const caption =
      extraCount > 0
        ? `Select group to change theme. Showing first ${SETTINGS_GROUP_LIMIT} groups.`
        : "Select group to change theme.";

    return {
      image: await getPreviewImage(limitedGroups[0]?.themeId ?? DEFAULT_THEME_ID),
      filename: "settings-home.png",
      caption,
      keyboard: Markup.inlineKeyboard([
        ...groupRows,
        [Markup.button.callback("Back to Themes", "theme:home")]
      ]).reply_markup
    };
  };

  const getSettingsGroupPanel = async (group: {
    chatId: number;
    title: string;
    themeId: ThemeId;
  }): Promise<PrivatePanelPayload> => ({
    image: await getPreviewImage(group.themeId),
    filename: `settings-group-${group.chatId}.png`,
    caption: `Change theme for: ${group.title}\nCurrent: ${getThemeLabel(group.themeId)}`,
    keyboard: Markup.inlineKeyboard([
      ...themeButtons("settings:preview", group.chatId),
      [Markup.button.callback("Back", "settings:open")]
    ]).reply_markup
  });

  const getSettingsPreviewPanel = async (
    group: {
      chatId: number;
      title: string;
      themeId: ThemeId;
    },
    themeId: ThemeId
  ): Promise<PrivatePanelPayload> => ({
    image: await getPreviewImage(themeId),
    filename: `settings-preview-${themeId}.png`,
    caption: `${group.title}\nPreview: ${getThemeLabel(themeId)}`,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback("Apply Theme To Group", `settings:confirm:${group.chatId}:${themeId}`)],
      [Markup.button.callback("Back", `settings:group:${group.chatId}`)]
    ]).reply_markup
  });

  const getSettingsAppliedPanel = async (
    group: {
      chatId: number;
      title: string;
      themeId: ThemeId;
    },
    themeId: ThemeId
  ): Promise<PrivatePanelPayload> => ({
    image: await getPreviewImage(themeId),
    filename: `settings-applied-${themeId}.png`,
    caption: `Done. ${group.title} now uses ${getThemeLabel(themeId)} theme.`,
    keyboard: Markup.inlineKeyboard([
      [Markup.button.callback("Open Group Settings", "settings:open")],
      [Markup.button.callback("Back to Themes", "theme:home")]
    ]).reply_markup
  });

  bot.start(async (ctx) => {
    if (!isPrivateChat(ctx)) {
      return;
    }

    const payload = parseStartPayload(ctx);
    if (payload === "settings") {
      const panel = await getSettingsHomePanel(ctx, ctx.from.id);
      await upsertPrivatePanelFromContext(ctx, ctx.from.id, panel, { cleanupIncomingCommand: true });
      return;
    }

    const panel = await getThemeHomePanel();
    await upsertPrivatePanelFromContext(ctx, ctx.from.id, panel, { cleanupIncomingCommand: true });
  });

  bot.command("themes", async (ctx) => {
    if (!isPrivateChat(ctx)) {
      return;
    }

    const panel = await getThemeHomePanel();
    await upsertPrivatePanelFromContext(ctx, ctx.from.id, panel, { cleanupIncomingCommand: true });
  });

  bot.command("settings", async (ctx) => {
    if (!isPrivateChat(ctx)) {
      return;
    }

    const panel = await getSettingsHomePanel(ctx, ctx.from.id);
    await upsertPrivatePanelFromContext(ctx, ctx.from.id, panel, { cleanupIncomingCommand: true });
  });

  bot.command("help", async (ctx) => {
    if (!isPrivateChat(ctx)) {
      return;
    }

    const panel = await getHelpPanel();
    await upsertPrivatePanelFromContext(ctx, ctx.from.id, panel, { cleanupIncomingCommand: true });
  });

  bot.action("theme:home", async (ctx) => {
    if (!isPrivateChat(ctx)) {
      await ctx.answerCbQuery("Open this in private chat.", { show_alert: false });
      return;
    }

    await ctx.answerCbQuery();
    const panel = await getThemeHomePanel();
    await upsertPrivatePanelFromContext(ctx, ctx.from.id, panel);
  });

  bot.action("theme:help", async (ctx) => {
    if (!isPrivateChat(ctx)) {
      await ctx.answerCbQuery("Use private chat for setup.", { show_alert: false });
      return;
    }

    await ctx.answerCbQuery();
    const panel = await getHelpPanel();
    await upsertPrivatePanelFromContext(ctx, ctx.from.id, panel);
  });

  bot.action(/^theme:preview:(.+)$/, async (ctx) => {
    if (!isPrivateChat(ctx)) {
      await ctx.answerCbQuery("Use private chat for setup.", { show_alert: false });
      return;
    }

    const themeId = parseThemeId(ctx.match[1]);
    if (!themeId) {
      await ctx.answerCbQuery("Unknown theme", { show_alert: true });
      return;
    }

    await ctx.answerCbQuery(`Preview: ${getThemeLabel(themeId)}`);

    const panel = await getThemePreviewPanel(themeId);
    await upsertPrivatePanelFromContext(ctx, ctx.from.id, panel);
  });

  bot.action(/^theme:confirm:(.+)$/, async (ctx) => {
    if (!isPrivateChat(ctx)) {
      await ctx.answerCbQuery("Use private chat for setup.", { show_alert: false });
      return;
    }

    const themeId = parseThemeId(ctx.match[1]);
    if (!themeId) {
      await ctx.answerCbQuery("Unknown theme", { show_alert: true });
      return;
    }

    await deps.themeState.setPendingTheme(ctx.from.id, themeId);
    const username = await resolveBotUsername(ctx);

    await ctx.answerCbQuery("Theme confirmed");

    const addUrl = username ? `https://t.me/${username}?startgroup=setup_${themeId}` : undefined;
    const panel = await getThemeConfirmedPanel(themeId, addUrl);
    await upsertPrivatePanelFromContext(ctx, ctx.from.id, panel);
  });

  bot.action("settings:open", async (ctx) => {
    if (!isPrivateChat(ctx)) {
      await ctx.answerCbQuery("Use private chat for settings.", { show_alert: false });
      return;
    }

    await ctx.answerCbQuery();
    const panel = await getSettingsHomePanel(ctx, ctx.from.id);
    await upsertPrivatePanelFromContext(ctx, ctx.from.id, panel);
  });

  bot.action(/^settings:group:(-?\d+)$/, async (ctx) => {
    if (!isPrivateChat(ctx)) {
      await ctx.answerCbQuery("Use private chat for settings.", { show_alert: false });
      return;
    }

    const chatId = Number(ctx.match[1]);
    const knownGroups = deps.themeState.listUserGroups(ctx.from.id);
    const allowedGroups = await filterAdminGroups(ctx, ctx.from.id, knownGroups);
    const selected = allowedGroups.find((group) => group.chatId === chatId);

    if (!selected) {
      await ctx.answerCbQuery("You are not admin in this group", { show_alert: true });
      return;
    }

    await ctx.answerCbQuery();
    const panel = await getSettingsGroupPanel(selected);
    await upsertPrivatePanelFromContext(ctx, ctx.from.id, panel);
  });

  bot.action(/^settings:preview:(-?\d+):(.+)$/, async (ctx) => {
    if (!isPrivateChat(ctx)) {
      await ctx.answerCbQuery("Use private chat for settings.", { show_alert: false });
      return;
    }

    const chatId = Number(ctx.match[1]);
    const themeId = parseThemeId(ctx.match[2]);

    if (!themeId) {
      await ctx.answerCbQuery("Unknown theme", { show_alert: true });
      return;
    }

    const knownGroups = deps.themeState.listUserGroups(ctx.from.id);
    const allowedGroups = await filterAdminGroups(ctx, ctx.from.id, knownGroups);
    const selected = allowedGroups.find((group) => group.chatId === chatId);

    if (!selected) {
      await ctx.answerCbQuery("You are not admin in this group", { show_alert: true });
      return;
    }

    await ctx.answerCbQuery(`Preview: ${getThemeLabel(themeId)}`);
    const panel = await getSettingsPreviewPanel(selected, themeId);
    await upsertPrivatePanelFromContext(ctx, ctx.from.id, panel);
  });

  bot.action(/^settings:confirm:(-?\d+):(.+)$/, async (ctx) => {
    if (!isPrivateChat(ctx)) {
      await ctx.answerCbQuery("Use private chat for settings.", { show_alert: false });
      return;
    }

    const chatId = Number(ctx.match[1]);
    const themeId = parseThemeId(ctx.match[2]);

    if (!themeId) {
      await ctx.answerCbQuery("Unknown theme", { show_alert: true });
      return;
    }

    const knownGroups = deps.themeState.listUserGroups(ctx.from.id);
    const allowedGroups = await filterAdminGroups(ctx, ctx.from.id, knownGroups);
    const selected = allowedGroups.find((group) => group.chatId === chatId);

    if (!selected) {
      await ctx.answerCbQuery("You are not admin in this group", { show_alert: true });
      return;
    }

    await deps.themeState.assignGroupTheme({
      chatId,
      title: selected.title,
      themeId,
      actorUserId: ctx.from.id
    });

    await ctx.answerCbQuery("Theme updated");

    const panel = await getSettingsAppliedPanel(selected, themeId);
    await upsertPrivatePanelFromContext(ctx, ctx.from.id, panel);
  });

  bot.on("my_chat_member", async (ctx) => {
    const chat = ctx.chat;
    if (!chat || (chat.type !== "group" && chat.type !== "supergroup")) {
      return;
    }

    const transition = ctx.myChatMember;
    const oldStatus = transition.old_chat_member.status;
    const newStatus = transition.new_chat_member.status;

    const wasInactive = !ACTIVE_STATUSES.has(oldStatus);
    const isNowActive = ACTIVE_STATUSES.has(newStatus);

    if (!wasInactive || !isNowActive) {
      return;
    }

    const actorUserId = ctx.from?.id;
    if (!actorUserId) {
      return;
    }

    const pendingTheme = deps.themeState.getPendingTheme(actorUserId);
    const selectedTheme = pendingTheme ?? DEFAULT_THEME_ID;

    await deps.themeState.assignGroupTheme({
      chatId: chat.id,
      title: chat.title,
      themeId: selectedTheme,
      actorUserId
    });

    if (pendingTheme) {
      await deps.themeState.clearPendingTheme(actorUserId);
    }

    try {
      const panel: PrivatePanelPayload = {
        image: await getPreviewImage(selectedTheme),
        filename: `group-linked-${selectedTheme}.png`,
        caption: `Group linked: ${chat.title}\nTheme: ${getThemeLabel(selectedTheme)}\nUse settings to change anytime.`,
        keyboard: Markup.inlineKeyboard([
          [Markup.button.callback("Open Group Settings", "settings:open")],
          [Markup.button.callback("Back to Themes", "theme:home")]
        ]).reply_markup
      };

      await upsertPrivatePanelByUserId(actorUserId, panel);
    } catch (error) {
      deps.logger.debug({ err: String(error), actorUserId }, "Could not send or update DM after group link");
    }
  });

  for (const command of SUPPORTED_COIN_COMMANDS) {
    bot.command(command, async (ctx) => {
      if (!isGroupChat(ctx) && !isPrivateChat(ctx)) {
        return;
      }

      if (isRateLimited(ctx.chat?.id, limiter)) {
        await ctx.reply("Please wait 1-2 seconds before sending another command.");
        return;
      }

      const themeId = isGroupChat(ctx)
        ? deps.themeState.getGroupTheme(ctx.chat.id)
        : deps.themeState.getPendingTheme(ctx.from.id) ?? DEFAULT_THEME_ID;
      await executeCoinCommand(
        command,
        deps,
        {
          chatId: ctx.chat?.id,
          isGroupChat: isGroupChat(ctx),
          reply: (text) => ctx.reply(text),
          sendChatAction: (action) => ctx.sendChatAction(action),
          replyWithPhoto: (photo, options) => ctx.replyWithPhoto(photo, options)
        },
        themeId
      );
    });
  }

  bot.command("top", async (ctx) => {
    if (!isGroupChat(ctx) && !isPrivateChat(ctx)) {
      return;
    }

    if (isRateLimited(ctx.chat?.id, limiter)) {
      await ctx.reply("Please wait 1-2 seconds before sending another command.");
      return;
    }

    const themeId = isGroupChat(ctx)
      ? deps.themeState.getGroupTheme(ctx.chat.id)
      : deps.themeState.getPendingTheme(ctx.from.id) ?? DEFAULT_THEME_ID;
    await executeTopCommand(
      deps,
      {
        chatId: ctx.chat?.id,
        isGroupChat: isGroupChat(ctx),
        reply: (text) => ctx.reply(text),
        sendChatAction: (action) => ctx.sendChatAction(action),
        replyWithPhoto: (photo, options) => ctx.replyWithPhoto(photo, options)
      },
      themeId
    );
  });

  bot.hears(/^\/([a-zA-Z0-9]{2,20})(?:@[A-Za-z0-9_]+)?$/, async (ctx) => {
    if (!isGroupChat(ctx) && !isPrivateChat(ctx)) {
      return;
    }

    const symbol = ctx.match[1].toLowerCase();
    if (RESERVED_COMMANDS.has(symbol)) {
      return;
    }

    if (isRateLimited(ctx.chat?.id, limiter)) {
      await ctx.reply("Please wait 1-2 seconds before sending another command.");
      return;
    }

    const themeId = isGroupChat(ctx)
      ? deps.themeState.getGroupTheme(ctx.chat.id)
      : deps.themeState.getPendingTheme(ctx.from.id) ?? DEFAULT_THEME_ID;

    await executeCoinCommand(
      symbol,
      deps,
      {
        chatId: ctx.chat?.id,
        isGroupChat: isGroupChat(ctx),
        reply: (text) => ctx.reply(text),
        sendChatAction: (action) => ctx.sendChatAction(action),
        replyWithPhoto: (photo, options) => ctx.replyWithPhoto(photo, options)
      },
      themeId
    );
  });

  bot.catch(async (error, ctx) => {
    deps.logger.error({ err: String(error), updateId: ctx.update.update_id }, "Unhandled bot error");

    if ("callback_query" in ctx.update) {
      try {
        await ctx.answerCbQuery("Unexpected error. Please tap again.", { show_alert: true });
      } catch {
        deps.logger.warn("Failed to answer callback error");
      }
      return;
    }

    if (!isPrivateChat(ctx)) {
      return;
    }

    const privateChatId = ctx.chat?.id;
    if (!privateChatId) {
      return;
    }

    try {
      const message = await ctx.reply("Unexpected bot error. Please try again shortly.");
      const timer = setTimeout(() => {
        void deleteMessageQuietly(ctx.telegram, privateChatId, message.message_id, deps.logger);
      }, 6000);
      timer.unref();
    } catch {
      deps.logger.warn("Failed to send error reply to chat");
    }
  });

  return bot;
}
