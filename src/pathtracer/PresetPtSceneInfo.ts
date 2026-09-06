export type PresetPtSceneInfo = {
  purpose: string;
  implementation: string;
  concepts: string;
};

export const presetPtSceneInfo: Record<string, PresetPtSceneInfo> = {
  TransmissionVolumeStudy: {
    purpose: "Compare thin-wall transmission, solid refraction, rough glass, index of refraction (IOR), and volume absorption.",
    implementation: "The top row varies surface and volume settings. The bottom row uses one absorbing material on increasingly large spheres to show how path length affects attenuation.",
    concepts: "Thin walls transmit without entering a medium. Solid boundaries refract and track nested media. Beer–Lambert transmittance is exponential: after one attenuation distance, white light becomes the authored attenuation color.",
  },
  KhronosCompareTransmission: {
    purpose: "Explore dielectric transmission and rough glass using Khronos's CompareTransmission asset.",
    implementation: "Imports the static GLB through the material translator and packed-triangle renderer. This is a visual study, not a glTF conformance test.",
    concepts: "KHR_materials_transmission uses the material's GGX roughness for both reflection and transmission; transmitted directions are therefore non-delta whenever roughness is nonzero.",
  },
  KhronosCompareVolume: {
    purpose: "Explore refraction and distance-dependent absorption using Khronos's CompareVolume asset.",
    implementation: "Loads the official CompareVolume GLB and maps transmission, thickness, attenuation color, and attenuation distance into nested-medium path state and Beer–Lambert transport.",
    concepts: "A nonzero thickness defines a volume. Refraction occurs at its boundaries and attenuation depends exponentially on the distance traveled inside it.",
  },
  KhronosDispersionTest: {
    purpose: "Explore wavelength-dependent refraction using Khronos's DispersionTest asset.",
    implementation: "Traces a randomly selected RGB channel with a channel-dependent IOR and compensates for its selection probability. This approximates dispersion; it is not full spectral rendering.",
    concepts: "Dispersion separates wavelengths because their indices of refraction differ. Khronos defines dispersion as 20 divided by the Abbe number and provides an RGB approximation around the material IOR.",
  },
  KhronosDragonDispersion: {
    purpose: "Explore transmission, absorption, IOR, and approximate dispersion on the Khronos dragon.",
    implementation: "Loads the official Khronos Dragon Dispersion GLB unchanged so its authored node scale, thickness map, attenuation distance, and cloth backdrop retain their intended relationship.",
    concepts: "Different IORs bend RGB paths differently. Look for displaced color edges in refracted details; visibility depends on surface shape, path length, and the background.",
  },
  KhronosDragonAttenuation: {
    purpose: "Compare absorption through thin and thick regions of the Khronos dragon against its checker-cloth backdrop.",
    implementation: "Loads the official Dragon Attenuation GLB unchanged and traces the true distance traveled inside its solid volume; the thickness texture establishes volume behavior while Beer–Lambert attenuation follows each path length.",
    concepts: "The same glass material appears lighter through thin regions and deeper yellow-orange through the body because transmittance decreases exponentially with distance inside the medium.",
  },
  PrincipledMaterialStudy: {
    purpose: "Compare metallic and roughness values under the same studio lighting.",
    implementation: "A grid of principled spheres varies metallic by row and roughness by column while keeping base color, geometry, camera, and HDR fixed.",
    concepts: "The metallic workflow blends dielectric and conductor responses. Roughness broadens the microfacet distribution, trading a sharp highlight for a wider, dimmer one.",
  },
  GlTFBoxStudy: {
    purpose: "Inspect a minimal static glTF import in both the raster preview and path tracer.",
    implementation: "Loads the Khronos Box GLB, extracts indexed triangle attributes, bakes its transforms, compiles its material, and inserts the triangles into GPU storage and the BVH.",
    concepts: "Triangle hits use barycentric coordinates to interpolate vertex attributes: a = w₀a₀ + w₁a₁ + w₂a₂, where w₀ + w₁ + w₂ = 1.",
  },
  GlTFSuzanneStudy: {
    purpose: "Inspect smooth mesh shading and HDR reflections on Suzanne.",
    implementation: "Imports Suzanne as a static triangle mesh, preserves its indexed geometry and material assignment, then traces it through the packed-triangle BVH path.",
    concepts: "Shading normals interpolate across triangles; intersections still use flat triangle geometry. Compare MIS with BSDF only: bright HDR sources can make BSDF-only renders much noisier.",
  },
  DamagedHelmetStudy: {
    purpose: "Inspect base-color, metallic-roughness, normal, and emissive textures on a detailed glTF asset.",
    implementation: "Imports the Khronos Damaged Helmet and maps glTF material factors and texture channels into the path tracer's principled material representation.",
    concepts: "glTF stores roughness in the green channel and metallic in blue; factors multiply sampled texture values before BSDF evaluation.",
  },
  GlTFSimpleMeshesStudy: {
    purpose: "Inspect multiple static glTF meshes and material groups in one lightweight scene.",
    implementation: "Extracts several static mesh primitives, retains their individual material indices, and combines them into one triangle/BVH compilation pass.",
    concepts: "A mesh is a collection of primitives; each primitive can reference a different material while sharing the same scene transform hierarchy.",
  },
  RTIOW1Simple: {
    purpose: "Compare diffuse, glass, and fuzzy-metal spheres from Ray Tracing in One Weekend (RTIOW).",
    implementation: "Analytic sphere intersections feed the original legacy scattering models, providing a stable baseline as the renderer architecture evolves.",
    concepts: "Diffuse rays sample a hemisphere, metals reflect with optional fuzz, and dielectrics choose reflection or refraction using total internal reflection and Schlick reflectance.",
  },
  RTIOW1HollowGlassStudy: {
    purpose: "Compares a solid glass sphere with a hollow glass shell using the dielectric construction from Ray Tracing in One Weekend.",
    implementation: "The solid sphere has one boundary surface, crossed on entry and exit. The hollow shell adds an inner sphere with relative IOR air/glass to represent the cavity.",
    concepts: "A hollow dielectric is a geometry-and-medium problem, not only a surface setting: rays refract at the outer glass boundary, enter the air cavity, re-enter glass, and finally return to the surrounding air.",
  },
  RTIOW1Final: {
    purpose: "Explore many diffuse, metal, and glass objects in an RTIOW-style sphere field.",
    implementation: "Procedurally creates a field of diffuse, metal, and glass spheres plus three large reference spheres using the legacy material adapters.",
    concepts: "Path tracing averages sampled light paths. For independent samples with finite variance, noise decreases roughly as 1 / √N: halving it takes about four times as many samples.",
  },
  RTIOW1SphereBvhStudy: {
    purpose: "Compare BVH and brute-force intersection work in a reproducible field of hundreds of spheres.",
    implementation: "A fixed seed creates hundreds of diffuse, metal, and dielectric spheres. Sphere records and their flattened BVH are packed into GPU textures, while a brute-force mode remains available for matched comparisons.",
    concepts: "A bounding volume hierarchy (BVH) rejects groups with axis-aligned bounding-box tests, then tests spheres in reached leaves. Both traversal modes should converge to the same image.",
  },
  TextureStudy: {
    purpose: "Compares image, checker, and Perlin procedural textures on spheres, including reflection in a smooth metal reference.",
    implementation: "Texture descriptors are evaluated from sphere UVs or procedural coordinates and modulate the legacy material albedo before scattering.",
    concepts: "Spherical UV mapping converts surface direction to longitude and latitude; procedural textures derive color from position instead of an image lookup.",
  },
  QuadStudy: {
    purpose: "Inspect quad orientation, UV coordinates, transforms, and textured planar surfaces.",
    implementation: "Uses horizontal, upright, and slanted parallelograms so incorrect bounds, winding, or UV basis calculations are visually obvious.",
    concepts: "A quad is p = Q + αu + βv with 0 ≤ α, β ≤ 1; its normal is normalize(u × v).",
  },
  EmissiveStudy: {
    purpose: "Explore colored emission, soft shadows, and reflections around an orange teapot and metal sphere.",
    implementation: "Surface emission is authored independently from scattering, allowing visible emitters and area-light contribution from ordinary scene geometry.",
    concepts: "Emissive surfaces contribute radiance when a path hits them. Explicit light sampling also connects surface hits to sampled emitters. Move the comparison divider to inspect reflected objects and indirect light missing from the raster preview.",
  },
  AnalyticLightsStudy: {
    purpose: "Compare point, spot, and directional lights by editing or disabling them individually.",
    implementation: "Three editable light nodes are compiled into packed analytic-light uniforms and sampled explicitly by Direct and MIS integrators.",
    concepts: "From a surface point, an ideal analytic light is sampled in a specific direction. Random BSDF directions cannot hit it; use Direct or MIS to include these lights.",
  },
  EnvironmentStudy: {
    purpose: "Separate HDR background visibility from illumination, and compare rough and mirror reflections.",
    implementation: "Decodes an equirectangular HDR, constructs a luminance-weighted sampling distribution, and independently scales camera-visible and lighting radiance.",
    concepts: "Importance sampling favors bright texels while accounting for latitude with sin(θ), reducing variance without changing the expected radiance.",
  },
  TriangleStudy: {
    purpose: "Inspect indexed triangles, interpolated attributes, materials, and transforms on small meshes.",
    implementation: "Two indexed pyramids are converted to packed triangles and traced alongside analytic geometry under an HDR environment.",
    concepts: "Möller–Trumbore solves ray/triangle intersection directly and returns barycentric coordinates for interpolating UVs and normals.",
  },
  PackedTrianglesStudy: {
    purpose: "Compare intersection work between brute force and BVH traversal on a 2,048-triangle wave.",
    implementation: "A 2,048-triangle indexed wave is packed into GPU textures with a flattened, independently built BVH and traversal metadata.",
    concepts: "Brute force tests every triangle. A BVH skips groups whose bounds the ray misses; savings depend on overlap and ray direction, not just triangle count. Use MIS to reduce HDR sampling noise while comparing traversal modes.",
  },
  CornellBox: {
    purpose: "Compare indirect illumination, color bleeding, and area-light sampling in a Cornell-style box.",
    implementation: "An open-front room contains two boxes, a teapot, and a ceiling emitter, with a black environment. Keep the view and sample budget fixed when comparing integrators.",
    concepts: "BSDF-only paths rarely hit the small ceiling light, producing high variance. Direct sampling deliberately samples emitters and tests visibility. MIS combines light and BSDF samples with probability-based weights. Look for reduced noise and red/green light reflected onto nearby surfaces.",
  },
};
