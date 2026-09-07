import { useEffect, useState } from "react";
import type PtActions from "./PtActions";
import { createSceneLink } from "./SceneLinks";
import { getAssetTransfer } from "./AssetLoadProgress";

export function SceneLink({ sceneKey }: { sceneKey: string }) {
  const [message, setMessage] = useState("");
  useEffect(() => setMessage(""), [sceneKey]);
  const link = createSceneLink(window.location.href, sceneKey);
  return <div className="scene-link">
    <button className="editor-action-button" type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(link); setMessage("Preset link copied; scene edits are not included."); }
      catch { setMessage("Copy the preset link below; scene edits are not included."); }
    }}>Copy preset link</button>
    {message && <><span role="status">{message}</span><input aria-label="Preset link" readOnly value={link} onFocus={event => event.target.select()} /></>}
  </div>;
}

export function FirstUseHint() {
  const [visible, setVisible] = useState(() => {
    try { return localStorage.getItem("pathtracer.controls-hint-dismissed") !== "true"; }
    catch { return true; }
  });
  if (!visible) return null;
  return <aside className="first-use-hint" aria-label="Viewport controls">
    <span>Drag to orbit · Move the comparison divider · Open Camera Rays</span>
    <button type="button" aria-label="Dismiss controls hint" onClick={() => {
      setVisible(false);
      try { localStorage.setItem("pathtracer.controls-hint-dismissed", "true"); } catch { /* Optional persistence. */ }
    }}>×</button>
  </aside>;
}

export function AssetLoadStatus({ actions, sceneKey, environmentSource }: {
  actions: PtActions; sceneKey: string; environmentSource: string;
}) {
  const [status, setStatus] = useState<Record<string, "loading" | "failed">>({});
  const [, refresh] = useState(0);
  const loading = Object.values(status).includes("loading");
  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => refresh(value => value + 1), 150);
    return () => window.clearInterval(timer);
  }, [loading]);
  const loads = actions.getSceneAssetLoads();
  useEffect(() => {
    let current = true;
    setStatus(Object.fromEntries(Object.entries(loads).filter(([, promise]) => promise).map(([key]) => [key, "loading"])));
    for (const [key, promise] of Object.entries(loads)) {
      promise?.then(() => {
        if (current) setStatus(previous => { const next = { ...previous }; delete next[key]; return next; });
      }, () => {
        if (current) setStatus(previous => ({ ...previous, [key]: "failed" }));
      });
    }
    return () => { current = false; };
  }, [actions, sceneKey, environmentSource, loads.environment, loads.model]);
  const entries = Object.entries(status);
  if (!entries.length) return null;
  const failed = entries.some(([, value]) => value === "failed");
  return <aside className="asset-load-status" role={failed ? "alert" : "status"}>
    {entries.map(([key, value]) => {
      const label = key === "model" ? "glTF model" : "HDR environment";
      const transfer = getAssetTransfer(key === "model" ? loads.model : loads.environment);
      const percent = transfer?.percent;
      const processing = percent === 100;
      const detail = value === "failed" ? "Failed to load"
        : processing ? "Preparing scene…"
        : percent !== undefined ? `Downloading · ${percent}%`
        : transfer?.loaded ? `Downloading · ${(transfer.loaded / 1048576).toFixed(1)} MB` : "Loading…";
      return <div className="asset-load-status__item" key={key}>
        <div className="asset-load-status__label"><strong>{label}</strong><span aria-live="off">{detail}</span></div>
        {value !== "failed" && <progress aria-label={`${label} loading`} max={100}
          value={processing ? undefined : percent} />}
      </div>;
    })}
    {failed && <><p>Check your connection, then reload the preset. This discards scene edits and uploaded assets.</p>
      <button className="editor-action-button" type="button" onClick={() => {
        if (window.confirm("Reload this preset? Unsaved scene edits and uploaded assets will be discarded.")) actions.setScene(sceneKey);
      }}>Reload preset</button></>}
  </aside>;
}
