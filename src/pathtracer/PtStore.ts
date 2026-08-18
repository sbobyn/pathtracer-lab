import type { PtState } from "./PtState";

export type PtStateListener = (state: Readonly<PtState>) => void;

export default class PtStore {
  private state: PtState;
  private readonly listeners = new Set<PtStateListener>();

  constructor(initialState: PtState) {
    this.state = structuredClone(initialState);
  }

  public getState(): Readonly<PtState> {
    return this.state;
  }

  public update(updater: (state: PtState) => PtState) {
    this.state = updater(this.state);
    this.listeners.forEach((listener) => listener(this.state));
  }

  public subscribe(listener: PtStateListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
