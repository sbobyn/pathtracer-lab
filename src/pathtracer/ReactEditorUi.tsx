import { useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import type PtActions from "./PtActions";
import type { PtUiAdapter } from "./PtUiAdapter";

function EditorShell({ actions }: { actions: PtActions }) {
  const state = useSyncExternalStore(
    (listener) => actions.subscribe(listener),
    () => actions.getState()
  );

  return (
    <aside className="editor-shell" aria-label="Path tracer editor">
      <div className="editor-shell__title">Path Tracer</div>
      <div className="editor-shell__status">
        <span>{state.sceneKey}</span>
        <span>
          {state.selection.sphereIndex === null
            ? "No selection"
            : `Sphere ${state.selection.sphereIndex}`}
        </span>
      </div>
      <div className="editor-shell__history">
        <button
          type="button"
          disabled={!state.history.canUndo}
          title={state.history.undoLabel ?? undefined}
          onClick={() => actions.undo()}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!state.history.canRedo}
          title={state.history.redoLabel ?? undefined}
          onClick={() => actions.redo()}
        >
          Redo
        </button>
      </div>
    </aside>
  );
}

export default class ReactEditorUi implements PtUiAdapter {
  private readonly root: Root;

  constructor(
    private readonly element: HTMLElement,
    actions: PtActions
  ) {
    this.root = createRoot(element);
    this.root.render(<EditorShell actions={actions} />);
  }

  public contains(target: Node) {
    return this.element.contains(target);
  }

  public showSelection() {}

  public hideSelection() {}

  public dispose() {
    this.root.unmount();
    this.element.remove();
  }
}
