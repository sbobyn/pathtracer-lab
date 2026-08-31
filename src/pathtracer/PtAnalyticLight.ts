import * as THREE from "three";
import { configureRasterLightShadow } from "./RasterPreviewQuality";

export type PtAnalyticLightType = "point" | "directional" | "spot";

export interface PtAnalyticLightMetadata {
  objectId: string;
  objectName: string;
  primitiveType: "analyticLight";
  lightType: PtAnalyticLightType;
  enabled: boolean;
  color: THREE.Color;
  intensity: number;
  angularDiameter: number;
  innerConeAngle: number;
  outerConeAngle: number;
}

export type PtAnalyticLightNode = THREE.Group & {
  userData: { pathTracer: PtAnalyticLightMetadata };
};

export function createPointLightNode(
  position: THREE.Vector3,
  objectName: string
): PtAnalyticLightNode {
  return createAnalyticLightNode("point", position, objectName);
}

export function createDirectionalLightNode(
  position: THREE.Vector3,
  objectName: string
) {
  return createAnalyticLightNode("directional", position, objectName);
}

export function createSpotLightNode(
  position: THREE.Vector3,
  objectName: string
) {
  return createAnalyticLightNode("spot", position, objectName);
}

function createAnalyticLightNode(
  lightType: PtAnalyticLightType,
  position: THREE.Vector3,
  objectName: string
): PtAnalyticLightNode {
  const node = new THREE.Group() as PtAnalyticLightNode;
  node.position.copy(position);
  node.userData.pathTracer = {
    objectId: THREE.MathUtils.generateUUID(),
    objectName,
    primitiveType: "analyticLight",
    lightType,
    enabled: true,
    color: new THREE.Color(1, 0.82, 0.62),
    intensity: lightType === "directional" ? 1 : lightType === "spot" ? 20 : 8,
    angularDiameter: 0,
    innerConeAngle: 25,
    outerConeAngle: 35,
  };

  const target = new THREE.Object3D();
  target.position.set(0, 0, -1);
  node.add(target);
  const previewLight = lightType === "directional"
    ? new THREE.DirectionalLight(node.userData.pathTracer.color, node.userData.pathTracer.intensity)
    : lightType === "spot"
      ? new THREE.SpotLight(node.userData.pathTracer.color, node.userData.pathTracer.intensity, 0, THREE.MathUtils.degToRad(35), 0.3, 2)
      : new THREE.PointLight(node.userData.pathTracer.color, node.userData.pathTracer.intensity, 0, 2);
  if (previewLight instanceof THREE.DirectionalLight || previewLight instanceof THREE.SpotLight) {
    previewLight.target = target;
  }
  configureRasterLightShadow(previewLight);
  previewLight.userData.pathTracerLightPreview = true;
  node.add(previewLight);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 8),
    new THREE.MeshBasicMaterial({
      color: node.userData.pathTracer.color,
      wireframe: true,
      toneMapped: false,
    })
  );
  marker.userData.pathTracerLightMarker = true;
  node.add(marker);
  if (lightType !== "point") {
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(),
      0.75,
      node.userData.pathTracer.color
    );
    arrow.userData.pathTracerLightMarker = true;
    node.add(arrow);
  }
  if (lightType === "spot") {
    const coneGeometry = new THREE.ConeGeometry(1, 1, 24, 1, true);
    coneGeometry.translate(0, -0.5, 0);
    coneGeometry.rotateX(Math.PI / 2);
    const cone = new THREE.Mesh(
      coneGeometry,
      new THREE.MeshBasicMaterial({
        color: node.userData.pathTracer.color,
        wireframe: true,
        transparent: true,
        opacity: 0.65,
        toneMapped: false,
      })
    );
    cone.userData.pathTracerSpotCone = true;
    node.add(cone);
  }
  syncAnalyticLightPreview(node);
  return node;
}

export function syncAnalyticLightPreview(node: PtAnalyticLightNode) {
  const metadata = node.userData.pathTracer;
  const preview = node.children.find(
    (child): child is THREE.Light => child instanceof THREE.Light
  );
  if (preview) {
    preview.color.copy(metadata.color);
    preview.intensity = metadata.enabled ? metadata.intensity : 0;
    if (preview instanceof THREE.SpotLight) {
      preview.angle = THREE.MathUtils.degToRad(metadata.outerConeAngle);
      preview.penumbra = metadata.outerConeAngle <= 0
        ? 0
        : 1 - metadata.innerConeAngle / metadata.outerConeAngle;
    }
  }
  const marker = node.children.find(
    (child): child is THREE.Mesh => child instanceof THREE.Mesh
  );
  if (marker?.material instanceof THREE.MeshBasicMaterial) {
    marker.material.color.copy(metadata.color);
    marker.visible = metadata.enabled;
  }
  const arrow = node.children.find((child) => child instanceof THREE.ArrowHelper);
  arrow?.setColor(metadata.color);
  if (arrow) arrow.visible = metadata.enabled;
  const cone = node.children.find(
    (child): child is THREE.Mesh => child.userData.pathTracerSpotCone === true
  );
  if (cone) {
    const length = 0.75;
    const radius = Math.tan(THREE.MathUtils.degToRad(metadata.outerConeAngle)) * length;
    cone.scale.set(radius, radius, length);
    cone.visible = metadata.enabled;
    if (cone.material instanceof THREE.MeshBasicMaterial) {
      cone.material.color.copy(metadata.color);
    }
  }
}

export function isPtAnalyticLightNode(
  object: THREE.Object3D
): object is PtAnalyticLightNode {
  return object.userData.pathTracer?.primitiveType === "analyticLight";
}

export function analyticLightNodeFromObject(
  object: THREE.Object3D | null
): PtAnalyticLightNode | null {
  let candidate = object;
  while (candidate) {
    if (isPtAnalyticLightNode(candidate)) return candidate;
    candidate = candidate.parent;
  }
  return null;
}
