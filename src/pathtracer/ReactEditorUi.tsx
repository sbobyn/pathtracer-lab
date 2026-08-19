import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import * as THREE from "three";
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
      <div className="render-panel__content">
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

function SceneHierarchy({
  state,
  actions,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
}) {
  return (
    <details className="editor-panel" open>
      <summary>Hierarchy</summary>
      <div className="editor-panel__content editor-hierarchy" role="tree">
        {state.sceneObjects.map((object) => (
          <button
            key={object.id}
            type="button"
            role="treeitem"
            aria-selected={state.selection.objectId === object.id}
            aria-disabled={!object.selectable}
            aria-level={object.depth + 1}
            disabled={!object.selectable}
            data-depth={object.depth}
            data-selected={state.selection.objectId === object.id}
            onClick={() => {
              if (object.sphereIndex !== null) {
                actions.selectSphere(object.sphereIndex);
              }
            }}
          >
            <span>{object.label}</span>
            <span className="editor-hierarchy__capability">
              {object.capability}
            </span>
          </button>
        ))}
      </div>
    </details>
  );
}

function ObjectNameField({
  objectId,
  name,
  actions,
}: {
  objectId: string;
  name: string;
  actions: PtActions;
}) {
  const [draft, setDraft] = useState(name);
  const cancel = useRef(false);
  useEffect(() => setDraft(name), [objectId, name]);
  return (
    <label className="editor-control">
      <span>Name</span>
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          if (cancel.current) {
            cancel.current = false;
            return;
          }
          if (!actions.renameSelectedObject(draft)) setDraft(name);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            cancel.current = true;
            setDraft(name);
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function ObjectInspectorContent({
  state,
  actions,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
}) {
  const selection = state.selection;
  const material = selection.material;
  if (selection.sphereIndex === null || selection.radius === null || !material) {
    return null;
  }

  const transformNumber = (
    label: string,
    value: number,
    setValue: (value: number) => void,
    minimum?: number
  ) => (
    <label className="editor-control">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={minimum}
        step={0.01}
        onFocus={() => actions.beginSelectedTransform()}
        onChange={(event) => {
          const nextValue = event.currentTarget.valueAsNumber;
          if (Number.isFinite(nextValue)) setValue(nextValue);
        }}
        onBlur={() => actions.commitSelectedTransform()}
      />
    </label>
  );

  return (
      <div className="object-inspector__content">
        <div className="editor-inspector__identity">
          <strong>{selection.name}</strong>
          <span>Sphere · Path traced</span>
        </div>
        <ObjectNameField
          objectId={selection.objectId!}
          name={selection.name!}
          actions={actions}
        />
        <details className="editor-subpanel" open>
          <summary>Transform</summary>
          {transformNumber("Position X", selection.position.x, (value) =>
            actions.setSelectedPosition("x", value)
          )}
          {transformNumber("Position Y", selection.position.y, (value) =>
            actions.setSelectedPosition("y", value)
          )}
          {transformNumber("Position Z", selection.position.z, (value) =>
            actions.setSelectedPosition("z", value)
          )}
          {transformNumber("Radius", selection.radius, (value) =>
            actions.setSelectedRadius(value), 0
          )}
        </details>
        <details className="editor-subpanel" open>
          <summary>Material · {material.kind}</summary>
          <label className="editor-control">
            <span>Color</span>
            <input
              type="color"
              value={material.color}
              onFocus={() => actions.beginMaterialEdit(material.id)}
              onChange={(event) =>
                actions.setMaterialColor(
                  material.id,
                  new THREE.Color(event.currentTarget.value)
                )
              }
              onBlur={() => actions.commitMaterialEdit()}
            />
          </label>
          {material.roughness !== null && (
            <label className="editor-control">
              <span>Roughness</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={material.roughness}
                onFocus={() => actions.beginMaterialEdit(material.id)}
                onChange={(event) => {
                  const nextValue = event.currentTarget.valueAsNumber;
                  if (Number.isFinite(nextValue)) {
                    actions.setMaterialFuzz(material.id, nextValue);
                  }
                }}
                onBlur={() => actions.commitMaterialEdit()}
              />
            </label>
          )}
          {material.ior !== null && (
            <label className="editor-control">
              <span>IOR</span>
              <input
                type="number"
                min={1}
                max={2.5}
                step={0.01}
                value={material.ior}
                onFocus={() => actions.beginMaterialEdit(material.id)}
                onChange={(event) => {
                  const nextValue = event.currentTarget.valueAsNumber;
                  if (Number.isFinite(nextValue)) {
                    actions.setMaterialIor(material.id, nextValue);
                  }
                }}
                onBlur={() => actions.commitMaterialEdit()}
              />
            </label>
          )}
        </details>
        <div className="editor-inspector__commands">
          <button type="button" onClick={() => actions.frameSelectedObject()}>
            Frame
          </button>
          <button type="button" onClick={() => actions.duplicateSelectedObject()}>
            Duplicate
          </button>
          <button type="button" onClick={() => actions.removeSelectedObject()}>
            Remove
          </button>
        </div>
      </div>
  );
}

function SelectedObjectInspector({
  state,
  actions,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
}) {
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

  if (state.selection.sphereIndex === null) return null;

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
            ? gesture.startSize.width - (event.clientX - gesture.startX)
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
      className="object-inspector"
      aria-label="Selected object inspector"
      data-collapsed={collapsed}
      style={
        collapsed
          ? undefined
          : { width: size.width, maxHeight: size.height }
      }
    >
      <button
        className="object-inspector__toggle"
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
      >
        <span>{state.selection.name}</span>
        <span className="object-inspector__meta">
          {state.selection.material?.kind ?? "Object"}
        </span>
        <span className="object-inspector__chevron" aria-hidden="true">⌃</span>
      </button>
      {!collapsed && <ObjectInspectorContent state={state} actions={actions} />}
      {(["width", "height", "both"] as const).map((axis) => (
        <div
          key={axis}
          className={`object-inspector__resize-handle object-inspector__resize-handle--${axis}`}
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

function HistoryPanel({
  state,
  actions,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
}) {
  return (
    <aside className="history-panel" aria-label="History controls">
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
    </aside>
  );
}

function useFrameRate() {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let frameRequest = 0;
    let frameCount = 0;
    let intervalStart = performance.now();
    const measure = (now: number) => {
      frameCount += 1;
      const elapsed = now - intervalStart;
      if (elapsed >= 500) {
        setFps(Math.round((frameCount * 1000) / elapsed));
        frameCount = 0;
        intervalStart = now;
      }
      frameRequest = requestAnimationFrame(measure);
    };
    frameRequest = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frameRequest);
  }, []);

  return fps;
}

function RenderPanel({
  state,
  actions,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const fps = useFrameRate();
  return (
    <aside
      className="render-panel"
      aria-label="Render settings"
      data-collapsed={collapsed}
    >
      <button
        className="render-panel__toggle"
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
      >
        <span>Render</span>
        <span className="render-panel__meta">
          {fps === null ? "—" : fps} FPS · {state.settings.pathtracingEnabled ? "Path tracing" : "Preview"}
        </span>
        <span className="render-panel__chevron" aria-hidden="true">⌃</span>
      </button>
      {!collapsed && <RenderSettings state={state} actions={actions} />}
    </aside>
  );
}

function CreationMenu({
  actions,
  selectionActive,
  onClose,
  style,
}: {
  actions: PtActions;
  selectionActive: boolean;
  onClose: () => void;
  style?: CSSProperties;
}) {
  const run = (action: () => unknown) => {
    action();
    onClose();
  };
  return (
    <div className="creation-menu" role="menu" style={style}>
      <button type="button" role="menuitem" onClick={() => run(() => actions.addSphere())}>
        <span>Add sphere</span><kbd>⇧A</kbd>
      </button>
      <button type="button" role="menuitem" disabled title="Available after quad support">
        <span>Add quad</span><small>Not traceable yet</small>
      </button>
      <button type="button" role="menuitem" disabled title="Available after triangle support">
        <span>Import mesh</span><small>Not traceable yet</small>
      </button>
      {selectionActive && <div className="creation-menu__separator" />}
      {selectionActive && (
        <button type="button" role="menuitem" onClick={() => run(() => actions.frameSelectedObject())}>
          <span>Frame selection</span><kbd>F</kbd>
        </button>
      )}
      {selectionActive && (
        <button type="button" role="menuitem" onClick={() => run(() => actions.duplicateSelectedObject())}>
          <span>Duplicate</span><kbd>⇧D</kbd>
        </button>
      )}
      {selectionActive && (
        <button className="creation-menu__danger" type="button" role="menuitem" onClick={() => run(() => actions.removeSelectedObject())}>
          <span>Delete</span>
        </button>
      )}
    </div>
  );
}

function EditorShell({ actions }: { actions: PtActions }) {
  const state = useSyncExternalStore(
    (listener) => actions.subscribe(listener),
    () => actions.getState()
  );
  const [collapsed, setCollapsed] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
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

  useEffect(() => {
    let contextGesture: { x: number; y: number; moved: boolean } | null = null;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        !target.closest(".creation-menu, .scene-toolbar__add")
      ) {
        setAddMenuOpen(false);
        setContextMenu(null);
      }
      if (event.button === 2) {
        contextGesture = { x: event.clientX, y: event.clientY, moved: false };
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!contextGesture) return;
      if (
        Math.hypot(
          event.clientX - contextGesture.x,
          event.clientY - contextGesture.y
        ) > 5
      ) {
        contextGesture.moved = true;
      }
    };
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("#editor-root aside")) return;
      event.preventDefault();
      if (contextGesture?.moved) {
        contextGesture = null;
        return;
      }
      setAddMenuOpen(false);
      setContextMenu({
        x: Math.min(event.clientX, window.innerWidth - 190),
        y: Math.min(event.clientY, window.innerHeight - 220),
      });
      contextGesture = null;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddMenuOpen(false);
        setContextMenu(null);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
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
    <>
    <div className="editor-left-stack">
    <HistoryPanel state={state} actions={actions} />
    <aside
      className="editor-shell"
      aria-label="Path tracer editor"
      data-collapsed={collapsed}
      style={
        collapsed
          ? undefined
          : { width: size.width, maxHeight: size.height }
      }
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
        <div className="scene-toolbar">
          <button
            className="scene-toolbar__add"
            type="button"
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
            onClick={() => {
              setContextMenu(null);
              setAddMenuOpen((open) => !open);
            }}
          >
            Add <span aria-hidden="true">⌄</span>
          </button>
          {addMenuOpen && (
            <CreationMenu
              actions={actions}
              selectionActive={state.selection.objectId !== null}
              onClose={() => setAddMenuOpen(false)}
            />
          )}
        </div>
        <SceneSettings state={state} actions={actions} />
        <SceneHierarchy state={state} actions={actions} />
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
    </div>
    <div className="editor-right-stack">
    <RenderPanel state={state} actions={actions} />
    <SelectedObjectInspector state={state} actions={actions} />
    </div>
    {contextMenu && (
      <CreationMenu
        actions={actions}
        selectionActive={state.selection.objectId !== null}
        onClose={() => setContextMenu(null)}
        style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y }}
      />
    )}
    </>
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

  public dispose() {
    this.root.unmount();
    this.element.remove();
  }
}
