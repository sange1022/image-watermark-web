export class MacImportBatch {
  private remaining: Set<string> | null = null;
  get remainingCount() { return this.remaining?.size ?? 0; }
  queue(eligible: string[]) {
    if (!this.remaining) this.remaining = new Set(eligible);
    const allowed = new Set(eligible);
    for (const id of this.remaining) if (!allowed.has(id)) this.remaining.delete(id);
    const result = [...this.remaining];
    if (!result.length) this.remaining = null;
    return result;
  }
  saved(id: string) { this.remove(id); }
  remove(id: string) {
    this.remaining?.delete(id);
    if (!this.remaining?.size) this.remaining = null;
  }
  clear() { this.remaining = null; }
}
