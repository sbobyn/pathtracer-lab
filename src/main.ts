import PtApp from "./pathtracer/PtApp";

const canvas = document.createElement("canvas");
canvas.classList.add("webgl");
document.querySelector("#app")?.appendChild(canvas);

const app = new PtApp(canvas);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.dispose();
    canvas.remove();
  });
}
