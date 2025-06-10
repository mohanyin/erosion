export const Tools = {
  Pencil: 0,
  Pen: 1,
  Marker: 2,
  Brush: 3,
  Water: 4,
  WindErosion: 5,
} as const;

export type Tool = (typeof Tools)[keyof typeof Tools];
