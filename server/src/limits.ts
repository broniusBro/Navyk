// Дневной лимит проверок в памяти процесса (сброс в полночь UTC).
// Для одного сервера на старте этого достаточно; при масштабировании заменить на Redis/Postgres.
export class DailyLimiter {
  private day = DailyLimiter.today();
  private counts = new Map<string, number>();
  readonly perDay: number;

  constructor(perDay: number) {
    this.perDay = perDay;
  }

  static today(now = new Date()): string {
    return now.toISOString().slice(0, 10);
  }

  private rollover(now = new Date()) {
    const d = DailyLimiter.today(now);
    if (d !== this.day) {
      this.day = d;
      this.counts.clear();
    }
  }

  canUse(key: string, now = new Date()): boolean {
    this.rollover(now);
    return (this.counts.get(key) ?? 0) < this.perDay;
  }

  use(key: string, now = new Date()): void {
    this.rollover(now);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  remaining(key: string): number {
    return Math.max(0, this.perDay - (this.counts.get(key) ?? 0));
  }

  resetAt(now = new Date()): string {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return next.toISOString();
  }
}
