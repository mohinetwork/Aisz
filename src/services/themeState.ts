import fs from "node:fs/promises";
import path from "node:path";
import type { Logger } from "pino";
import { DEFAULT_THEME_ID, parseThemeId, type ThemeId } from "../themes";

interface PendingTheme {
  themeId: ThemeId;
  confirmedAtIso: string;
}

interface GroupThemeState {
  chatId: number;
  title: string;
  themeId: ThemeId;
  updatedByUserId: number;
  updatedAtIso: string;
}

interface ThemeStateFile {
  groups: Record<string, GroupThemeState>;
  pendingThemesByUser: Record<string, PendingTheme>;
  userGroups: Record<string, number[]>;
}

interface ListedGroupTheme {
  chatId: number;
  title: string;
  themeId: ThemeId;
}

const EMPTY_STATE: ThemeStateFile = {
  groups: {},
  pendingThemesByUser: {},
  userGroups: {}
};

export class ThemeStateStore {
  private data: ThemeStateFile = { ...EMPTY_STATE };
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string, private readonly logger: Logger) {
    this.filePath = path.join(dataDir, "theme-state.json");
  }

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const file = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(file) as Partial<ThemeStateFile>;

      this.data = {
        groups: parsed.groups ?? {},
        pendingThemesByUser: parsed.pendingThemesByUser ?? {},
        userGroups: parsed.userGroups ?? {}
      };

      this.sanitize();
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        this.logger.warn({ err: err.message }, "Failed to read theme state file; using empty state");
      }
      this.data = { ...EMPTY_STATE };
      await this.flush();
    }
  }

  getGroupTheme(chatId: number): ThemeId {
    const entry = this.data.groups[String(chatId)];
    if (!entry) {
      return DEFAULT_THEME_ID;
    }

    return parseThemeId(entry.themeId) ?? DEFAULT_THEME_ID;
  }

  getGroup(chatId: number): ListedGroupTheme | undefined {
    const entry = this.data.groups[String(chatId)];
    if (!entry) {
      return undefined;
    }

    return {
      chatId: entry.chatId,
      title: entry.title,
      themeId: parseThemeId(entry.themeId) ?? DEFAULT_THEME_ID
    };
  }

  listUserGroups(userId: number): ListedGroupTheme[] {
    const chatIds = this.data.userGroups[String(userId)] ?? [];

    return chatIds
      .map((chatId) => this.getGroup(chatId))
      .filter((group): group is ListedGroupTheme => group !== undefined);
  }

  getPendingTheme(userId: number): ThemeId | undefined {
    const pending = this.data.pendingThemesByUser[String(userId)];
    if (!pending) {
      return undefined;
    }

    return parseThemeId(pending.themeId);
  }

  async setPendingTheme(userId: number, themeId: ThemeId): Promise<void> {
    this.data.pendingThemesByUser[String(userId)] = {
      themeId,
      confirmedAtIso: new Date().toISOString()
    };
    await this.enqueueFlush();
  }

  async clearPendingTheme(userId: number): Promise<void> {
    delete this.data.pendingThemesByUser[String(userId)];
    await this.enqueueFlush();
  }

  async assignGroupTheme(options: {
    chatId: number;
    title: string;
    themeId: ThemeId;
    actorUserId: number;
  }): Promise<void> {
    const key = String(options.chatId);

    this.data.groups[key] = {
      chatId: options.chatId,
      title: options.title,
      themeId: options.themeId,
      updatedByUserId: options.actorUserId,
      updatedAtIso: new Date().toISOString()
    };

    this.linkUserGroupInMemory(options.actorUserId, options.chatId);
    await this.enqueueFlush();
  }

  async linkUserGroup(userId: number, chatId: number): Promise<void> {
    this.linkUserGroupInMemory(userId, chatId);
    await this.enqueueFlush();
  }

  private linkUserGroupInMemory(userId: number, chatId: number): void {
    const userKey = String(userId);
    const list = this.data.userGroups[userKey] ?? [];

    if (!list.includes(chatId)) {
      list.push(chatId);
      this.data.userGroups[userKey] = list;
    }
  }

  private sanitize(): void {
    for (const [chatId, group] of Object.entries(this.data.groups)) {
      const themeId = parseThemeId(group.themeId) ?? DEFAULT_THEME_ID;
      this.data.groups[chatId] = {
        ...group,
        chatId: Number(chatId),
        themeId
      };
    }

    for (const [userId, pending] of Object.entries(this.data.pendingThemesByUser)) {
      const themeId = parseThemeId(pending.themeId);
      if (!themeId) {
        delete this.data.pendingThemesByUser[userId];
        continue;
      }
      this.data.pendingThemesByUser[userId] = {
        ...pending,
        themeId
      };
    }

    for (const [userId, groupList] of Object.entries(this.data.userGroups)) {
      this.data.userGroups[userId] = Array.from(new Set(groupList.map((value) => Number(value)).filter(Boolean)));
    }
  }

  private async enqueueFlush(): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => this.flush()).catch((error) => {
      this.logger.error({ err: String(error) }, "Failed to persist theme state");
    });

    await this.writeQueue;
  }

  private async flush(): Promise<void> {
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }
}
