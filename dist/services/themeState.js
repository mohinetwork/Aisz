"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThemeStateStore = void 0;
const themes_1 = require("../themes");
const STATE_KEY = "theme-state";
const EMPTY_STATE = {
    groups: {},
    pendingThemesByUser: {},
    userGroups: {}
};
class ThemeStateStore {
    storage;
    logger;
    data = { ...EMPTY_STATE };
    writeQueue = Promise.resolve();
    constructor(storage, logger) {
        this.storage = storage;
        this.logger = logger;
    }
    async init() {
        try {
            const raw = await this.storage.get(STATE_KEY);
            if (!raw) {
                this.data = { ...EMPTY_STATE };
                return;
            }
            const parsed = JSON.parse(raw);
            this.data = {
                groups: parsed.groups ?? {},
                pendingThemesByUser: parsed.pendingThemesByUser ?? {},
                userGroups: parsed.userGroups ?? {}
            };
            this.sanitize();
            this.logger.info("Theme state loaded from storage");
        }
        catch (error) {
            this.logger.warn({ err: String(error) }, "Failed to load theme state; starting with empty state");
            this.data = { ...EMPTY_STATE };
        }
    }
    getGroupTheme(chatId) {
        const entry = this.data.groups[String(chatId)];
        if (!entry) {
            return themes_1.DEFAULT_THEME_ID;
        }
        return (0, themes_1.parseThemeId)(entry.themeId) ?? themes_1.DEFAULT_THEME_ID;
    }
    getGroup(chatId) {
        const entry = this.data.groups[String(chatId)];
        if (!entry) {
            return undefined;
        }
        return {
            chatId: entry.chatId,
            title: entry.title,
            themeId: (0, themes_1.parseThemeId)(entry.themeId) ?? themes_1.DEFAULT_THEME_ID
        };
    }
    listUserGroups(userId) {
        const chatIds = this.data.userGroups[String(userId)] ?? [];
        return chatIds
            .map((chatId) => this.getGroup(chatId))
            .filter((group) => group !== undefined);
    }
    getPendingTheme(userId) {
        const pending = this.data.pendingThemesByUser[String(userId)];
        if (!pending) {
            return undefined;
        }
        return (0, themes_1.parseThemeId)(pending.themeId);
    }
    async setPendingTheme(userId, themeId) {
        this.data.pendingThemesByUser[String(userId)] = {
            themeId,
            confirmedAtIso: new Date().toISOString()
        };
        await this.enqueueFlush();
    }
    async clearPendingTheme(userId) {
        delete this.data.pendingThemesByUser[String(userId)];
        await this.enqueueFlush();
    }
    async assignGroupTheme(options) {
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
    async linkUserGroup(userId, chatId) {
        this.linkUserGroupInMemory(userId, chatId);
        await this.enqueueFlush();
    }
    linkUserGroupInMemory(userId, chatId) {
        const userKey = String(userId);
        const list = this.data.userGroups[userKey] ?? [];
        if (!list.includes(chatId)) {
            list.push(chatId);
            this.data.userGroups[userKey] = list;
        }
    }
    sanitize() {
        for (const [chatId, group] of Object.entries(this.data.groups)) {
            const themeId = (0, themes_1.parseThemeId)(group.themeId) ?? themes_1.DEFAULT_THEME_ID;
            this.data.groups[chatId] = { ...group, chatId: Number(chatId), themeId };
        }
        for (const [userId, pending] of Object.entries(this.data.pendingThemesByUser)) {
            const themeId = (0, themes_1.parseThemeId)(pending.themeId);
            if (!themeId) {
                delete this.data.pendingThemesByUser[userId];
                continue;
            }
            this.data.pendingThemesByUser[userId] = { ...pending, themeId };
        }
        for (const [userId, groupList] of Object.entries(this.data.userGroups)) {
            this.data.userGroups[userId] = Array.from(new Set(groupList.map((v) => Number(v)).filter(Boolean)));
        }
    }
    async enqueueFlush() {
        this.writeQueue = this.writeQueue
            .then(() => this.flush())
            .catch((error) => {
            this.logger.error({ err: String(error) }, "Failed to persist theme state");
        });
        await this.writeQueue;
    }
    async flush() {
        await this.storage.set(STATE_KEY, JSON.stringify(this.data));
    }
}
exports.ThemeStateStore = ThemeStateStore;
