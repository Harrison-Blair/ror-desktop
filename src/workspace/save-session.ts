export type SaveStatus = "saved" | "unsaved" | "saving" | "failed";

let nextSessionId = 0;

/** One note's draft and serialized writes. A frozen session never starts timer writes. */
export class SaveSession {
  readonly id = ++nextSessionId;
  content: string;
  status: SaveStatus = "saved";
  error: unknown;
  private revision = 0;
  private savedRevision = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private frozen = false;
  private disposed = false;

  constructor(
    content: string,
    private write: (content: string) => Promise<void>,
    private changed: () => void,
  ) {
    this.content = content;
  }

  get dirty() {
    return this.revision !== this.savedRevision;
  }

  edit(content: string) {
    if (this.disposed || content === this.content) return;
    this.content = content;
    this.revision++;
    if (!this.active) this.status = "unsaved";
    this.changed();
    this.schedule();
  }

  private schedule() {
    clearTimeout(this.timer);
    if (!this.frozen && !this.disposed && this.dirty) {
      this.timer = setTimeout(() => {
        void this.drain(false).catch(() => {});
      }, 500);
    }
  }

  private async drain(force: boolean): Promise<void> {
    clearTimeout(this.timer);
    if (this.active) {
      await this.active;
      return this.drain(force);
    }
    if (this.disposed || (!force && this.frozen) || !this.dirty) return;
    const revision = this.revision;
    this.status = "saving";
    this.error = undefined;
    this.changed();
    this.active = this.write(this.content);
    try {
      await this.active;
      this.savedRevision = revision;
      this.status = this.dirty ? "unsaved" : "saved";
    } catch (error) {
      clearTimeout(this.timer);
      this.status = "failed";
      this.error = error;
      throw error;
    } finally {
      this.active = undefined;
      if (!this.disposed) this.changed();
    }
    return this.drain(force);
  }

  flush() {
    return this.drain(true);
  }

  async freeze() {
    this.frozen = true;
    clearTimeout(this.timer);
    // A failed active write is retained; discard can still reload from disk.
    await this.active?.catch(() => {});
  }

  resume() {
    this.frozen = false;
    this.schedule();
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
  }
}
