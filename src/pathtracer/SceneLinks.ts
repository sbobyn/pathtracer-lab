export function sceneFromSearch(search: string, sceneKeys: readonly string[]): string | null {
  const scene = new URLSearchParams(search).get("scene");
  return scene !== null && sceneKeys.includes(scene) ? scene : null;
}

/** Preset links intentionally exclude local edits, assets and unrelated URL parameters. */
export function createSceneLink(currentUrl: string, sceneKey: string): string {
  const url = new URL(currentUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("scene", sceneKey);
  return url.href;
}
