import type PtActions from "./PtActions";

export type PtUiFactory = (actions: PtActions) => PtUiAdapter;

export interface PtUiAdapter {
  contains(target: Node): boolean;
  dispose(): void;
}
