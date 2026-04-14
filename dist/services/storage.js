"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpstashKvStorage = exports.FileStorage = exports.MemoryStorage = void 0;
/**
 * In-memory storage — never use as the only backend in production.
 * State is lost on every cold start.
 */
class MemoryStorage {
    store = new Map();
    async get(key) {
        return this.store.get(key) ?? null;
    }
    async set(key, value) {
        this.store.set(key, value);
    }
}
exports.MemoryStorage = MemoryStorage;
/**
 * Filesystem storage — suitable for local development only.
 * On Vercel / serverless, /tmp is ephemeral so this should not be used as primary storage.
 */
class FileStorage {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    async get(_key) {
        const fs = await Promise.resolve().then(() => __importStar(require("node:fs/promises")));
        const path = await Promise.resolve().then(() => __importStar(require("node:path")));
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        try {
            return await fs.readFile(this.filePath, "utf8");
        }
        catch (err) {
            const e = err;
            if (e.code === "ENOENT")
                return null;
            throw e;
        }
    }
    async set(_key, value) {
        const fs = await Promise.resolve().then(() => __importStar(require("node:fs/promises")));
        const path = await Promise.resolve().then(() => __importStar(require("node:path")));
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, value, "utf8");
    }
}
exports.FileStorage = FileStorage;
/**
 * Vercel KV / Upstash Redis HTTP adapter.
 * Requires environment variables KV_REST_API_URL and KV_REST_API_TOKEN
 * (set automatically by the Vercel KV integration, or manually for Upstash Redis).
 */
class UpstashKvStorage {
    url;
    token;
    constructor(url, token) {
        this.url = url.replace(/\/$/, "");
        this.token = token;
    }
    async get(key) {
        const res = await fetch(`${this.url}/get/${encodeURIComponent(key)}`, {
            headers: { Authorization: `Bearer ${this.token}` }
        });
        if (!res.ok) {
            if (res.status === 404)
                return null;
            throw new Error(`KV GET failed: ${res.status} ${res.statusText}`);
        }
        const json = (await res.json());
        return json.result;
    }
    async set(key, value) {
        const res = await fetch(`${this.url}/set/${encodeURIComponent(key)}`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(value)
        });
        if (!res.ok) {
            throw new Error(`KV SET failed: ${res.status} ${res.statusText}`);
        }
    }
}
exports.UpstashKvStorage = UpstashKvStorage;
