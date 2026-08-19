import { useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import type PtActions from "./PtActions";
import type { PtUiAdapter } from "./PtUiAdapter";
import type { PtState } from "./PtState";

function RenderSettings({
  state,
  actions,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
}) {
  const { settings } = state;
  const setBoundedInteger = (
    value: number,
    minimum: number,
    maximum: number,
    setter: (nextValue: number) => void
  ) => {
    if (!Number.isFinite(value)) return;
    setter(Math.min(maximum, Math.max(minimum, Math.round(value))));
  };
  return (
    <section className="editor-panel" aria-labelledby="render-settings-title">
      <h2 id="render-settings-title">Render</h2>
      <label className="editor-control editor-control--checkbox">
        <span>Path tracing</span>
        <input
          type="checkbox"
          checked={settings.pathtracingEnabled}
          onChange={(event) =>
            actions.setPathtracingEnabled(event.currentTarget.checked)
          }
        />
      </label>
      <label className="editor-control">
        <span>Samples</span>
        <input
          type="number"
          min={1}
          max={20}
          step={1}
          value={settings.numSamples}
          onChange={(event) =>
            setBoundedInteger(
              event.currentTarget.valueAsNumber,
              1,
              20,
              (value) => actions.setNumSamples(value)
            )
          }
        />
      </label>
      <label className="editor-control">
        <span>Ray depth</span>
        <input
          type="number"
          min={1}
          max={20}
          step={1}
          value={settings.maxRayDepth}
          onChange={(event) =>
            setBoundedInteger(
              event.currentTarget.valueAsNumber,
              1,
              20,
              (value) => actions.setMaxRayDepth(value)
            )
          }
        />
      </label>
      <label className="editor-control">
        <span>Resolution</span>
        <select
          value={settings.resolutionScale}
          onChange={(event) =>
            actions.setResolutionScale(Number(event.currentTarget.value))
          }
        >
          {[2, 1, 0.5, 0.25, 0.125, 0.0625].map((scale) => (
            <option key={scale} value={scale}>
              {scale}×
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

function EditorShell({ actions }: { actions: PtActions }) {
  const state = useSyncExternalStore(
    (listener) => actions.subscribe(listener),
    () => actions.getState()
  );

  return (
    <aside className="editor-shell" aria-label="Path tracer editor">
      <div className="editor-shell__header">
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
      </div>
      <RenderSettings state={state} actions={actions} />
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
