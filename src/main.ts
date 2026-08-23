import PtApp from "./pathtracer/PtApp";
import ReactEditorUi from "./pathtracer/ReactEditorUi";
import "@nybobs/editor-ui/styles.css";

const canvas = document.createElement("canvas");
canvas.classList.add("webgl");
document.querySelector("#app")?.appendChild(canvas);

const editorRoot = document.createElement("div");
editorRoot.id = "editor-root";
editorRoot.classList.add("eui-theme--dark", "eui-theme--canvas-compact");
document.querySelector("#app")?.appendChild(editorRoot);

const app = new PtApp(canvas, (actions) => new ReactEditorUi(editorRoot, actions));

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.dispose();
    canvas.remove();
  });
}
