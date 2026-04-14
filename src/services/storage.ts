/**
 * Minimal KV storage interface used by ThemeStateStore.
 * Implementations: MemoryStorage (dev/test), FileStorage (local), UpstashKvStorage (Vercel / Upstash Redis).
 */
export interface KvStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/**
 * In-memory storage — never use as the only backend in production.
 * State is lost on every cold start.
 */
export class MemoryStorage implements KvStorage {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

/**
 * Filesystem storage — suitable for local development only.
 * On Vercel / serverless, /tmp is ephemeral so this should not be used as primary storage.
 */
export class FileStorage implements KvStorage {
  constructor(private readonly filePath: string) {}

  async get(_key: string): Promise<string | null> {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      return await fs.readFile(this.filePath, "utf8");
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }

  async set(_key: string, value: string): Promise<void> {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, value, "utf8");
  }
}

/**
 * Vercel KV / Upstash Redis HTTP adapter.
 * Requires environment variables KV_REST_API_URL and KV_REST_API_TOKEN
 * (set automatically by the Vercel KV integration, or manually for Upstash Redis).
 */
export class UpstashKvStorage implements KvStorage {
  private readonly url: string;
  private readonly token: string;

  constructor(url: string, token: string) {
    this.url = url.replace(/\/$/, "");
    this.token = token;
  }

  async get(key: string): Promise<string | null> {
    const res = await fetch(`${this.url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`KV GET failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as { result: string | null };
    return json.result;
  }

  async set(key: string, value: string): Promise<void> {
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
