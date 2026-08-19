import type PtActions from "./PtActions";
import type { PtPreviewMaterial } from "./PtScene";

export type PtUiFactory = (actions: PtActions) => PtUiAdapter;

export interface PtUiAdapter {
  contains(target: Node): boolean;
  showSelection(
    material: PtPreviewMaterial,
    materialId: number,
    materialType: number
  ): void;
  hideSelection(): void;
  dispose(): void;
}
