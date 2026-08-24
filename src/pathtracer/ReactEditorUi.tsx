import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
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
import type { PtState } from "./PtState";
import { PresetPtScenes } from "./PresetPtScenes";
import { builtinTextures } from "./BuiltinTextures";
import { builtinEnvironments, findBuiltinEnvironment } from "./BuiltinEnvironments";

const editorUiStoragePrefix = "three-pathtracer:editor-ui:v1:";
const pathTracerScrubSpeed = 0.25;

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
  setValue: (value: number) => void;
}) {
  return (
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
        options={Object.keys(PresetPtScenes).map((sceneKey) => ({
          value: sceneKey,
          label: sceneKey,
        }))}
        density="compact"
        layout="horizontal"
        onChange={(value) => actions.setScene(value)}
      />
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
          <EditorNumberField
            label="Intensity"
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
              actions.beginSettingsEdit("Change environment intensity");
              actions.setEnvironmentIntensity(value);
            }}
            onCommit={() => actions.commitSettingsEdit()}
            onCancel={() => actions.cancelSettingsEdit()}
          />
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
  return (
      <div className="render-panel__content">
      <CheckboxField
          label="Path tracing"
          checked={settings.pathtracingEnabled}
          density="compact"
          layout="horizontal"
          onChange={(checked) =>
            commitSetting(actions, "Toggle path tracing", () =>
              actions.setPathtracingEnabled(checked)
            )
          }
      />
      <fieldset
        className="editor-controls-group"
        disabled={!settings.pathtracingEnabled}
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
          setValue={(value) => actions.setMaxRayDepth(value)}
        />
      <SelectField
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
      />
      <SelectField
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
      />
      <SelectField
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
      />
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
          setValue={(value) => actions.setMaxAccumulationFrames(value)}
        />
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
        setValue={(value) => actions.setFov(value)}
      />
      <CheckboxField
          label="Depth of field"
          checked={settings.enableDepthOfField}
          density="compact"
          layout="horizontal"
          onChange={(checked) =>
            commitSetting(actions, "Toggle depth of field", () =>
              actions.setDepthOfFieldEnabled(checked)
            )
          }
      />
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
          <span>{selection.kind === "sphere" ? "Sphere" : "Quad"} · Path traced</span>
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
          {selection.kind === "quad" && (
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
        <PersistentDetails className="editor-subpanel" storageKey="object-material">
          <summary>Material · {material.kind}</summary>
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
          {material.texture.type === "constant" && (
            <ColorField
              label="Color"
              value={material.color}
              onBegin={() => actions.beginMaterialEdit(material.id)}
              onChange={(value) =>
                actions.setMaterialColor(material.id, new THREE.Color(value))
              }
              onCommit={() => actions.commitMaterialEdit()}
            />
          )}
          {material.emissionStrength !== null && (
            <EditorNumberField
              label="Intensity"
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
              label="Two-sided"
              checked={material.emissionTwoSided}
              density="compact"
              layout="horizontal"
              onChange={(checked) =>
                actions.setMaterialEmissionTwoSided(material.id, checked)
              }
            />
          )}
          {material.roughness !== null && (
            <EditorNumberField
              label="Roughness"
              value={material.roughness}
              min={0}
              max={1}
              step={0.01}
              precisionStep={0.001}
              snapInterval={0.1}
              sensitivity={1 * pathTracerScrubSpeed}
              density="compact"
              layout="horizontal"
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
              label="IOR"
              value={material.ior}
              min={1}
              max={2.5}
              step={0.01}
              precisionStep={0.001}
              snapInterval={0.1}
              sensitivity={1 * pathTracerScrubSpeed}
              density="compact"
              layout="horizontal"
              onChange={(value) => {
                actions.beginMaterialEdit(material.id);
                actions.setMaterialIor(material.id, value);
              }}
              onCommit={() => actions.commitMaterialEdit()}
              onCancel={() => actions.cancelMaterialEdit()}
            />
          )}
        </PersistentDetails>
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
  renameFocusRequest,
}: {
  state: Readonly<PtState>;
  actions: PtActions;
  renameFocusRequest: number;
}) {
  const [collapsed, setCollapsed] = usePersistentBoolean("panel:object", false);
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
  const [collapsed, setCollapsed] = usePersistentBoolean("panel:render", false);
  const [size, setSize] = useState<PanelSize>(() =>
    clampPanelSize({ width: 260, height: 360 })
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
      style={collapsed ? undefined : { width: size.width, height: size.height }}
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
          <span className="editor-shell__scene">{state.sceneKey}</span>
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
