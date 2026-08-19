/** Ordered from the cheapest consequence to a complete scene replacement. */
export enum PtInvalidationLevel {
  Camera = 0,
  Settings = 1,
  Material = 2,
  Geometry = 3,
  Acceleration = 4,
  Scene = 5,
}

export interface PtInvalidationEvent {
  sequence: number;
  level: PtInvalidationLevel;
  reason: string;
}
