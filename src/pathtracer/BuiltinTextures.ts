import earthBlueMarble from "../assets/earth-blue-marble.jpg?url";
import textureGrid from "../assets/texture-grid.svg?url";
import textureStudy from "../assets/texture-study.svg?url";

export interface BuiltinTexture {
  readonly id: string;
  readonly label: string;
  readonly source: string;
}

export const builtinTextures: readonly BuiltinTexture[] = [
  { id: "uv-orientation", label: "UV orientation", source: textureStudy },
  { id: "earth-blue-marble", label: "Earth", source: earthBlueMarble },
  { id: "grid", label: "Grid", source: textureGrid },
];

export function findBuiltinTexture(source: string) {
  return builtinTextures.find((texture) => texture.source === source) ?? null;
}
