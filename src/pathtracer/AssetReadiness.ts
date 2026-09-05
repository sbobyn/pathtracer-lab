/** Tracks settling without retaining scenes or letting stale async work revive a disposed app. */
export class AssetReadiness {
  private settled = new WeakSet<Promise<unknown>>();
  private watched = new WeakSet<Promise<unknown>>();
  private disposed = false;
  private onSettled: () => void;

  constructor(onSettled: () => void) { this.onSettled = onSettled; }

  ready(loads: readonly (Promise<unknown> | null)[]): boolean {
    let ready = true;
    for (const load of loads) {
      if (!load || this.settled.has(load)) continue;
      ready = false;
      if (this.watched.has(load)) continue;
      this.watched.add(load);
      const settle = () => {
        this.settled.add(load);
        if (!this.disposed) this.onSettled();
      };
      // Failed assets are reported by the UI; they must not hang calibration.
      void load.then(settle, settle);
    }
    return ready;
  }

  dispose() { this.disposed = true; }
}
