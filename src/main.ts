import PtApp from "./pathtracer/PtApp";

const canvas = document.createElement("canvas");
canvas.classList.add("webgl");
document.querySelector("#app")?.appendChild(canvas);

new PtApp(canvas);
