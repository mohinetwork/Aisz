"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TtlCache = void 0;
class TtlCache {
    store = new Map();
    get(key) {
        const item = this.store.get(key);
        if (!item) {
            return undefined;
        }
        if (Date.now() > item.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return item.value;
    }
    set(key, value, ttlMs) {
        this.store.set(key, {
            value,
            expiresAt: Date.now() + ttlMs
        });
    }
    has(key) {
        return this.get(key) !== undefined;
    }
    clear() {
        this.store.clear();
    }
}
exports.TtlCache = TtlCache;
