export class ChatRateLimiter {
  private readonly stateByChat = new Map<number, { lastRequestAt: number; lastSeenAt: number }>();
  private checksSinceCleanup = 0;

  constructor(
    private readonly minIntervalMs = 2000,
    private readonly idleTtlMs = 6 * 60 * 60 * 1000,
    private readonly cleanupEvery = 500
  ) {}

  tryConsume(chatId: number): boolean {
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

  private maybeCleanup(now: number): void {
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
