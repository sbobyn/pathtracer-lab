import studioSmall03 from "../assets/studio_small_03_2k.hdr?url";
import meadow from "../assets/meadow_2k.hdr?url";
import belfastSunsetPureSky from "../assets/belfast_sunset_puresky_2k.hdr?url";
import relaxInnSeaviewSuite from "../assets/relax_inn_seaview_suite_4k.hdr?url";

export interface BuiltinEnvironment {
  readonly id: string;
  readonly label: string;
  readonly source: string;
}

export const builtinEnvironments: readonly BuiltinEnvironment[] = [
  { id: "studio-small-03", label: "Studio Small 03", source: studioSmall03 },
  { id: "meadow", label: "Meadow", source: meadow },
  { id: "belfast-sunset-pure-sky", label: "Belfast Sunset Sky", source: belfastSunsetPureSky },
  { id: "relax-inn-seaview-suite", label: "Relax Inn Seaview Suite", source: relaxInnSeaviewSuite },
];

export function findBuiltinEnvironment(source: string) {
  return builtinEnvironments.find((environment) => environment.source === source) ?? null;
}
