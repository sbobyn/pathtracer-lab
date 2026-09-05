import type PtApp from "./pathtracer/PtApp";
import "@nybobs/editor-ui/styles.css";

const canvas = document.createElement("canvas");
canvas.classList.add("webgl");
document.querySelector("#app")?.appendChild(canvas);

const editorRoot = document.createElement("div");
editorRoot.id = "editor-root";
editorRoot.classList.add("eui-theme--dark", "eui-theme--canvas-compact");
document.querySelector("#app")?.appendChild(editorRoot);

let app: PtApp | undefined;
let stopped = false;
const status = document.createElement("section");
status.className = "startup-status";
status.setAttribute("role", "status");
status.textContent = "Loading Pathtracer Lab…";
document.body.appendChild(status);

function showFailure(title: string, message: string) {
  stopped = true;
  status.replaceChildren();
  status.hidden = false;
  status.setAttribute("role", "alert");
  const heading = document.createElement("h1");
  heading.textContent = title;
  const description = document.createElement("p");
  description.textContent = message;
  const reload = document.createElement("button");
  reload.type = "button";
  reload.textContent = "Reload";
  reload.addEventListener("click", () => window.location.reload());
  status.append(heading, description, reload);
  reload.focus();
}

function disposeAfterFailure() {
  // Let the current render/event finish before releasing its resources.
  queueMicrotask(() => {
    try { app?.dispose(); } catch (error) { console.error("GPU cleanup failed", error); }
    app = undefined;
  });
}
const handleContextLost = (event: Event) => {
  event.preventDefault();
  if (stopped) return;
  showFailure("The graphics connection was lost", "The browser stopped the GPU session. Close other graphics-heavy tabs, then reload to restart. Unsaved scene edits will be lost when you reload.");
  disposeAfterFailure();
};
const handleShaderError = () => {
  if (stopped) return;
  showFailure("A rendering shader couldn’t run", "Try reloading or using another browser or device. If it keeps happening, report the scene and browser with the shader error from the developer console. Reloading will discard unsaved scene edits.");
  disposeAfterFailure();
};
canvas.addEventListener("webglcontextlost", handleContextLost);
canvas.addEventListener("pathtracer-shader-error", handleShaderError);

async function start() {
  try {
    if (!canvas.getContext("webgl2")) {
      showFailure("WebGL2 is unavailable", "Pathtracer Lab needs WebGL2. Try a current browser with hardware acceleration enabled, or another device.");
      return;
    }
    const [{ default: PtApp }, { default: ReactEditorUi }] = await Promise.all([
      import("./pathtracer/PtApp"),
      import("./pathtracer/ReactEditorUi"),
    ]);
    if (stopped) return;
    app = new PtApp(canvas, (actions) => new ReactEditorUi(editorRoot, actions));
    if (!stopped) status.hidden = true;
  } catch (error) {
    console.error("Pathtracer Lab startup failed", error);
    if (!stopped) showFailure("Pathtracer Lab couldn’t start", "Check your connection and reload. If the problem persists, try another browser or device. Technical details are available in the browser console.");
  }
}
void start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopped = true;
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    canvas.removeEventListener("pathtracer-shader-error", handleShaderError);
    app?.dispose();
    canvas.remove();
    editorRoot.remove();
    status.remove();
  });
}
