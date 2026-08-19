import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import type PtActions from "./PtActions";
import type { PtUiAdapter } from "./PtUiAdapter";
import type { PtState } from "./PtState";
import { PresetPtScenes } from "./PresetPtScenes";
import { computeNumberScrubValue } from "./numberScrub";

function commitSetting(actions: PtActions, label: string, update: () => void) {
  actions.beginSettingsEdit(label);
  update();
  actions.commitSettingsEdit();
}

function NumberField({
  actions,
  label,
  value,
  minimum,
  maximum,
  step,
  coarseStep,
  integer = false,
  disabled = false,
  setValue,
}: {
  actions: PtActions;
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  coarseStep: number;
  integer?: boolean;
  disabled?: boolean;
  setValue: (value: number) => void;
}) {
  const gesture = useRef<{
    pointerId: number;
    startY: number;
    lastY: number;
    lastValue: number;
    scrubbing: boolean;
  } | null>(null);

  const apply = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) return null;
    const bounded = Math.min(maximum, Math.max(minimum, nextValue));
    setValue(integer ? Math.round(bounded) : Number(bounded.toFixed(6)));
    return bounded;
  };

  const begin = () => actions.beginSettingsEdit(label);
  const finish = () => actions.commitSettingsEdit();

  return (
    <input
      type="number"
      min={minimum}
      max={maximum}
      step={step}
      disabled={disabled}
      value={value}
      title="Drag up/down to adjust · Shift for precision · Ctrl/⌘ to snap"
      data-scrubbing={gesture.current?.scrubbing ?? false}
      onFocus={begin}
      onChange={(event) => {
        begin();
        apply(event.currentTarget.valueAsNumber);
      }}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          actions.cancelSettingsEdit();
          event.currentTarget.blur();
        }
      }}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        begin();
        gesture.current = {
          pointerId: event.pointerId,
          startY: event.clientY,
          lastY: event.clientY,
          lastValue: value,
          scrubbing: false,
        };
      }}
      onPointerMove={(event) => {
        const active = gesture.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const totalDeltaY = event.clientY - active.startY;
        if (!active.scrubbing && Math.abs(totalDeltaY) < 4) return;
        if (!active.scrubbing) {
          active.scrubbing = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        const deltaY = event.clientY - active.lastY;
        active.lastY = event.clientY;
        const nextValue = computeNumberScrubValue(
          active.lastValue,
          deltaY,
          step,
          coarseStep,
          event.shiftKey,
          event.ctrlKey || event.metaKey
        );
        active.lastValue = apply(nextValue) ?? active.lastValue;
        event.preventDefault();
      }}
      onPointerUp={(event) => {
        if (gesture.current?.pointerId !== event.pointerId) return;
        const wasScrubbing = gesture.current.scrubbing;
        gesture.current = null;
        if (wasScrubbing) {
          event.currentTarget.releasePointerCapture(event.pointerId);
          event.currentTarget.blur();
        } else {
          finish();
        }
      }}
      onPointerCancel={(event) => {
        if (gesture.current?.pointerId !== event.pointerId) return;
        gesture.current = null;
        actions.cancelSettingsEdit();
      }}
    />
  );
}

function SceneSettings({
  state,
  actions,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
}) {
  return (
    <details className="editor-panel" open>
      <summary id="scene-settings-title">Scene</summary>
      <div className="editor-panel__content">
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
        <NumberField
          actions={actions}
          label="Change field of view"
          value={state.settings.fov}
          minimum={10}
          maximum={120}
          step={1}
          coarseStep={5}
          integer
          setValue={(value) => actions.setFov(value)}
        />
      </label>
      <label className="editor-control">
        <span>Sky color</span>
        <input
          type="color"
          value={state.settings.backgroundColorTop}
          onFocus={() => actions.beginSettingsEdit("Change sky color")}
          onChange={(event) =>
            actions.setBackgroundColorTop(event.currentTarget.value)
          }
          onBlur={() => actions.commitSettingsEdit()}
        />
      </label>
      <label className="editor-control">
        <span>Horizon color</span>
        <input
          type="color"
          value={state.settings.backgroundColorBottom}
          onFocus={() => actions.beginSettingsEdit("Change horizon color")}
          onChange={(event) =>
            actions.setBackgroundColorBottom(event.currentTarget.value)
          }
          onBlur={() => actions.commitSettingsEdit()}
        />
      </label>
      </div>
    </details>
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
    <details className="editor-panel" open>
      <summary id="render-settings-title">Render</summary>
      <div className="editor-panel__content">
      <label className="editor-control editor-control--checkbox">
        <span>Path tracing</span>
        <input
          type="checkbox"
          checked={settings.pathtracingEnabled}
          onChange={(event) =>
            commitSetting(actions, "Toggle path tracing", () =>
              actions.setPathtracingEnabled(event.currentTarget.checked)
            )
          }
        />
      </label>
      <fieldset
        className="editor-controls-group"
        disabled={!settings.pathtracingEnabled}
      >
      <label className="editor-control">
        <span>Samples</span>
        <NumberField
          actions={actions}
          label="Change samples per frame"
          value={settings.numSamples}
          minimum={1}
          maximum={20}
          step={1}
          coarseStep={1}
          integer
          setValue={(value) => actions.setNumSamples(value)}
        />
      </label>
      <label className="editor-control">
        <span>Ray depth</span>
        <NumberField
          actions={actions}
          label="Change maximum ray depth"
          value={settings.maxRayDepth}
          minimum={1}
          maximum={20}
          step={1}
          coarseStep={1}
          integer
          setValue={(value) => actions.setMaxRayDepth(value)}
        />
      </label>
      <label className="editor-control">
        <span>Resolution</span>
        <select
          value={settings.resolutionScale}
          onChange={(event) =>
            commitSetting(actions, "Change resolution scale", () =>
              actions.setResolutionScale(Number(event.currentTarget.value))
            )
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
            commitSetting(actions, "Change accumulation format", () =>
              actions.setAccumulationFormat(
                event.currentTarget.value as typeof settings.accumulationFormat
              )
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
        <NumberField
          actions={actions}
          label="Change accumulation frame limit"
          value={settings.maxAccumulationFrames}
          minimum={0}
          maximum={100000}
          step={1}
          coarseStep={100}
          integer
          setValue={(value) => actions.setMaxAccumulationFrames(value)}
        />
      </label>
      </fieldset>
      </div>
    </details>
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
    <details className="editor-panel" open>
      <summary id="camera-settings-title">Camera</summary>
      <div className="editor-panel__content">
      <label className="editor-control editor-control--checkbox">
        <span>Depth of field</span>
        <input
          type="checkbox"
          checked={settings.enableDepthOfField}
          onChange={(event) =>
            commitSetting(actions, "Toggle depth of field", () =>
              actions.setDepthOfFieldEnabled(event.currentTarget.checked)
            )
          }
        />
      </label>
      <fieldset
        className="editor-controls-group"
        disabled={!settings.enableDepthOfField}
      >
      <label className="editor-control">
        <span>Aperture</span>
        <NumberField
          actions={actions}
          label="Change camera aperture"
          value={settings.aperture}
          minimum={0}
          maximum={0.1}
          step={0.001}
          coarseStep={0.01}
          setValue={(value) => actions.setAperture(value)}
        />
      </label>
      <label className="editor-control">
        <span>Focus distance</span>
        <NumberField
          actions={actions}
          label="Change camera focus distance"
          value={settings.focusDistance}
          minimum={0.1}
          maximum={20}
          step={0.1}
          coarseStep={1}
          setValue={(value) => actions.setFocusDistance(value)}
        />
      </label>
      </fieldset>
      </div>
    </details>
  );
}

type ResizeAxis = "width" | "height" | "both";

interface PanelSize {
  width: number;
  height: number;
}

function clampPanelSize(size: PanelSize): PanelSize {
  return {
    width: Math.min(Math.max(220, size.width), Math.max(220, window.innerWidth - 32)),
    height: Math.min(
      Math.max(220, size.height),
      Math.max(220, window.innerHeight - 32)
    ),
  };
}

function EditorShell({ actions }: { actions: PtActions }) {
  const state = useSyncExternalStore(
    (listener) => actions.subscribe(listener),
    () => actions.getState()
  );
  const [collapsed, setCollapsed] = useState(false);
  const [size, setSize] = useState<PanelSize>(() =>
    clampPanelSize({ width: 260, height: 620 })
  );
  const resizeGesture = useRef<{
    axis: ResizeAxis;
    pointerId: number;
    startX: number;
    startY: number;
    startSize: PanelSize;
  } | null>(null);

  useEffect(() => {
    const handleResize = () => setSize((current) => clampPanelSize(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const beginResize = (
    axis: ResizeAxis,
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (collapsed || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeGesture.current = {
      axis,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startSize: size,
    };
  };

  const continueResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = resizeGesture.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    setSize(
      clampPanelSize({
        width:
          gesture.axis === "width" || gesture.axis === "both"
            ? gesture.startSize.width + event.clientX - gesture.startX
            : gesture.startSize.width,
        height:
          gesture.axis === "height" || gesture.axis === "both"
            ? gesture.startSize.height + event.clientY - gesture.startY
            : gesture.startSize.height,
      })
    );
  };

  const finishResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizeGesture.current?.pointerId !== event.pointerId) return;
    resizeGesture.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <aside
      className="editor-shell"
      aria-label="Path tracer editor"
      data-collapsed={collapsed}
      style={collapsed ? undefined : size}
    >
      <div className="editor-shell__header">
        <button
          className="editor-shell__toggle"
          type="button"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((current) => !current)}
        >
          <span className="editor-shell__title">Path Tracer</span>
          <span className="editor-shell__scene">{state.sceneKey}</span>
          <span className="editor-shell__chevron" aria-hidden="true">⌃</span>
        </button>
      </div>
      <div className="editor-shell__body">
        <div className="editor-shell__status">
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
        <SceneSettings state={state} actions={actions} />
        <RenderSettings state={state} actions={actions} />
        <CameraSettings state={state} actions={actions} />
      </div>
      {(["width", "height", "both"] as const).map((axis) => (
        <div
          key={axis}
          className={`editor-shell__resize-handle editor-shell__resize-handle--${axis}`}
          aria-hidden="true"
          onPointerDown={(event) => beginResize(axis, event)}
          onPointerMove={continueResize}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
        />
      ))}
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
