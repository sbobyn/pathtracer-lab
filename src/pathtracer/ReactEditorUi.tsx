import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import {
  CheckboxField,
  NumberField as EditorNumberField,
  SelectField,
  VectorField,
} from "@nybobs/editor-ui";
import * as THREE from "three";
import type PtActions from "./PtActions";
import type { PtUiAdapter } from "./PtUiAdapter";
import type { PtState, PtTextureState } from "./PtState";
import {
  presetPtSceneLabel,
  presetPtSceneOrder,
} from "./PresetPtScenes";
import { presetPtSceneInfo } from "./PresetPtSceneInfo";
import { builtinTextures } from "./BuiltinTextures";
import { builtinEnvironments, findBuiltinEnvironment } from "./BuiltinEnvironments";

const editorUiStoragePrefix = "three-pathtracer:editor-ui:v1:";
const pathTracerScrubSpeed = 0.25;
const contextualHelpOpenEvent = "three-pathtracer:contextual-help-open";

type ContextualHelpContent = {
  meaning: ReactNode;
  math?: ReactNode;
  lookFor?: ReactNode;
  performance?: ReactNode;
};

function ContextualHelp({ label, content, triggerLeft }: {
  label: string;
  content: ContextualHelpContent;
  triggerLeft: number | null;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const bounds = button.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(320, window.innerWidth - 24);
      const left = Math.min(Math.max(12, bounds.left), Math.max(12, window.innerWidth - width - 12));
      const estimatedHeight = 260;
      const below = bounds.bottom + 8;
      const top = below + estimatedHeight <= window.innerHeight - 12
        ? below
        : Math.max(12, bounds.top - estimatedHeight - 8);
      setPosition({ left, top });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    const closeOtherHelp = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) {
        setOpen(false);
        setPinned(false);
      }
    };
    const dismiss = (event: PointerEvent) => {
      if (open && !button.current?.contains(event.target as Node)) {
        setOpen(false);
        setPinned(false);
      }
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setPinned(false);
        button.current?.focus();
      }
    };
    window.addEventListener(contextualHelpOpenEvent, closeOtherHelp);
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", dismissWithEscape);
    return () => {
      window.removeEventListener(contextualHelpOpenEvent, closeOtherHelp);
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", dismissWithEscape);
    };
  }, [id, open]);

  const show = () => {
    window.dispatchEvent(new CustomEvent(contextualHelpOpenEvent, { detail: id }));
    setOpen(true);
  };

  return <>
    <button
      ref={button}
      type="button"
      className="editor-contextual-help__trigger"
      aria-label={`Explain ${label}`}
      aria-describedby={open ? id : undefined}
      aria-expanded={open}
      style={{ left: triggerLeft ?? 0, visibility: triggerLeft === null ? "hidden" : "visible" }}
      onPointerEnter={show}
      onPointerLeave={() => { if (!pinned) setOpen(false); }}
      onFocus={show}
      onBlur={() => { if (!pinned) setOpen(false); }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (open && pinned) {
          setOpen(false);
          setPinned(false);
        } else {
          show();
          setPinned(true);
        }
      }}
    >?</button>
    {open && createPortal(
      <aside id={id} className="editor-contextual-help__surface" role="tooltip" style={{ left: position.left, top: position.top }}>
        <strong>{label}</strong>
        <dl>
          <div><dt>Meaning</dt><dd>{content.meaning}</dd></div>
          {content.math && <div><dt>Math</dt><dd>{content.math}</dd></div>}
          {content.lookFor && <div><dt>Look for</dt><dd>{content.lookFor}</dd></div>}
          {content.performance && <div><dt>Performance</dt><dd>{content.performance}</dd></div>}
        </dl>
      </aside>,
      document.body
    )}
  </>;
}

function HelpedControl({ label, content, children }: { label: string; content: ContextualHelpContent; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const [triggerLeft, setTriggerLeft] = useState<number | null>(null);

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const update = () => {
      const control = root.querySelector<HTMLElement>(".eui-field-row__body");
      if (!control) return;
      const rootBounds = root.getBoundingClientRect();
      const controlBounds = control.getBoundingClientRect();
      setTriggerLeft(Math.max(0, controlBounds.left - rootBounds.left - 22));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return <div ref={container} className="editor-contextual-help">
    {children}
    <ContextualHelp label={label} content={content} triggerLeft={triggerLeft} />
  </div>;
}

function readPersistedBoolean(key: string, fallback: boolean) {
  try {
    const stored = localStorage.getItem(editorUiStoragePrefix + key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

function usePersistentBoolean(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => readPersistedBoolean(key, fallback));
  const update = (next: boolean | ((current: boolean) => boolean)) => {
    setValue((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      try {
        localStorage.setItem(editorUiStoragePrefix + key, String(resolved));
      } catch {
        // Persistence is a convenience; the editor remains usable if storage is unavailable.
      }
      return resolved;
    });
  };
  return [value, update] as const;
}

function PersistentDetails({
  storageKey,
  className,
  defaultOpen = true,
  children,
}: {
  storageKey: string;
  className: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = usePersistentBoolean(`folder:${storageKey}`, defaultOpen);
  return (
    <details className={className} open={open} onToggle={(event) => {
      const next = event.currentTarget.open;
      if (next !== open) setOpen(next);
    }}>
      {children}
    </details>
  );
}

function commitSetting(actions: PtActions, label: string, update: () => void) {
  actions.beginSettingsEdit(label);
  update();
  actions.commitSettingsEdit();
}

function ColorField({
  label,
  value,
  onBegin,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onBegin: () => void;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const openRef = useRef(false);
  const suppressClick = useRef(false);
  const [open, setOpen] = useState(false);

  const close = () => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    input.current?.blur();
    onCommit();
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!openRef.current || button.current?.contains(event.target as Node)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const nativeInput = input.current;
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    nativeInput?.addEventListener("change", close);
    nativeInput?.addEventListener("cancel", close);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      nativeInput?.removeEventListener("change", close);
      nativeInput?.removeEventListener("cancel", close);
    };
  });

  return (
    <div className="editor-control">
      <span>{label}</span>
      <button
        ref={button}
        type="button"
        className="editor-color-picker"
        aria-label={label}
        aria-expanded={open}
        onPointerDown={(event) => {
          if (!openRef.current) return;
          event.preventDefault();
          suppressClick.current = true;
          close();
        }}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (openRef.current) {
            close();
            return;
          }
          onBegin();
          openRef.current = true;
          setOpen(true);
          try {
            input.current?.showPicker();
          } catch {
            openRef.current = false;
            setOpen(false);
            onCommit();
          }
        }}
      >
        <span style={{ backgroundColor: value }} />
      </button>
      <input
        ref={input}
        className="editor-color-picker__native"
        type="color"
        tabIndex={-1}
        value={value}
        onInput={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}

function MaterialMapSlot({
  label,
  texture,
  onReplace,
  onRemove,
  onEnabledChange,
}: {
  label: string;
  texture: PtTextureState;
  onReplace: (source: string) => void;
  onRemove: () => void;
  onEnabledChange: (enabled: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="texture-slot">
      <button
        type="button"
        className={`texture-slot__preview texture-slot__preview--${texture.type}`}
        data-empty={!texture.source}
        title={`${label} texture`}
        onClick={() => input.current?.click()}
      >
        {texture.source ? <img src={texture.source} alt={`${label} texture`} /> : <span>None</span>}
      </button>
      <div className="texture-slot__details">
        <strong>{label}</strong>
        <span>{texture.source ? texture.label : "No image"}</span>
        <CheckboxField
          label="Enabled"
          checked={texture.enabled}
          density="compact"
          layout="horizontal"
          onChange={onEnabledChange}
        />
        <div className="texture-slot__actions">
          <button type="button" onClick={() => input.current?.click()}>
            {texture.source ? "Replace" : "Choose"}
          </button>
          {texture.source && <button type="button" onClick={onRemove}>Remove</button>}
        </div>
      </div>
      <input
        ref={input}
        className="texture-slot__file"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;
          onReplace(URL.createObjectURL(file));
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function SettingsNumberField({
  actions,
  label,
  historyLabel,
  value,
  min,
  max,
  step,
  precisionStep,
  snapInterval,
  sensitivity,
  integer = false,
  disabled = false,
  help,
  setValue,
}: {
  actions: PtActions;
  label: string;
  historyLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precisionStep: number;
  snapInterval: number;
  sensitivity: number;
  integer?: boolean;
  disabled?: boolean;
  help?: ContextualHelpContent;
  setValue: (value: number) => void;
}) {
  const field = (
    <EditorNumberField
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      precisionStep={precisionStep}
      snapInterval={snapInterval}
      sensitivity={sensitivity * pathTracerScrubSpeed}
      integer={integer}
      disabled={disabled}
      density="compact"
      layout="horizontal"
      onChange={(nextValue) => {
        actions.beginSettingsEdit(historyLabel);
        setValue(nextValue);
      }}
      onCommit={() => actions.commitSettingsEdit()}
      onCancel={() => actions.cancelSettingsEdit()}
    />
  );
  return help ? <HelpedControl label={label} content={help}>{field}</HelpedControl> : field;
}

function SceneSettings({
  state,
  actions,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
}) {
  return (
    <PersistentDetails className="editor-panel" storageKey="scene">
      <summary id="scene-settings-title">Scene</summary>
      <div className="editor-panel__content">
      <SelectField
        label="Preset"
        value={state.sceneKey}
        options={presetPtSceneOrder.map((sceneKey) => ({
          value: sceneKey,
          label: presetPtSceneLabel(sceneKey),
        }))}
        density="compact"
        layout="horizontal"
        onChange={(value) => actions.setScene(value)}
      />
      {presetPtSceneInfo[state.sceneKey] && (
        <PersistentDetails
          className="editor-subpanel scene-about"
          storageKey={`scene-about:${state.sceneKey}`}
          defaultOpen={false}
        >
          <summary>About this scene</summary>
          <dl className="scene-about__content">
            <div>
              <dt>Purpose</dt>
              <dd>{presetPtSceneInfo[state.sceneKey].purpose}</dd>
            </div>
            <div>
              <dt>Implementation</dt>
              <dd>{presetPtSceneInfo[state.sceneKey].implementation}</dd>
            </div>
            <div>
              <dt>Concepts &amp; math</dt>
              <dd>{presetPtSceneInfo[state.sceneKey].concepts}</dd>
            </div>
          </dl>
        </PersistentDetails>
      )}
      {state.importWarnings.length > 0 && (
        <div className="import-warning" role="status">
          <strong>glTF fallback</strong>
          {state.importWarnings.map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      )}
      <SelectField
        label="Environment"
        value={state.settings.environmentMode === "gradient" ? "gradient" : state.settings.environmentSource}
        options={[
          { value: "gradient", label: "Sky gradient" },
          ...builtinEnvironments.map((environment) => ({ value: environment.source, label: environment.label })),
          ...(state.settings.environmentMode === "map" && !findBuiltinEnvironment(state.settings.environmentSource)
            ? [{ value: state.settings.environmentSource, label: state.settings.environmentLabel }]
            : []),
        ]}
        density="compact"
        layout="horizontal"
        onChange={(value) => {
          actions.beginSettingsEdit("Change environment");
          if (value === "gradient") actions.setEnvironmentGradient();
          else {
            const environment = findBuiltinEnvironment(value);
            if (environment) actions.setEnvironmentMap(environment.source, environment.label);
          }
          actions.commitSettingsEdit();
        }}
      />
      <label className="editor-action-button">
        Upload HDR
        <input
          type="file"
          accept=".hdr,image/vnd.radiance"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            actions.beginSettingsEdit("Upload environment");
            actions.setEnvironmentMap(URL.createObjectURL(file), file.name);
            actions.commitSettingsEdit();
            event.currentTarget.value = "";
          }}
        />
      </label>
      {state.settings.environmentMode === "gradient" ? (
        <>
          <ColorField
            label="Sky color"
            value={state.settings.backgroundColorTop}
            onBegin={() => actions.beginSettingsEdit("Change sky color")}
            onChange={(value) => actions.setBackgroundColorTop(value)}
            onCommit={() => actions.commitSettingsEdit()}
          />
          <ColorField
            label="Horizon color"
            value={state.settings.backgroundColorBottom}
            onBegin={() => actions.beginSettingsEdit("Change horizon color")}
            onChange={(value) => actions.setBackgroundColorBottom(value)}
            onCommit={() => actions.commitSettingsEdit()}
          />
        </>
      ) : (
        <>
          <EditorNumberField
            label="Rotation"
            value={state.settings.environmentRotation}
            min={-180}
            max={180}
            step={1}
            precisionStep={0.1}
            snapInterval={15}
            sensitivity={1 * pathTracerScrubSpeed}
            density="compact"
            layout="horizontal"
            onChange={(value) => {
              actions.beginSettingsEdit("Rotate environment");
              actions.setEnvironmentRotation(value);
            }}
            onCommit={() => actions.commitSettingsEdit()}
            onCancel={() => actions.cancelSettingsEdit()}
          />
          <HelpedControl label="Background intensity" content={{
            meaning: "Scales only the environment image seen directly by the camera.",
            math: <>Displayed background radiance is multiplied by this factor.</>,
            lookFor: "The visible HDR changes brightness without changing how strongly it illuminates objects.",
            performance: "No meaningful render-cost change; this changes radiance, not sample count.",
          }}><EditorNumberField
            label="Background intensity"
            value={state.settings.environmentIntensity}
            min={0}
            max={20}
            step={0.1}
            precisionStep={0.01}
            snapInterval={1}
            sensitivity={1 * pathTracerScrubSpeed}
            density="compact"
            layout="horizontal"
            onChange={(value) => {
              actions.beginSettingsEdit("Change environment background intensity");
              actions.setEnvironmentIntensity(value);
            }}
            onCommit={() => actions.commitSettingsEdit()}
            onCancel={() => actions.cancelSettingsEdit()}
          /></HelpedControl>
          <HelpedControl label="Lighting intensity" content={{
            meaning: "Scales the HDR environment radiance used to light the scene.",
            math: <>Environment-light samples use <code>L = texture × intensity</code>.</>,
            lookFor: "Surfaces and reflections change brightness while the visible background remains unchanged.",
            performance: "No meaningful per-sample cost change, though brighter lighting can make variance easier to see.",
          }}><EditorNumberField
            label="Lighting intensity"
            value={state.settings.environmentLightingIntensity}
            min={0}
            max={20}
            step={0.1}
            precisionStep={0.01}
            snapInterval={1}
            sensitivity={1 * pathTracerScrubSpeed}
            density="compact"
            layout="horizontal"
            onChange={(value) => {
              actions.beginSettingsEdit("Change environment lighting intensity");
              actions.setEnvironmentLightingIntensity(value);
            }}
            onCommit={() => actions.commitSettingsEdit()}
            onCancel={() => actions.cancelSettingsEdit()}
          /></HelpedControl>
          <CheckboxField
            label="Visible background"
            checked={state.settings.environmentBackgroundVisible}
            density="compact"
            layout="horizontal"
            onChange={(value) => {
              actions.beginSettingsEdit("Toggle environment background");
              actions.setEnvironmentBackgroundVisible(value);
              actions.commitSettingsEdit();
            }}
          />
          <CheckboxField
            label="Light scene"
            checked={state.settings.environmentLightingEnabled}
            density="compact"
            layout="horizontal"
            onChange={(value) => {
              actions.beginSettingsEdit("Toggle environment lighting");
              actions.setEnvironmentLightingEnabled(value);
              actions.commitSettingsEdit();
            }}
          />
        </>
      )}
      <button
        type="button"
        className="editor-action-button"
        onClick={() => actions.resetPreferences()}
      >
        Reset preferences
      </button>
      </div>
    </PersistentDetails>
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
  const bvhStats = actions.getTriangleBvhStats();
  const sphereBvhStats = actions.getSphereBvhStats();
  const bvhProbeStats = actions.getTriangleBvhProbeStats();
  const [showBvhVisualizationHelp, setShowBvhVisualizationHelp] = useState(false);
  const [bvhTraversalPlaying, setBvhTraversalPlaying] = useState(false);
  const [bvhTraversalSpeed, setBvhTraversalSpeed] = useState(450);
  const traversal = state.bvhTraversal;
  const traversalEvent = traversal.events[traversal.step] ?? null;
  const visibleTraversalEvents = traversal.events.slice(0, Math.max(0, traversal.step + 1));
  const visibleNodeTests = visibleTraversalEvents.filter((event) => event.kind === "node").length;
  const visiblePrimitiveTests = visibleTraversalEvents.filter((event) => event.kind === "triangle" || event.kind === "sphere").length;
  useEffect(() => {
    if (!bvhTraversalPlaying) return;
    if (traversal.step >= traversal.events.length - 1) {
      setBvhTraversalPlaying(false);
      return;
    }
    const timer = window.setInterval(
      () => actions.setBvhTraversalStep(traversal.step + 1),
      bvhTraversalSpeed
    );
    return () => window.clearInterval(timer);
  }, [actions, bvhTraversalPlaying, bvhTraversalSpeed, traversal.events.length, traversal.step]);
  return (
      <div className="render-panel__content">
      <SelectField
          label="Render mode"
          value={settings.renderMode}
          options={[
            { value: "raster", label: "Raster" },
            { value: "pathtraced", label: "Path traced" },
            { value: "comparison", label: "Comparison" },
            { value: "region", label: "Region" },
          ]}
          density="compact"
          layout="horizontal"
          onChange={(value) =>
            commitSetting(actions, "Change render mode", () =>
              actions.setRenderMode(value as typeof settings.renderMode)
            )
          }
      />
      {settings.renderMode === "region" && (
        <SelectField
          label="ROI tracing"
          value={settings.regionTracingMode}
          options={[
            { value: "roiOnly", label: "ROI only · faster" },
            { value: "fullFrame", label: "Full frame · preserve" },
          ]}
          density="compact"
          layout="horizontal"
          onChange={(value) =>
            commitSetting(actions, "Change ROI tracing strategy", () =>
              actions.setRegionTracingMode(value as typeof settings.regionTracingMode)
            )
          }
        />
      )}
      {settings.renderMode === "comparison" && (
        <SelectField
          label="Comparison tracing"
          value={settings.comparisonTracingMode}
          options={[
            { value: "pathtracedSide", label: "Visible side · faster" },
            { value: "fullFrame", label: "Full frame · preserve" },
          ]}
          density="compact"
          layout="horizontal"
          onChange={(value) =>
            commitSetting(actions, "Change comparison tracing strategy", () =>
              actions.setComparisonTracingMode(value as typeof settings.comparisonTracingMode)
            )
          }
        />
      )}
      <fieldset
        className="editor-controls-group"
        disabled={settings.renderMode === "raster"}
      >
        <SettingsNumberField
          actions={actions}
          label="Samples"
          historyLabel="Change samples per frame"
          value={settings.numSamples}
          min={1}
          max={20}
          step={1}
          precisionStep={0.1}
          snapInterval={1}
          sensitivity={0.5}
          integer
          help={{
            meaning: "Independent camera rays traced per pixel during each rendered frame.",
            math: <>The frame estimate is the average <code>(1/N) Σ Lᵢ</code> of N samples.</>,
            lookFor: "More samples reduce fresh-frame noise and make the image settle faster.",
            performance: "Cost is approximately linear: doubling samples roughly doubles path-tracing work per frame.",
          }}
          setValue={(value) => actions.setNumSamples(value)}
        />
        <SettingsNumberField
          actions={actions}
          label="Ray depth"
          historyLabel="Change maximum ray depth"
          value={settings.maxRayDepth}
          min={1}
          max={20}
          step={1}
          precisionStep={0.1}
          snapInterval={1}
          sensitivity={0.5}
          integer
          help={{
            meaning: "Maximum number of surface interactions allowed along one camera path.",
            math: "Tracing stops after this many bounces even if the path has not escaped or reached a light.",
            lookFor: "Higher depths recover multi-bounce light, especially inside glass, reflections, and enclosed scenes.",
            performance: "Raises worst-case work per sample; actual cost depends on how long paths survive.",
          }}
          setValue={(value) => actions.setMaxRayDepth(value)}
        />
      <HelpedControl label="Integrator" content={{
        meaning: "Chooses how the renderer samples indirect scattering and explicit light sources.",
        math: "BSDF samples scattering only; Direct samples lights explicitly; MIS combines both estimators with balance weights.",
        lookFor: "With small or delta lights, Direct and MIS should converge much faster than BSDF only.",
        performance: "Direct and MIS add shadow-ray work, but usually need fewer samples for a clean result.",
      }}><SelectField
          label="Integrator"
          value={settings.integratorMode}
          options={[
            { value: "bsdf", label: "BSDF only" },
            { value: "direct", label: "Direct light" },
            { value: "mis", label: "MIS" },
          ]}
          density="compact"
          layout="horizontal"
          onChange={(value) =>
            commitSetting(actions, "Change integrator", () =>
              actions.setIntegratorMode(value as typeof settings.integratorMode)
            )
          }
      /></HelpedControl>
      {bvhStats.triangleCount > 0 && (
        <SelectField
          label="Wireframe"
          value={settings.triangleOverlayMode}
          options={[
            { value: "off", label: "Off" },
            { value: "selected", label: "Selected" },
            { value: "all", label: "All meshes" },
          ]}
          density="compact"
          layout="horizontal"
          onChange={(value) =>
            commitSetting(actions, "Change triangle wireframe overlay", () =>
              actions.setTriangleOverlayMode(value as typeof settings.triangleOverlayMode)
            )
          }
        />
      )}
      <HelpedControl label="Resolution" content={{
        meaning: "Scales the width and height of the internal path-tracing render target.",
        math: <>Pixel work scales with area: <code>cost ∝ scale²</code>.</>,
        lookFor: "Lower values look softer or more pixelated but remain compositionally identical.",
        performance: "A 0.5× scale traces about one quarter as many pixels as 1×; 2× traces about four times as many.",
      }}><SelectField
          label="Resolution"
          value={String(settings.resolutionScale)}
          options={[2, 1, 0.5, 0.25, 0.125, 0.0625].map((scale) => ({
            value: String(scale),
            label: `${scale}×`,
          }))}
          density="compact"
          layout="horizontal"
          onChange={(value) =>
            commitSetting(actions, "Change resolution scale", () =>
              actions.setResolutionScale(Number(value))
            )
          }
      /></HelpedControl>
      <HelpedControl label="Accumulation" content={{
        meaning: "Selects the numeric precision used to store the progressively averaged image.",
        math: "More bits preserve smaller updates as the running sample count grows.",
        lookFor: "Low precision can eventually band, stall, darken, or discolor after long accumulation.",
        performance: "Higher precision consumes more GPU memory and bandwidth; support and speed vary by device.",
      }}><SelectField
          label="Accumulation"
          value={settings.accumulationFormat}
          options={[
            { value: "rgba32f", label: "32-bit" },
            { value: "rgba16f", label: "16-bit" },
            { value: "rgba8", label: "8-bit" },
          ]}
          density="compact"
          layout="horizontal"
          onChange={(value) =>
            commitSetting(actions, "Change accumulation format", () =>
              actions.setAccumulationFormat(
                value as typeof settings.accumulationFormat
              )
            )
          }
      /></HelpedControl>
        <SettingsNumberField
          actions={actions}
          label="Frame limit"
          historyLabel="Change accumulation frame limit"
          value={settings.maxAccumulationFrames}
          min={0}
          max={100000}
          step={1}
          precisionStep={0.1}
          snapInterval={100}
          sensitivity={10}
          integer
          help={{
            meaning: "Stops progressive accumulation after this many frames; zero means no limit.",
            math: "The final sample budget is approximately frames × samples per frame.",
            lookFor: "The image stops changing at the limit and resumes after a scene invalidation.",
            performance: "Caps total idle rendering and prevents very long accumulation from wasting GPU time.",
          }}
          setValue={(value) => actions.setMaxAccumulationFrames(value)}
        />
      {(bvhStats.triangleCount > 0 || sphereBvhStats.sphereCount > 0) && (
        <HelpedControl label="Acceleration" content={{
          meaning: "Chooses how rays search packed spheres and triangles for the closest intersection.",
          math: "Brute force tests every primitive; the BVH rejects spatial groups using bounding-box tests before exact intersections.",
          lookFor: "Both modes should produce the same image. Differences indicate an intersection or BVH correctness bug.",
          performance: "BVH traversal scales far better for large meshes; brute force is retained as a correctness baseline.",
        }}><SelectField
          label="Acceleration"
          value={settings.triangleTraversalMode}
          options={[
            { value: "bvh", label: "BVH" },
            { value: "bruteForce", label: "Brute force" },
          ]}
          density="compact"
          layout="horizontal"
          onChange={(value) =>
            commitSetting(actions, "Change acceleration traversal", () =>
              actions.setTriangleTraversalMode(value as typeof settings.triangleTraversalMode)
            )
          }
        /></HelpedControl>
      )}
      {(bvhStats.nodeCount > 0 || sphereBvhStats.nodeCount > 0) && (
        <PersistentDetails
          className="editor-subpanel render-panel__bvh-visualization"
          storageKey="bvh-visualization"
        >
          <summary>BVH visualization</summary>
          <div className="render-panel__bvh-help-row">
            <span>About this overlay</span>
            <button
              type="button"
              className="editor-help-button"
              aria-label="Explain BVH visualization"
              aria-expanded={showBvhVisualizationHelp}
              title="Explain BVH visualization"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowBvhVisualizationHelp((visible) => !visible);
              }}
            >
              ?
            </button>
          </div>
          {showBvhVisualizationHelp && (
            <p className="render-panel__bvh-help">
              Shows the bounding boxes used to organize accelerated primitives.
              Triangle nodes are blue/green; sphere nodes are purple/gold. Depth
              0 is the root; higher values reveal progressively smaller child
              boxes. These controls affect only the debug overlay—not the BVH
              build, ray traversal, or accumulated image.
            </p>
          )}
          <CheckboxField
            label="Show bounds"
            checked={settings.bvhOverlayEnabled}
            density="compact"
            layout="horizontal"
            onChange={(checked) =>
              commitSetting(actions, "Toggle BVH bounds", () =>
                actions.setBvhOverlayEnabled(checked)
              )
            }
          />
          <SettingsNumberField
            actions={actions}
            label="Visible depth"
            historyLabel="Change visible BVH depth"
            value={Math.min(settings.bvhOverlayDepth, Math.max(bvhStats.maxDepth, sphereBvhStats.maxDepth))}
            min={0}
            max={Math.max(bvhStats.maxDepth, sphereBvhStats.maxDepth)}
            step={1}
            precisionStep={1}
            snapInterval={1}
            sensitivity={0.5}
            integer
            disabled={!settings.bvhOverlayEnabled}
            setValue={(value) => actions.setBvhOverlayDepth(value)}
          />
          <div className="render-panel__traversal">
            <div className="render-panel__traversal-heading">
              <strong>Selected-ray traversal</strong>
              <span>CPU diagnostic</span>
            </div>
            <p>
              Records one camera ray through the production flattened BVH. It
              mirrors the reference algorithm; it is not a readback of a live GPU pixel.
            </p>
            <div className="render-panel__traversal-actions">
              <button
                type="button"
                data-active={traversal.armed}
                onClick={() => traversal.armed
                  ? actions.cancelBvhTraversalInspection()
                  : actions.armBvhTraversalInspection()}
              >
                {traversal.armed ? "Click viewport…" : "Pick ray"}
              </button>
              {traversal.events.length > 0 && (
                <button type="button" onClick={() => {
                  setBvhTraversalPlaying(false);
                  actions.cancelBvhTraversalInspection();
                }}>Clear</button>
              )}
            </div>
            {traversal.events.length > 0 && (
              <>
                <div className="render-panel__traversal-actions">
                  <button type="button" disabled={traversal.step <= 0} onClick={() => actions.setBvhTraversalStep(traversal.step - 1)}>←</button>
                  <button type="button" onClick={() => setBvhTraversalPlaying((playing) => !playing)}>
                    {bvhTraversalPlaying ? "Pause" : "Play"}
                  </button>
                  <button type="button" disabled={traversal.step >= traversal.events.length - 1} onClick={() => actions.setBvhTraversalStep(traversal.step + 1)}>→</button>
                  <select
                    className="render-panel__traversal-speed"
                    aria-label="Traversal playback speed"
                    value={bvhTraversalSpeed}
                    onChange={(event) => setBvhTraversalSpeed(Number(event.currentTarget.value))}
                  >
                    <option value={900}>Slow</option>
                    <option value={450}>Normal</option>
                    <option value={180}>Fast</option>
                  </select>
                </div>
                <input
                  className="render-panel__traversal-range"
                  type="range"
                  aria-label="BVH traversal step"
                  min={0}
                  max={Math.max(0, traversal.events.length - 1)}
                  value={Math.max(0, traversal.step)}
                  onChange={(event) => {
                    setBvhTraversalPlaying(false);
                    actions.setBvhTraversalStep(Number(event.currentTarget.value));
                  }}
                />
                <dl className="render-panel__traversal-stats">
                  <div><dt>Step</dt><dd>{traversal.step + 1} / {traversal.events.length}</dd></div>
                  <div><dt>Node / primitive tests</dt><dd>{visibleNodeTests} / {visiblePrimitiveTests}</dd></div>
                  <div><dt>Current</dt><dd>{traversalEvent?.kind === "node"
                    ? `${traversalEvent.geometryKind === "sphere" ? "Sphere" : "Triangle"} node ${traversalEvent.nodeIndex}: ${traversalEvent.hit ? (traversalEvent.leaf ? "leaf" : "entered") : "rejected"}`
                    : traversalEvent?.kind === "triangle"
                      ? `Triangle ${traversalEvent.triangleIndex}: ${traversalEvent.closest ? "new closest" : "miss"}`
                      : traversalEvent?.kind === "sphere"
                        ? `Sphere ${traversalEvent.sphereIndex}: ${traversalEvent.closest ? "new closest" : "miss"}`
                        : "—"}</dd></div>
                  <div><dt>Final hit</dt><dd>{!traversal.result || traversal.result.primitiveIndex === -1
                    ? "Miss"
                    : `${traversal.result.geometryKind === "sphere" ? "Sphere" : "Triangle"} ${traversal.result.primitiveIndex}`}</dd></div>
                  <div><dt>Brute-force check</dt><dd>{traversal.result?.agreesWithBruteForce ? "Agrees" : "Mismatch"}</dd></div>
                </dl>
              </>
            )}
          </div>
        </PersistentDetails>
      )}
      </fieldset>
      {bvhStats.triangleCount > 0 && (
        <dl className="render-panel__bvh-stats" aria-label="Triangle BVH statistics">
          <div><dt>BVH triangles</dt><dd>{bvhStats.triangleCount}</dd></div>
          <div><dt>Nodes / leaves</dt><dd>{bvhStats.nodeCount} / {bvhStats.leafCount}</dd></div>
          <div><dt>Depth / leaf max</dt><dd>{bvhStats.maxDepth} / {bvhStats.maxLeafSize}</dd></div>
          <div title="Average triangle intersection tests across six deterministic CPU probe rays">
            <dt>Probe tests: BVH / brute</dt>
            <dd>{bvhProbeStats.averageTriangleTests.toFixed(1)} / {bvhProbeStats.bruteForceTriangleTests}</dd>
          </div>
          <div title="Average BVH node tests across six deterministic CPU probe rays">
            <dt>Probe nodes / hits</dt>
            <dd>{bvhProbeStats.averageNodeTests.toFixed(1)} / {bvhProbeStats.hitCount} of {bvhProbeStats.rayCount}</dd>
          </div>
        </dl>
      )}
      {sphereBvhStats.sphereCount > 0 && (
        <dl className="render-panel__bvh-stats" aria-label="Sphere BVH statistics">
          <div><dt>BVH spheres</dt><dd>{sphereBvhStats.sphereCount}</dd></div>
          <div><dt>Sphere nodes / leaves</dt><dd>{sphereBvhStats.nodeCount} / {sphereBvhStats.leafCount}</dd></div>
          <div><dt>Sphere depth / leaf max</dt><dd>{sphereBvhStats.maxDepth} / {sphereBvhStats.maxLeafSize}</dd></div>
        </dl>
      )}
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
    <PersistentDetails className="editor-panel" storageKey="camera">
      <summary id="camera-settings-title">Camera</summary>
      <div className="editor-panel__content">
      <SettingsNumberField
        actions={actions}
        label="Field of view"
        historyLabel="Change field of view"
        value={state.settings.fov}
        min={10}
        max={120}
        step={1}
        precisionStep={0.1}
        snapInterval={5}
        sensitivity={1}
        integer
        help={{
          meaning: "Controls the vertical angular extent captured by the perspective camera.",
          math: <>Projection scale is proportional to <code>1 / tan(FOV / 2)</code>.</>,
          lookFor: "Wider angles show more of the scene with stronger perspective; narrower angles magnify and flatten depth.",
          performance: "It does not directly change the number of rays, though framing different geometry can change average path cost.",
        }}
        setValue={(value) => actions.setFov(value)}
      />
      <HelpedControl label="Depth of field" content={{
        meaning: "Samples rays across a finite lens instead of sending every ray through one camera point.",
        math: "Each ray starts at a random aperture position and aims toward the focal plane.",
        lookFor: "Objects near the focus distance remain sharp while nearer and farther objects blur.",
        performance: "Ray count is unchanged, but lens blur increases variance and can require more samples to converge.",
      }}><CheckboxField
          label="Depth of field"
          checked={settings.enableDepthOfField}
          density="compact"
          layout="horizontal"
          onChange={(checked) =>
            commitSetting(actions, "Toggle depth of field", () =>
              actions.setDepthOfFieldEnabled(checked)
            )
          }
      /></HelpedControl>
      <fieldset
        className="editor-controls-group"
        disabled={!settings.enableDepthOfField}
      >
        <SettingsNumberField
          actions={actions}
          label="Aperture"
          historyLabel="Change camera aperture"
          value={settings.aperture}
          min={0}
          max={0.1}
          step={0.001}
          precisionStep={0.0001}
          snapInterval={0.01}
          sensitivity={1}
          help={{
            meaning: "Sets the radius of the lens region from which camera rays originate.",
            math: "A larger aperture samples a wider disk around the camera origin.",
            lookFor: "Increasing it strengthens out-of-focus blur; zero behaves like a pinhole camera.",
            performance: "It does not add rays, but stronger blur generally needs more samples to look smooth.",
          }}
          setValue={(value) => actions.setAperture(value)}
        />
        <SettingsNumberField
          actions={actions}
          label="Focus distance"
          historyLabel="Change camera focus distance"
          value={settings.focusDistance}
          min={0.1}
          max={20}
          step={0.1}
          precisionStep={0.01}
          snapInterval={1}
          sensitivity={1}
          help={{
            meaning: "Sets the distance from the camera at which sampled lens rays converge.",
            math: "The renderer aims lens samples toward points on the focal plane at this distance.",
            lookFor: "Move the sharp band forward or backward through the scene while aperture is above zero.",
            performance: "No meaningful direct cost; it changes which parts of the image converge sharply.",
          }}
          setValue={(value) => actions.setFocusDistance(value)}
        />
      </fieldset>
      </div>
    </PersistentDetails>
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
    <PersistentDetails className="editor-panel" storageKey="hierarchy">
      <summary>Hierarchy</summary>
      <div className="editor-panel__content editor-hierarchy" role="tree">
        {state.sceneObjects.map((object) => (
          <div
            key={object.id}
            className="editor-hierarchy__row"
            role="treeitem"
            aria-selected={state.selection.objectId === object.id}
            aria-disabled={!object.selectable}
            aria-level={object.depth + 1}
            data-depth={object.depth}
            data-selected={state.selection.objectId === object.id}
          >
            <button
              className="editor-hierarchy__select"
              type="button"
              disabled={!object.selectable}
              onClick={() => actions.selectObjectById(object.id)}
            >
              <span>{object.label}</span>
              <span className="editor-hierarchy__capability">
                {object.capability}
              </span>
            </button>
            {object.lightEnabled !== undefined && (
              <button
                className="editor-hierarchy__light-toggle"
                type="button"
                aria-label={`${object.lightEnabled ? "Disable" : "Enable"} ${object.label}`}
                aria-pressed={object.lightEnabled}
                title={`${object.lightEnabled ? "Disable" : "Enable"} light`}
                onClick={() =>
                  actions.setAnalyticLightEnabled(object.id, !object.lightEnabled)
                }
              >
                {object.lightEnabled ? "On" : "Off"}
              </button>
            )}
          </div>
        ))}
      </div>
    </PersistentDetails>
  );
}

function ObjectNameField({
  objectId,
  name,
  actions,
  focusRequest,
}: {
  objectId: string;
  name: string;
  actions: PtActions;
  focusRequest: number;
}) {
  const [draft, setDraft] = useState(name);
  const cancel = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(name), [objectId, name]);
  useEffect(() => {
    if (focusRequest === 0) return;
    input.current?.focus();
    input.current?.select();
  }, [focusRequest]);
  return (
    <label className="editor-control">
      <span>Name</span>
      <input
        ref={input}
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
  renameFocusRequest,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
  renameFocusRequest: number;
}) {
  const [texturePickerOpen, setTexturePickerOpen] = useState(false);
  const [texturePreviewOpen, setTexturePreviewOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const selection = state.selection;
  const material = selection.material;
  const light = selection.light;
  if (!selection.kind) {
    return null;
  }

  if (light) {
    const lightLabel = light.type === "point" ? "Point" : light.type === "directional" ? "Sun / directional" : "Spot";
    return (
      <div className="object-inspector__content">
        <div className="editor-inspector__identity">
          <strong>{selection.name}</strong>
          <span>{lightLabel} light · Path traced</span>
        </div>
        <ObjectNameField
          objectId={selection.objectId!}
          name={selection.name!}
          actions={actions}
          focusRequest={renameFocusRequest}
        />
        <PersistentDetails className="editor-subpanel" storageKey="object-transform">
          <summary>Transform</summary>
          <VectorField
            label="Position"
            value={[selection.position.x, selection.position.y, selection.position.z]}
            step={0.01}
            precisionStep={0.001}
            snapInterval={1}
            min={-10000}
            max={10000}
            sensitivity={10 * pathTracerScrubSpeed}
            density="compact"
            onComponentChange={(index, value) => {
              actions.beginSelectedTransform();
              actions.setSelectedPosition((["x", "y", "z"] as const)[index], value);
            }}
            onCommit={() => actions.commitSelectedTransform()}
            onCancel={() => actions.cancelSelectedTransform()}
          />
          {light.type !== "point" && (
            <VectorField
              label="Rotation"
              value={[selection.rotation.x, selection.rotation.y, selection.rotation.z]}
              step={1}
              precisionStep={0.1}
              snapInterval={15}
              min={-360}
              max={360}
              sensitivity={1 * pathTracerScrubSpeed}
              density="compact"
              onComponentChange={(index, value) => {
                actions.beginSelectedTransform();
                actions.setSelectedRotation((["x", "y", "z"] as const)[index], value);
              }}
              onCommit={() => actions.commitSelectedTransform()}
              onCancel={() => actions.cancelSelectedTransform()}
            />
          )}
        </PersistentDetails>
        <PersistentDetails className="editor-subpanel" storageKey="analytic-light">
          <summary>Light · {lightLabel}</summary>
          <CheckboxField
            label="Enabled"
            checked={light.enabled}
            density="compact"
            layout="horizontal"
            onChange={(enabled) => {
              actions.setSelectedLightEnabled(enabled);
              actions.commitSelectedLightEdit();
            }}
          />
          <ColorField
            label="Color"
            value={light.color}
            onBegin={() => actions.beginSelectedLightEdit()}
            onChange={(value) => actions.setSelectedLightColor(new THREE.Color(value))}
            onCommit={() => actions.commitSelectedLightEdit()}
          />
          <EditorNumberField
            label="Intensity"
            value={light.intensity}
            min={0}
            max={1000}
            step={0.1}
            precisionStep={0.01}
            snapInterval={1}
            sensitivity={1 * pathTracerScrubSpeed}
            density="compact"
            layout="horizontal"
            onChange={(value) => actions.setSelectedLightIntensity(value)}
            onCommit={() => actions.commitSelectedLightEdit()}
            onCancel={() => actions.cancelSelectedLightEdit()}
          />
          {light.type === "directional" && (
            <EditorNumberField
              label="Angular diameter"
              value={light.angularDiameter}
              min={0}
              max={10}
              step={0.1}
              precisionStep={0.01}
              snapInterval={0.5}
              sensitivity={1 * pathTracerScrubSpeed}
              density="compact"
              layout="horizontal"
              onChange={(value) => actions.setSelectedLightAngularDiameter(value)}
              onCommit={() => actions.commitSelectedLightEdit()}
              onCancel={() => actions.cancelSelectedLightEdit()}
            />
          )}
          {light.type === "spot" && (
            <>
              <EditorNumberField
                label="Inner cone"
                value={light.innerConeAngle}
                min={0}
                max={89}
                step={1}
                precisionStep={0.1}
                snapInterval={5}
                sensitivity={1 * pathTracerScrubSpeed}
                density="compact"
                layout="horizontal"
                onChange={(value) => actions.setSelectedSpotCone("innerConeAngle", value)}
                onCommit={() => actions.commitSelectedLightEdit()}
                onCancel={() => actions.cancelSelectedLightEdit()}
              />
              <EditorNumberField
                label="Outer cone"
                value={light.outerConeAngle}
                min={0.1}
                max={89}
                step={1}
                precisionStep={0.1}
                snapInterval={5}
                sensitivity={1 * pathTracerScrubSpeed}
                density="compact"
                layout="horizontal"
                onChange={(value) => actions.setSelectedSpotCone("outerConeAngle", value)}
                onCommit={() => actions.commitSelectedLightEdit()}
                onCancel={() => actions.cancelSelectedLightEdit()}
              />
            </>
          )}
          <p className="editor-control__hint">
            {light.type === "directional"
              ? "Zero angular diameter is an ideal directional light; a finite diameter produces a soft sun."
              : light.type === "spot"
                ? "Radiant intensity uses inverse-square falloff and smooth inner/outer cone attenuation."
                : "Radiant intensity uses inverse-square falloff."} Raster preview appearance is approximate.
          </p>
        </PersistentDetails>
      </div>
    );
  }

  if (!material) return null;

  return (
      <div className="object-inspector__content">
        <div className="editor-inspector__identity">
          <strong>{selection.name}</strong>
          <span>{selection.kind === "sphere" ? "Sphere" : selection.kind === "triangleMesh" ? "Triangle mesh" : "Quad"} · Path traced</span>
        </div>
        <ObjectNameField
          objectId={selection.objectId!}
          name={selection.name!}
          actions={actions}
          focusRequest={renameFocusRequest}
        />
        <PersistentDetails className="editor-subpanel" storageKey="object-transform">
          <summary>Transform</summary>
          <VectorField
            label="Position"
            value={[
              selection.position.x,
              selection.position.y,
              selection.position.z,
            ]}
            step={0.01}
            precisionStep={0.001}
            snapInterval={1}
            min={-10000}
            max={10000}
            sensitivity={10 * pathTracerScrubSpeed}
            density="compact"
            onComponentChange={(index, value) => {
              actions.beginSelectedTransform();
              actions.setSelectedPosition((["x", "y", "z"] as const)[index], value);
            }}
            onCommit={() => actions.commitSelectedTransform()}
            onCancel={() => actions.cancelSelectedTransform()}
          />
          {(selection.kind === "quad" || selection.kind === "triangleMesh") && (
            <VectorField
              label="Rotation"
              value={[selection.rotation.x, selection.rotation.y, selection.rotation.z]}
              step={1}
              precisionStep={0.1}
              snapInterval={15}
              min={-360}
              max={360}
              sensitivity={1 * pathTracerScrubSpeed}
              density="compact"
              onComponentChange={(index, value) => {
                actions.beginSelectedTransform();
                actions.setSelectedRotation((['x', 'y', 'z'] as const)[index], value);
              }}
              onCommit={() => actions.commitSelectedTransform()}
              onCancel={() => actions.cancelSelectedTransform()}
            />
          )}
          {selection.radius !== null && <EditorNumberField
            label="Radius"
            value={selection.radius}
            min={0.001}
            max={10000}
            step={0.01}
            precisionStep={0.001}
            snapInterval={1}
            sensitivity={10 * pathTracerScrubSpeed}
            density="compact"
            layout="horizontal"
            onChange={(value) => {
              actions.beginSelectedTransform();
              actions.setSelectedRadius(value);
            }}
            onCommit={() => actions.commitSelectedTransform()}
            onCancel={() => actions.cancelSelectedTransform()}
          />}
          {selection.width !== null && <EditorNumberField
            label="Width"
            value={selection.width}
            min={0.001}
            max={10000}
            step={0.01}
            precisionStep={0.001}
            snapInterval={1}
            sensitivity={10 * pathTracerScrubSpeed}
            density="compact"
            layout="horizontal"
            onChange={(value) => actions.setSelectedQuadSize("width", value)}
            onCommit={() => actions.commitSelectedTransform()}
            onCancel={() => actions.cancelSelectedTransform()}
          />}
          {selection.height !== null && <EditorNumberField
            label="Height"
            value={selection.height}
            min={0.001}
            max={10000}
            step={0.01}
            precisionStep={0.001}
            snapInterval={1}
            sensitivity={10 * pathTracerScrubSpeed}
            density="compact"
            layout="horizontal"
            onChange={(value) => actions.setSelectedQuadSize("height", value)}
            onCommit={() => actions.commitSelectedTransform()}
            onCancel={() => actions.cancelSelectedTransform()}
          />}
          {selection.kind === "sphere" && <SelectField
            label="UV mapping"
            value={selection.uvMapping ?? "spherical"}
            options={[
              { value: "spherical", label: "Spherical" },
              { value: "box", label: "Box projection" },
            ]}
            density="compact"
            layout="horizontal"
            onChange={(value) =>
              actions.setSelectedUvMapping(value as "spherical" | "box")
            }
          />}
        </PersistentDetails>
        {selection.mesh && (
          <PersistentDetails className="editor-subpanel" storageKey="object-geometry">
            <summary>Geometry · Triangle mesh</summary>
            <dl className="object-inspector__mesh-stats">
              <div><dt>Triangles</dt><dd>{selection.mesh.triangleCount}</dd></div>
              <div><dt>Vertices</dt><dd>{selection.mesh.vertexCount}</dd></div>
              <div><dt>Storage</dt><dd>{selection.mesh.indexed ? "Indexed" : "Non-indexed"}</dd></div>
            </dl>
            <CheckboxField
              label="Show triangles"
              checked={selection.mesh.wireframeVisible}
              density="compact"
              layout="horizontal"
              onChange={(checked) =>
                actions.setSelectedTriangleWireframeVisible(checked)
              }
            />
          </PersistentDetails>
        )}
        <PersistentDetails className="editor-subpanel" storageKey="object-material">
          <summary>Material · {material.kind}</summary>
          {material.kind === "Principled" && <span className="texture-picker__label">Base color</span>}
          <div className="texture-slot">
            <button type="button" className={`texture-slot__preview texture-slot__preview--${material.texture.type}`} data-empty={material.texture.type === "constant"}
              title={material.texture.source ? "Preview texture" : "Choose a texture"}
              onClick={() => material.texture.source ? setTexturePreviewOpen((open) => !open) : setTexturePickerOpen((open) => !open)}>
              {material.texture.source
                ? <img src={material.texture.source} alt={`${material.texture.label} texture`} />
                : material.texture.type === "constant" ? <span>None</span> : <span>{material.texture.label}</span>}
            </button>
            <div className="texture-slot__details">
              <strong>{material.texture.label}</strong>
              <span>{material.texture.type}</span>
              {material.kind === "Principled" && (
                <CheckboxField
                  label="Enabled"
                  checked={material.texture.enabled}
                  density="compact" layout="horizontal"
                  onChange={(enabled) => actions.setMaterialTextureSlotEnabled(
                    material.id, "baseColor", enabled
                  )}
                />
              )}
              <div className="texture-slot__actions">
                <button type="button" onClick={() => setTexturePickerOpen((open) => !open)}>{material.texture.source ? "Replace" : "Choose"}</button>
                {material.texture.source && <button type="button" onClick={() => actions.removeMaterialTexture(material.id)}>Remove</button>}
              </div>
            </div>
            <input ref={fileInput} className="texture-slot__file" type="file" accept="image/*" onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              actions.setMaterialImage(material.id, URL.createObjectURL(file), file.name);
              setTexturePickerOpen(false);
              event.currentTarget.value = "";
            }} />
          </div>
          {texturePreviewOpen && material.texture.source && (
            <button type="button" className="texture-preview" onClick={() => setTexturePreviewOpen(false)}>
              <img src={material.texture.source} alt={`${material.texture.label} full preview`} /><span>Click to close</span>
            </button>
          )}
          {texturePickerOpen && (
            <div className="texture-picker">
              <span className="texture-picker__label">Built in</span>
              <div className="texture-picker__grid">
                <button type="button" onClick={() => { actions.setMaterialChecker(material.id); setTexturePickerOpen(false); }}>
                  <span className="texture-picker__procedural texture-picker__procedural--checker" /><span>Checker</span>
                </button>
                <button type="button" onClick={() => { actions.setMaterialPerlin(material.id); setTexturePickerOpen(false); }}>
                  <span className="texture-picker__procedural texture-picker__procedural--perlin" /><span>Perlin</span>
                </button>
                {builtinTextures.map((texture) => (
                  <button type="button" key={texture.id} title={texture.label} onClick={() => {
                    actions.setMaterialImage(material.id, texture.source, texture.label);
                    setTexturePickerOpen(false);
                  }}><img src={texture.source} alt="" /><span>{texture.label}</span></button>
                ))}
              </div>
              <button type="button" className="texture-picker__import" onClick={() => fileInput.current?.click()}>Import image…</button>
            </div>
          )}
          {(material.texture.type === "checker" || material.texture.type === "perlin") && (
            <div className="procedural-texture-controls">
              <ColorField label="Color A" value={material.texture.colorA!}
                onBegin={() => actions.beginMaterialEdit(material.id)}
                onChange={(value) => actions.setTextureColor(material.id, "colorA", new THREE.Color(value))}
                onCommit={() => actions.commitMaterialEdit()} />
              <ColorField label="Color B" value={material.texture.colorB!}
                onBegin={() => actions.beginMaterialEdit(material.id)}
                onChange={(value) => actions.setTextureColor(material.id, "colorB", new THREE.Color(value))}
                onCommit={() => actions.commitMaterialEdit()} />
              <EditorNumberField
                label={material.texture.type === "checker" ? "Repeats" : "Scale"}
                value={material.texture.scale!}
                min={0.1}
                max={100}
                step={0.1}
                precisionStep={0.01}
                snapInterval={1}
                sensitivity={5 * pathTracerScrubSpeed}
                density="compact"
                layout="horizontal"
                onChange={(value) => {
                  actions.beginMaterialEdit(material.id);
                  actions.setTextureScale(material.id, value);
                }}
                onCommit={() => actions.commitMaterialEdit()}
                onCancel={() => actions.cancelMaterialEdit()}
              />
              {material.texture.type === "perlin" && (
                <EditorNumberField
                  label="Turbulence"
                  value={material.texture.turbulence!}
                  min={0}
                  max={20}
                  step={0.5}
                  precisionStep={0.05}
                  snapInterval={1}
                  sensitivity={0.5 * pathTracerScrubSpeed}
                  density="compact"
                  layout="horizontal"
                  onChange={(value) => {
                    actions.beginMaterialEdit(material.id);
                    actions.setTextureTurbulence(material.id, value);
                  }}
                  onCommit={() => actions.commitMaterialEdit()}
                  onCancel={() => actions.cancelMaterialEdit()}
                />
              )}
            </div>
          )}
          {(material.kind === "Principled" || material.texture.type === "constant") && (
            <ColorField
              label={material.kind === "Principled" ? "Base color factor" : "Color"}
              value={material.color}
              onBegin={() => actions.beginMaterialEdit(material.id)}
              onChange={(value) =>
                actions.setMaterialColor(material.id, new THREE.Color(value))
              }
              onCommit={() => actions.commitMaterialEdit()}
            />
          )}
          {material.metallicRoughnessTexture && (
            <div className="material-input-group">
              <MaterialMapSlot
                label="Metallic / roughness"
                texture={material.metallicRoughnessTexture}
                onReplace={(source) => actions.setMaterialTextureSlotImage(
                  material.id, "metallicRoughness", source
                )}
                onRemove={() => actions.removeMaterialTextureSlot(
                  material.id, "metallicRoughness"
                )}
                onEnabledChange={(enabled) => actions.setMaterialTextureSlotEnabled(
                  material.id, "metallicRoughness", enabled
                )}
              />
              {material.metallic !== null && (
                <EditorNumberField
                  label="Metallic factor"
                  value={material.metallic}
                  min={0} max={1} step={0.01} precisionStep={0.001}
                  snapInterval={0.1} sensitivity={1 * pathTracerScrubSpeed}
                  density="compact" layout="horizontal"
                  onChange={(value) => actions.setMaterialMetallic(material.id, value)}
                  onCommit={() => actions.commitMaterialEdit()}
                  onCancel={() => actions.cancelMaterialEdit()}
                />
              )}
              {material.roughness !== null && (
                <EditorNumberField
                  label="Roughness factor"
                  value={material.roughness}
                  min={0} max={1} step={0.01} precisionStep={0.001}
                  snapInterval={0.1} sensitivity={1 * pathTracerScrubSpeed}
                  density="compact" layout="horizontal"
                  onChange={(value) => {
                    actions.beginMaterialEdit(material.id);
                    actions.setMaterialFuzz(material.id, value);
                  }}
                  onCommit={() => actions.commitMaterialEdit()}
                  onCancel={() => actions.cancelMaterialEdit()}
                />
              )}
              {material.ior !== null && (
                <EditorNumberField
                  label="Dielectric IOR"
                  value={material.ior}
                  min={1} max={2.5} step={0.01} precisionStep={0.001}
                  snapInterval={0.1} sensitivity={1 * pathTracerScrubSpeed}
                  density="compact" layout="horizontal"
                  onChange={(value) => {
                    actions.beginMaterialEdit(material.id);
                    actions.setMaterialIor(material.id, value);
                  }}
                  onCommit={() => actions.commitMaterialEdit()}
                  onCancel={() => actions.cancelMaterialEdit()}
                />
              )}
            </div>
          )}
          {material.emissionTexture && (
            <div className="material-input-group">
              <MaterialMapSlot
                label="Emission"
                texture={material.emissionTexture}
                onReplace={(source) => actions.setMaterialTextureSlotImage(
                  material.id, "emission", source
                )}
                onRemove={() => actions.removeMaterialTextureSlot(material.id, "emission")}
                onEnabledChange={(enabled) => actions.setMaterialTextureSlotEnabled(
                  material.id, "emission", enabled
                )}
              />
              {material.emissionColor && (
                <ColorField
                  label="Emission color factor"
                  value={material.emissionColor}
                  onBegin={() => actions.beginMaterialEdit(material.id)}
                  onChange={(value) => actions.setMaterialEmissionColor(
                    material.id, new THREE.Color(value)
                  )}
                  onCommit={() => actions.commitMaterialEdit()}
                />
              )}
              {material.emissionStrength !== null && (
              <EditorNumberField
                label="Emission strength"
                value={material.emissionStrength}
                min={0}
                max={100}
                step={0.1}
                precisionStep={0.01}
                snapInterval={1}
                sensitivity={1 * pathTracerScrubSpeed}
                density="compact"
                layout="horizontal"
                onChange={(value) => {
                  actions.beginMaterialEdit(material.id);
                  actions.setMaterialEmissionStrength(material.id, value);
                }}
                onCommit={() => actions.commitMaterialEdit()}
                onCancel={() => actions.cancelMaterialEdit()}
              />
              )}
              {material.emissionTwoSided !== null && (
                <CheckboxField
                  label="Two-sided emission"
                  checked={material.emissionTwoSided}
                  density="compact" layout="horizontal"
                  onChange={(checked) =>
                    actions.setMaterialEmissionTwoSided(material.id, checked)
                  }
                />
              )}
            </div>
          )}
          {material.kind !== "Principled" && material.emissionStrength !== null && (
            <EditorNumberField
              label="Emission strength" value={material.emissionStrength}
              min={0} max={100} step={0.1} precisionStep={0.01}
              snapInterval={1} sensitivity={1 * pathTracerScrubSpeed}
              density="compact" layout="horizontal"
              onChange={(value) => actions.setMaterialEmissionStrength(material.id, value)}
              onCommit={() => actions.commitMaterialEdit()}
              onCancel={() => actions.cancelMaterialEdit()}
            />
          )}
          {material.kind !== "Principled" && material.emissionTwoSided !== null && (
            <CheckboxField
              label="Two-sided emission"
              checked={material.emissionTwoSided}
              density="compact" layout="horizontal"
              onChange={(checked) => actions.setMaterialEmissionTwoSided(material.id, checked)}
            />
          )}
          {material.kind !== "Principled" && material.roughness !== null && (
            <EditorNumberField
              label="Roughness" value={material.roughness}
              min={0} max={1} step={0.01} precisionStep={0.001}
              snapInterval={0.1} sensitivity={1 * pathTracerScrubSpeed}
              density="compact" layout="horizontal"
              onChange={(value) => actions.setMaterialFuzz(material.id, value)}
              onCommit={() => actions.commitMaterialEdit()}
              onCancel={() => actions.cancelMaterialEdit()}
            />
          )}
          {material.kind !== "Principled" && material.ior !== null && (
            <EditorNumberField
              label="IOR" value={material.ior}
              min={1} max={2.5} step={0.01} precisionStep={0.001}
              snapInterval={0.1} sensitivity={1 * pathTracerScrubSpeed}
              density="compact" layout="horizontal"
              onChange={(value) => actions.setMaterialIor(material.id, value)}
              onCommit={() => actions.commitMaterialEdit()}
              onCancel={() => actions.cancelMaterialEdit()}
            />
          )}
        </PersistentDetails>
        <div className="editor-inspector__commands">
          <button type="button" onClick={() => actions.frameSelectedObject()}>
            Frame
          </button>
          {selection.kind !== "triangleMesh" && <button type="button" onClick={() => actions.duplicateSelectedObject()}>
            Duplicate
          </button>}
          {selection.kind !== "triangleMesh" && <button type="button" onClick={() => actions.removeSelectedObject()}>
            Remove
          </button>}
        </div>
      </div>
  );
}

function SelectedObjectInspector({
  state,
  actions,
  renameFocusRequest,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
  renameFocusRequest: number;
}) {
  const [collapsed, setCollapsed] = usePersistentBoolean("panel:object", false);
  const [size, setSize] = usePersistentPanelSize(
    state.sceneKey,
    "object",
    { width: 260, height: 620 }
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
    if (renameFocusRequest > 0) setCollapsed(false);
  }, [renameFocusRequest]);

  if (state.selection.objectId === null) return null;

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
      className="object-inspector"
      aria-label="Selected object inspector"
      data-collapsed={collapsed}
      style={
        collapsed
          ? undefined
          : { width: size.width, height: size.height }
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
      {!collapsed && (
        <ObjectInspectorContent
          state={state}
          actions={actions}
          renameFocusRequest={renameFocusRequest}
        />
      )}
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
      Math.max(96, size.height),
      Math.max(96, window.innerHeight - 32)
    ),
  };
}

function readPersistedPanelSize(
  sceneKey: string,
  panelKey: string,
  fallback: PanelSize
) {
  try {
    const stored = localStorage.getItem(
      `${editorUiStoragePrefix}panel-size:${sceneKey}:${panelKey}`
    );
    if (!stored) return clampPanelSize(fallback);
    const candidate = JSON.parse(stored) as Partial<PanelSize>;
    if (
      typeof candidate.width !== "number" ||
      !Number.isFinite(candidate.width) ||
      typeof candidate.height !== "number" ||
      !Number.isFinite(candidate.height)
    ) {
      return clampPanelSize(fallback);
    }
    return clampPanelSize({ width: candidate.width, height: candidate.height });
  } catch {
    return clampPanelSize(fallback);
  }
}

function usePersistentPanelSize(
  sceneKey: string,
  panelKey: string,
  fallback: PanelSize
) {
  const storageKey = `${editorUiStoragePrefix}panel-size:${sceneKey}:${panelKey}`;
  const storageKeyRef = useRef(storageKey);
  const [size, setSizeState] = useState<PanelSize>(() =>
    readPersistedPanelSize(sceneKey, panelKey, fallback)
  );

  useEffect(() => {
    storageKeyRef.current = storageKey;
    setSizeState(readPersistedPanelSize(sceneKey, panelKey, fallback));
  }, [fallback.height, fallback.width, panelKey, sceneKey, storageKey]);

  const setSize = (next: PanelSize | ((current: PanelSize) => PanelSize)) => {
    setSizeState((current) => {
      const resolved = clampPanelSize(
        typeof next === "function" ? next(current) : next
      );
      try {
        localStorage.setItem(storageKeyRef.current, JSON.stringify(resolved));
      } catch {
        // Panel sizing remains functional when storage is unavailable.
      }
      return resolved;
    });
  };

  return [size, setSize] as const;
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
  const [collapsed, setCollapsed] = usePersistentBoolean("panel:render", false);
  const [size, setSize] = usePersistentPanelSize(
    state.sceneKey,
    "render",
    { width: 260, height: 360 }
  );
  const resizeGesture = useRef<{
    axis: ResizeAxis;
    pointerId: number;
    startX: number;
    startY: number;
    startSize: PanelSize;
  } | null>(null);
  const fps = useFrameRate();

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
      className="render-panel"
      aria-label="Render settings"
      data-collapsed={collapsed}
      style={collapsed ? undefined : { width: size.width, maxHeight: size.height }}
    >
      <button
        className="render-panel__toggle"
        type="button"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
      >
        <span>Render</span>
        <span className="render-panel__meta">
          {fps === null ? "—" : fps} FPS · {
            state.settings.renderMode === "raster"
              ? "Raster"
              : state.settings.renderMode === "comparison"
                ? "Comparison"
                : state.settings.renderMode === "region"
                  ? "Region"
                  : "Path tracing"
          }
        </span>
        <span className="render-panel__chevron" aria-hidden="true">⌃</span>
      </button>
      {!collapsed && <RenderSettings state={state} actions={actions} />}
      {(["width", "height", "both"] as const).map((axis) => (
        <div
          key={axis}
          className={`render-panel__resize-handle render-panel__resize-handle--${axis}`}
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

function CreationMenu({
  actions,
  selectionActive,
  onClose,
  onRename,
  style,
}: {
  actions: PtActions;
  selectionActive: boolean;
  onClose: () => void;
  onRename: () => void;
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
      <button type="button" role="menuitem" onClick={() => run(() => actions.addQuad())}>
        <span>Add quad</span>
      </button>
      <div className="creation-menu__separator" />
      <span className="creation-menu__section-label">Add Light</span>
      <button type="button" role="menuitem" onClick={() => run(() => actions.addEmissiveQuad())}>
        <span>Area light</span><small>Emissive quad</small>
      </button>
      <button type="button" role="menuitem" onClick={() => run(() => actions.addEmissiveSphere())}>
        <span>Sphere light</span><small>Emissive sphere</small>
      </button>
      <button type="button" role="menuitem" onClick={() => run(() => actions.addPointLight())}>
        <span>Point light</span><small>Inverse-square analytic light</small>
      </button>
      <button type="button" role="menuitem" onClick={() => run(() => actions.addDirectionalLight())}>
        <span>Sun / directional light</span><small>Ideal or finite angular diameter</small>
      </button>
      <button type="button" role="menuitem" onClick={() => run(() => actions.addSpotLight())}>
        <span>Spot light</span><small>Inverse-square cone light</small>
      </button>
      <button type="button" role="menuitem" disabled title="Available after triangle support">
        <span>Import mesh</span><small>Not traceable yet</small>
      </button>
      {selectionActive && <div className="creation-menu__separator" />}
      {selectionActive && (
        <button type="button" role="menuitem" onClick={() => run(onRename)}>
          <span>Rename</span>
        </button>
      )}
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

function HybridComparisonSeam({ actions }: { actions: PtActions }) {
  const [seam, setSeam] = useState(0.5);
  const draggingPointer = useRef<number | null>(null);
  const hovering = useRef(false);
  const focused = useRef(false);

  useEffect(
    () => () => actions.setHybridComparisonInteractionActive(false),
    [actions]
  );

  const updateSeam = (clientX: number) => {
    const next = THREE.MathUtils.clamp(clientX / window.innerWidth, 0.03, 0.97);
    setSeam(next);
    actions.setHybridComparisonSeam(next);
  };

  return (
    <div
      className="hybrid-comparison-seam"
      style={{ left: `${seam * 100}%` }}
      role="separator"
      aria-label="Raster and path-traced comparison seam"
      aria-orientation="vertical"
      aria-valuemin={3}
      aria-valuemax={97}
      aria-valuenow={Math.round(seam * 100)}
      tabIndex={0}
      onPointerEnter={() => {
        hovering.current = true;
        actions.setHybridComparisonInteractionActive(true);
      }}
      onPointerLeave={() => {
        hovering.current = false;
        if (draggingPointer.current === null && !focused.current) {
          actions.setHybridComparisonInteractionActive(false);
        }
      }}
      onFocus={() => {
        focused.current = true;
        actions.setHybridComparisonInteractionActive(true);
      }}
      onBlur={() => {
        focused.current = false;
        if (!hovering.current && draggingPointer.current === null) {
          actions.setHybridComparisonInteractionActive(false);
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        draggingPointer.current = event.pointerId;
        actions.setHybridComparisonInteractionActive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        updateSeam(event.clientX);
      }}
      onPointerMove={(event) => {
        if (draggingPointer.current === event.pointerId) updateSeam(event.clientX);
      }}
      onPointerUp={(event) => {
        if (draggingPointer.current !== event.pointerId) return;
        draggingPointer.current = null;
        if (!hovering.current && !focused.current) {
          actions.setHybridComparisonInteractionActive(false);
        }
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        draggingPointer.current = null;
        if (!hovering.current && !focused.current) {
          actions.setHybridComparisonInteractionActive(false);
        }
      }}
      onKeyDown={(event) => {
        const delta = event.shiftKey ? 0.01 : 0.05;
        if (event.key === "ArrowLeft") {
          const next = Math.max(0.03, seam - delta);
          setSeam(next);
          actions.setHybridComparisonSeam(next);
          event.preventDefault();
        } else if (event.key === "ArrowRight") {
          const next = Math.min(0.97, seam + delta);
          setSeam(next);
          actions.setHybridComparisonSeam(next);
          event.preventDefault();
        }
      }}
    >
      <span className="hybrid-comparison-seam__label hybrid-comparison-seam__label--raster">
        Raster
      </span>
      <span className="hybrid-comparison-seam__handle" aria-hidden="true">↔</span>
      <span className="hybrid-comparison-seam__label hybrid-comparison-seam__label--pathtraced">
        Path traced
      </span>
    </div>
  );
}

type HybridRegionRect = { left: number; top: number; width: number; height: number };
type HybridRegionEdge = "move" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

function HybridComparisonRegion({ actions }: { actions: PtActions }) {
  const [region, setRegion] = useState<HybridRegionRect>({
    left: 0.3,
    top: 0.3,
    width: 0.4,
    height: 0.4,
  });
  const gesture = useRef<{
    pointerId: number;
    edge: HybridRegionEdge;
    startX: number;
    startY: number;
    start: HybridRegionRect;
  } | null>(null);
  const hovering = useRef(false);
  const focused = useRef(false);

  useEffect(
    () => () => actions.setHybridRegionInteractionActive(false),
    [actions]
  );

  const applyRegion = (next: HybridRegionRect) => {
    setRegion(next);
    actions.setHybridRegion(next.left, next.top, next.width, next.height);
  };

  const updateGesture = (clientX: number, clientY: number) => {
    const active = gesture.current;
    if (!active) return;
    const dx = (clientX - active.startX) / window.innerWidth;
    const dy = (clientY - active.startY) / window.innerHeight;
    const minimum = 0.12;
    let { left, top, width, height } = active.start;

    if (active.edge === "move") {
      left = THREE.MathUtils.clamp(left + dx, 0, 1 - width);
      top = THREE.MathUtils.clamp(top + dy, 0, 1 - height);
    } else {
      if (active.edge.includes("e")) width = THREE.MathUtils.clamp(width + dx, minimum, 1 - left);
      if (active.edge.includes("s")) height = THREE.MathUtils.clamp(height + dy, minimum, 1 - top);
      if (active.edge.includes("w")) {
        const right = left + width;
        left = THREE.MathUtils.clamp(left + dx, 0, right - minimum);
        width = right - left;
      }
      if (active.edge.includes("n")) {
        const bottom = top + height;
        top = THREE.MathUtils.clamp(top + dy, 0, bottom - minimum);
        height = bottom - top;
      }
    }
    applyRegion({ left, top, width, height });
  };

  return (
    <div
      className="hybrid-comparison-region"
      style={{
        left: `${region.left * 100}%`,
        top: `${region.top * 100}%`,
        width: `${region.width * 100}%`,
        height: `${region.height * 100}%`,
      }}
      role="group"
      aria-label="Path-traced region; drag to move and use its edges to resize"
      tabIndex={0}
      onPointerEnter={() => {
        hovering.current = true;
        actions.setHybridRegionInteractionActive(true);
      }}
      onPointerLeave={() => {
        hovering.current = false;
        if (!gesture.current && !focused.current) {
          actions.setHybridRegionInteractionActive(false);
        }
      }}
      onFocus={() => {
        focused.current = true;
        actions.setHybridRegionInteractionActive(true);
      }}
      onBlur={() => {
        focused.current = false;
        if (!hovering.current && !gesture.current) {
          actions.setHybridRegionInteractionActive(false);
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement;
        const edge = (target.dataset.regionEdge ?? "move") as HybridRegionEdge;
        gesture.current = {
          pointerId: event.pointerId,
          edge,
          startX: event.clientX,
          startY: event.clientY,
          start: region,
        };
        actions.setHybridRegionInteractionActive(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        if (gesture.current?.pointerId === event.pointerId) {
          updateGesture(event.clientX, event.clientY);
        }
      }}
      onPointerUp={(event) => {
        if (gesture.current?.pointerId !== event.pointerId) return;
        gesture.current = null;
        if (!hovering.current && !focused.current) {
          actions.setHybridRegionInteractionActive(false);
        }
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        gesture.current = null;
        if (!hovering.current && !focused.current) {
          actions.setHybridRegionInteractionActive(false);
        }
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.005 : 0.02;
        let left = region.left;
        let top = region.top;
        if (event.key === "ArrowLeft") left -= step;
        else if (event.key === "ArrowRight") left += step;
        else if (event.key === "ArrowUp") top -= step;
        else if (event.key === "ArrowDown") top += step;
        else return;
        applyRegion({
          ...region,
          left: THREE.MathUtils.clamp(left, 0, 1 - region.width),
          top: THREE.MathUtils.clamp(top, 0, 1 - region.height),
        });
        event.preventDefault();
      }}
    >
      <span className="hybrid-comparison-region__label">
        Path traced · {Math.round(region.width * region.height * 100)}%
      </span>
      {(["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const).map((edge) => (
        <span
          key={edge}
          className={`hybrid-comparison-region__handle hybrid-comparison-region__handle--${edge}`}
          data-region-edge={edge}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function EditorShell({ actions }: { actions: PtActions }) {
  const state = useSyncExternalStore(
    (listener) => actions.subscribe(listener),
    () => actions.getState()
  );
  const [collapsed, setCollapsed] = usePersistentBoolean("panel:scene", false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [renameFocusRequest, setRenameFocusRequest] = useState(0);
  const analyticLightSelected = state.selection.light !== null;
  const pointLightSelected = state.selection.light?.type === "point";
  const [size, setSize] = usePersistentPanelSize(
    state.sceneKey,
    "scene",
    { width: 260, height: 620 }
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
      if (
        event.button === 2 &&
        !(target instanceof Element && target.closest("#editor-root aside"))
      ) {
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
    const handlePointerUp = (event: PointerEvent) => {
      if (event.button !== 2 || !contextGesture) return;
      const gesture = contextGesture;
      contextGesture = null;
      if (gesture.moved) return;

      const target = event.target;
      if (target instanceof Element && target.closest("#editor-root aside")) return;
      setAddMenuOpen(false);
      setContextMenu({
        x: Math.min(event.clientX, window.innerWidth - 190),
        y: Math.min(event.clientY, window.innerHeight - 220),
      });
    };
    const handlePointerCancel = () => {
      contextGesture = null;
    };
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("#editor-root aside")) return;
      event.preventDefault();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddMenuOpen(false);
        setContextMenu(null);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel);
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
    {state.settings.renderMode === "comparison" && (
      <HybridComparisonSeam actions={actions} />
    )}
    {state.settings.renderMode === "region" && (
      <HybridComparisonRegion actions={actions} />
    )}
    <a
      className="editor-repository-link"
      href="https://github.com/sbobyn/pathtracer-lab"
      target="_blank"
      rel="noreferrer"
      aria-label="Open the Path Tracer Lab GitHub repository"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.22c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.41-1.27.74-1.56-2.57-.29-5.27-1.29-5.27-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.16 1.18A10.96 10.96 0 0 1 12 6.14c.98 0 1.95.13 2.86.38 2.2-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.71 5.38-5.29 5.67.42.36.78 1.06.78 2.14v3.26c0 .31.21.68.8.56A11.5 11.5 0 0 0 12 .7Z"
        />
      </svg>
      <span>Code</span>
    </a>
    <div className="editor-top-toolbar">
      <div className="scene-toolbar__add-wrap">
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
        <span className="scene-toolbar__add-icon" aria-hidden="true">＋</span>
        <span className="scene-toolbar__add-label">Add</span>
      </button>
      {addMenuOpen && (
        <CreationMenu
          actions={actions}
          selectionActive={state.selection.objectId !== null}
          onClose={() => setAddMenuOpen(false)}
          onRename={() => setRenameFocusRequest((request) => request + 1)}
        />
      )}
      </div>
      {state.selection.objectId !== null && (
        <div className="transform-toolbar" aria-label="Transform tools">
          <div className="transform-toolbar__group" aria-label="Transform mode">
            <button type="button" aria-pressed={state.settings.transformMode === "translate"} title="Move (G)" onClick={() => actions.setTransformMode("translate")}><kbd>G</kbd><span>Move</span></button>
            <button type="button" disabled={pointLightSelected} aria-pressed={state.settings.transformMode === "rotate"} title="Rotate (R)" onClick={() => actions.setTransformMode("rotate")}><kbd>R</kbd><span>Rotate</span></button>
            <button type="button" disabled={analyticLightSelected} aria-pressed={state.settings.transformMode === "scale"} title="Scale (S)" onClick={() => actions.setTransformMode("scale")}><kbd>S</kbd><span>Scale</span></button>
          </div>
          <div className="transform-toolbar__divider" aria-hidden="true" />
          <div className="transform-toolbar__group" aria-label="Transform orientation">
            <button type="button" aria-pressed={state.settings.transformSpace === "global"} onClick={() => actions.setTransformSpace("global")}>Global</button>
            <button type="button" aria-pressed={state.settings.transformSpace === "local"} onClick={() => actions.setTransformSpace("local")}>Local</button>
          </div>
        </div>
      )}
    </div>
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
          <span className="editor-shell__scene">{presetPtSceneLabel(state.sceneKey)}</span>
          <span className="editor-shell__chevron" aria-hidden="true">⌃</span>
        </button>
      </div>
      <div className="editor-shell__body">
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
    <SelectedObjectInspector
      state={state}
      actions={actions}
      renameFocusRequest={renameFocusRequest}
    />
    </div>
    <div className="editor-right-stack">
    <RenderPanel state={state} actions={actions} />
    </div>
    {contextMenu && (
      <CreationMenu
        actions={actions}
        selectionActive={state.selection.objectId !== null}
        onClose={() => setContextMenu(null)}
        onRename={() => setRenameFocusRequest((request) => request + 1)}
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
