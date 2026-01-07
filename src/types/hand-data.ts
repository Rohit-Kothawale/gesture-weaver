export interface HandFrame {
  label: string;
  leftHand: [number, number, number][];
  rightHand: [number, number, number][];
}

export interface RawCSVRow {
  label: string;
  [key: string]: string | number;
}

// MediaPipe hand connections
export const HAND_CONNECTIONS: [number, number][] = [
  // Wrist to thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Wrist to index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Wrist to middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Wrist to ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Wrist to pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm connections
  [5, 9], [9, 13], [13, 17]
];

export const parseCSVRow = (row: RawCSVRow): HandFrame => {
  const leftHand: [number, number, number][] = [];
  const rightHand: [number, number, number][] = [];

  for (let i = 0; i < 21; i++) {
    const lx = Number(row[`L_x${i}`]) || 0;
    const ly = Number(row[`L_y${i}`]) || 0;
    const lz = Number(row[`L_z${i}`]) || 0;
    leftHand.push([lx, ly, lz]);

    const rx = Number(row[`R_x${i}`]) || 0;
    const ry = Number(row[`R_y${i}`]) || 0;
    const rz = Number(row[`R_z${i}`]) || 0;
    rightHand.push([rx, ry, rz]);
  }

  return {
    label: String(row.label),
    leftHand,
    rightHand,
  };
};

export const isHandVisible = (landmarks: [number, number, number][]): boolean => {
  return landmarks.some(([x, y, z]) => x !== 0 || y !== 0 || z !== 0);
};

export const normalizeCoordinates = (
  landmarks: [number, number, number][],
  scale: number = 2
): [number, number, number][] => {
  return landmarks.map(([x, y, z]) => [
    (x - 0.5) * scale,
    -(y - 0.5) * scale, // Flip Y axis
    (z - 0.5) * scale,
  ]);
};
