export type PresetPtSceneInfo = {
  purpose: string;
  implementation: string;
  concepts: string;
};

export const presetPtSceneInfo: Record<string, PresetPtSceneInfo> = {
  PrincipledMaterialStudy: {
    purpose: "Compares continuous metallic and roughness values under the same studio illumination.",
    implementation: "A grid of principled spheres varies metallic by row and roughness by column while keeping base color, geometry, camera, and HDR fixed.",
    concepts: "The metallic workflow blends dielectric and conductor responses. Roughness broadens the microfacet distribution, trading a sharp highlight for a wider, dimmer one.",
  },
  GlTFBoxStudy: {
    purpose: "The smallest smoke test for loading a static glTF mesh into both the Three.js preview and path tracer.",
    implementation: "Loads the Khronos Box GLB, extracts indexed triangle attributes, bakes its transforms, compiles its material, and inserts the triangles into GPU storage and the BVH.",
    concepts: "Triangle hits use barycentric coordinates to interpolate vertex attributes: a = w₀a₀ + w₁a₁ + w₂a₂, where w₀ + w₁ + w₂ = 1.",
  },
  GlTFSuzanneStudy: {
    purpose: "Tests a recognizable curved, indexed glTF mesh with interpolated normals and environment reflections.",
    implementation: "Imports Suzanne as a static triangle mesh, preserves its indexed geometry and material assignment, then traces it through the packed-triangle BVH path.",
    concepts: "Smooth shading interpolates vertex normals across each triangle while intersection still uses the triangle's geometric plane.",
  },
  DamagedHelmetStudy: {
    purpose: "Exercises a production-style glTF asset with base-color, metallic-roughness, normal, and emissive texture inputs.",
    implementation: "Imports the Khronos Damaged Helmet and maps glTF material factors and texture channels into the path tracer's principled material representation.",
    concepts: "glTF stores roughness in the green channel and metallic in blue; factors multiply sampled texture values before BSDF evaluation.",
  },
  GlTFSimpleMeshesStudy: {
    purpose: "Checks multiple glTF meshes and material groups in one lightweight imported scene.",
    implementation: "Extracts several static mesh primitives, retains their individual material indices, and combines them into one triangle/BVH compilation pass.",
    concepts: "A mesh is a collection of primitives; each primitive can reference a different material while sharing the same scene transform hierarchy.",
  },
  RTIOW1Simple: {
    purpose: "Preserves the early Ray Tracing in One Weekend material study: diffuse, dielectric, and fuzzy metal spheres.",
    implementation: "Analytic sphere intersections feed the original legacy scattering models, providing a stable baseline as the renderer architecture evolves.",
    concepts: "Diffuse rays sample a hemisphere, metals reflect with optional fuzz, and dielectrics choose reflection or refraction using total internal reflection and Schlick reflectance.",
  },
  RTIOW1Final: {
    purpose: "Preserves the randomized final scene from the first RTIOW book and tests many sphere/material combinations.",
    implementation: "Procedurally creates a field of diffuse, metal, and glass spheres plus three large reference spheres using the legacy material adapters.",
    concepts: "Monte Carlo path tracing estimates radiance by averaging many random light-transport paths; independent samples reduce noise roughly with 1 / √N.",
  },
  RTIOW1SphereBvhStudy: {
    purpose: "Stress-tests analytic-sphere acceleration with a reproducible full-scale RTIOW1-style random scene.",
    implementation: "A fixed seed creates hundreds of diffuse, metal, and dielectric spheres. Sphere records and their flattened BVH are packed into GPU textures, while a brute-force mode remains available for matched comparisons.",
    concepts: "The BVH first rejects ray–AABB regions, then performs the unchanged exact quadratic sphere test only for primitives in reached leaves. Both traversal modes should produce the same image.",
  },
  TextureStudy: {
    purpose: "Compares image, checker, and Perlin procedural textures on spheres, including reflection in a smooth metal reference.",
    implementation: "Texture descriptors are evaluated from sphere UVs or procedural coordinates and modulate the legacy material albedo before scattering.",
    concepts: "Spherical UV mapping converts surface direction to longitude and latitude; procedural textures derive color from position instead of an image lookup.",
  },
  QuadStudy: {
    purpose: "Validates bounded quad intersection, orientation, UV coordinates, transforms, and textured planar surfaces.",
    implementation: "Uses horizontal, upright, and slanted parallelograms so incorrect bounds, winding, or UV basis calculations are visually obvious.",
    concepts: "A quad is p = Q + αu + βv with 0 ≤ α, β ≤ 1; its normal is normalize(u × v).",
  },
  EmissiveStudy: {
    purpose: "Tests emissive sphere and quad geometry against diffuse, textured, and reflective objects in a black environment.",
    implementation: "Surface emission is authored independently from scattering, allowing visible emitters and area-light contribution from ordinary scene geometry.",
    concepts: "An emissive hit contributes Le directly. Explicit light sampling chooses a point on an emitter and converts its area PDF to solid angle.",
  },
  AnalyticLightsStudy: {
    purpose: "Separates the contributions of point, spot, and directional analytic lights and verifies light enable/disable controls.",
    implementation: "Three editable light nodes are compiled into packed analytic-light uniforms and sampled explicitly by Direct and MIS integrators.",
    concepts: "Point and ideal spot/directional lights are delta distributions: they occupy zero solid angle and therefore require explicit light sampling.",
  },
  EnvironmentStudy: {
    purpose: "Compares HDR environment visibility, illumination, rotation, rough reflection, and mirror reflection.",
    implementation: "Decodes an equirectangular HDR, constructs a luminance-weighted sampling distribution, and independently scales camera-visible and lighting radiance.",
    concepts: "Importance sampling favors bright texels while accounting for latitude with sin(θ), reducing variance without changing the expected radiance.",
  },
  TriangleStudy: {
    purpose: "Validates indexed triangle intersection, barycentric interpolation, materials, transforms, and selection on small hand-authored meshes.",
    implementation: "Two indexed pyramids are converted to packed triangles and traced alongside analytic geometry under an HDR environment.",
    concepts: "Möller–Trumbore solves ray/triangle intersection directly and returns barycentric coordinates for interpolating UVs and normals.",
  },
  PackedTrianglesStudy: {
    purpose: "Makes the cost and correctness difference between brute-force triangle tests and BVH traversal easy to observe.",
    implementation: "A 2,048-triangle indexed wave is packed into GPU textures with a flattened, independently built BVH and traversal metadata.",
    concepts: "Brute force is O(n) intersection work per ray; a useful BVH often approaches O(log n) node traversal plus a small number of leaf triangle tests.",
  },
  CornellBox: {
    purpose: "Provides a controlled reference scene for indirect illumination, colored light transport, area lights, and integrator comparisons.",
    implementation: "Quads form an enclosed room, two boxes, and a ceiling emitter so BSDF-only, direct-light, and MIS sampling can be compared under identical geometry.",
    concepts: "The ceiling light covers only a small solid angle from most surfaces. A BSDF-only path chooses a random scattering direction, so it rarely lands on that light and most samples contribute no direct illumination—producing extreme noise. Direct-light sampling deliberately chooses a point on the emitter and tests its visibility, so useful lighting samples become far more common. MIS combines light sampling with BSDF sampling using weights based on their PDFs, retaining paths each strategy handles well without double-counting them. The expected result is the same; Direct and MIS reduce variance dramatically.",
  },
};
