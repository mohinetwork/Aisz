"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatRateLimiter = void 0;
class ChatRateLimiter {
    minIntervalMs;
    idleTtlMs;
    cleanupEvery;
    stateByChat = new Map();
    checksSinceCleanup = 0;
    constructor(minIntervalMs = 2000, idleTtlMs = 6 * 60 * 60 * 1000, cleanupEvery = 500) {
        this.minIntervalMs = minIntervalMs;
        this.idleTtlMs = idleTtlMs;
        this.cleanupEvery = cleanupEvery;
    }
    tryConsume(chatId) {
        const now = Date.now();
        const state = this.stateByChat.get(chatId);
        const previous = state?.lastRequestAt ?? 0;
        if (now - previous < this.minIntervalMs) {
            this.stateByChat.set(chatId, {
                lastRequestAt: previous,
                lastSeenAt: now
            });
            this.maybeCleanup(now);
            return false;
        }
        this.stateByChat.set(chatId, {
            lastRequestAt: now,
            lastSeenAt: now
        });
        this.maybeCleanup(now);
        return true;
    }
    maybeCleanup(now) {
        this.checksSinceCleanup += 1;
        if (this.checksSinceCleanup < this.cleanupEvery) {
            return;
        }
        this.checksSinceCleanup = 0;
        for (const [chatId, state] of this.stateByChat.entries()) {
            if (now - state.lastSeenAt > this.idleTtlMs) {
                this.stateByChat.delete(chatId);
            }
        }
    }
}
exports.ChatRateLimiter = ChatRateLimiter;
