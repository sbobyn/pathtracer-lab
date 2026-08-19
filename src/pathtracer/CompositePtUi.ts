import type { PtUiAdapter } from "./PtUiAdapter";

export default class CompositePtUi implements PtUiAdapter {
  constructor(private readonly adapters: PtUiAdapter[]) {}

  public contains(target: Node) {
    return this.adapters.some((adapter) => adapter.contains(target));
  }

  public showSelection(...args: Parameters<PtUiAdapter["showSelection"]>) {
    this.adapters.forEach((adapter) => adapter.showSelection(...args));
  }

  public hideSelection() {
    this.adapters.forEach((adapter) => adapter.hideSelection());
  }

  public dispose() {
    this.adapters.forEach((adapter) => adapter.dispose());
  }
}
