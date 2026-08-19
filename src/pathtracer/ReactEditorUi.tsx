import { useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import type PtActions from "./PtActions";
import type { PtUiAdapter } from "./PtUiAdapter";
import type { PtState } from "./PtState";
import { PresetPtScenes } from "./PresetPtScenes";

function clampNumber(
  value: number,
  minimum: number,
  maximum: number,
  setter: (nextValue: number) => void
) {
  if (!Number.isFinite(value)) return;
  setter(Math.min(maximum, Math.max(minimum, value)));
}

function SceneSettings({
  state,
  actions,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
}) {
  return (
    <section className="editor-panel" aria-labelledby="scene-settings-title">
      <h2 id="scene-settings-title">Scene</h2>
      <label className="editor-control">
        <span>Preset</span>
        <select
          value={state.sceneKey}
          onChange={(event) => actions.setScene(event.currentTarget.value)}
        >
          {Object.keys(PresetPtScenes).map((sceneKey) => (
            <option key={sceneKey} value={sceneKey}>
              {sceneKey}
            </option>
          ))}
        </select>
      </label>
      <label className="editor-control">
        <span>Field of view</span>
        <input
          type="number"
          min={10}
          max={120}
          step={1}
          value={state.settings.fov}
          onChange={(event) =>
            clampNumber(event.currentTarget.valueAsNumber, 10, 120, (value) =>
              actions.setFov(Math.round(value))
            )
          }
        />
      </label>
      <label className="editor-control">
        <span>Sky color</span>
        <input
          type="color"
          value={state.settings.backgroundColorTop}
          onChange={(event) =>
            actions.setBackgroundColorTop(event.currentTarget.value)
          }
        />
      </label>
      <label className="editor-control">
        <span>Horizon color</span>
        <input
          type="color"
          value={state.settings.backgroundColorBottom}
          onChange={(event) =>
            actions.setBackgroundColorBottom(event.currentTarget.value)
          }
        />
      </label>
    </section>
  );
}

function RenderSettings({
  state,
  actions,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
}) {
  const { settings } = state;
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
            clampNumber(
              event.currentTarget.valueAsNumber,
              1,
              20,
              (value) => actions.setNumSamples(Math.round(value))
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
            clampNumber(
              event.currentTarget.valueAsNumber,
              1,
              20,
              (value) => actions.setMaxRayDepth(Math.round(value))
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
      <label className="editor-control">
        <span>Accumulation</span>
        <select
          value={settings.accumulationFormat}
          onChange={(event) =>
            actions.setAccumulationFormat(
              event.currentTarget.value as typeof settings.accumulationFormat
            )
          }
        >
          <option value="rgba32f">32-bit float</option>
          <option value="rgba16f">16-bit float</option>
          <option value="rgba8">8-bit</option>
        </select>
      </label>
      <label className="editor-control">
        <span>Frame limit</span>
        <input
          type="number"
          min={0}
          max={100000}
          step={1}
          value={settings.maxAccumulationFrames}
          onChange={(event) =>
            clampNumber(
              event.currentTarget.valueAsNumber,
              0,
              100000,
              (value) => actions.setMaxAccumulationFrames(Math.round(value))
            )
          }
        />
      </label>
    </section>
  );
}

function CameraSettings({
  state,
  actions,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
}) {
  const { settings } = state;
  return (
    <section className="editor-panel" aria-labelledby="camera-settings-title">
      <h2 id="camera-settings-title">Camera</h2>
      <label className="editor-control editor-control--checkbox">
        <span>Depth of field</span>
        <input
          type="checkbox"
          checked={settings.enableDepthOfField}
          onChange={(event) =>
            actions.setDepthOfFieldEnabled(event.currentTarget.checked)
          }
        />
      </label>
      <label className="editor-control">
        <span>Aperture</span>
        <input
          type="number"
          min={0}
          max={0.1}
          step={0.001}
          disabled={!settings.enableDepthOfField}
          value={settings.aperture}
          onChange={(event) =>
            clampNumber(event.currentTarget.valueAsNumber, 0, 0.1, (value) =>
              actions.setAperture(value)
            )
          }
        />
      </label>
      <label className="editor-control">
        <span>Focus distance</span>
        <input
          type="number"
          min={0.1}
          max={20}
          step={0.1}
          disabled={!settings.enableDepthOfField}
          value={settings.focusDistance}
          onChange={(event) =>
            clampNumber(event.currentTarget.valueAsNumber, 0.1, 20, (value) =>
              actions.setFocusDistance(value)
            )
          }
        />
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
      <SceneSettings state={state} actions={actions} />
      <RenderSettings state={state} actions={actions} />
      <CameraSettings state={state} actions={actions} />
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
