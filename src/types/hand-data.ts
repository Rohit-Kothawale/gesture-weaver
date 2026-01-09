export interface ArmLandmarks {
  shoulder: [number, number, number];
  elbow: [number, number, number];
  wrist: [number, number, number];
}

export interface HandFrame {
  label: string;
  leftHand: [number, number, number][];
  rightHand: [number, number, number][];
  leftArm?: ArmLandmarks;
  rightArm?: ArmLandmarks;
}

export interface RawCSVRow {
  label: string;
  [key: string]: string | number;
}

// MediaPipe hand connections
// export const HAND_CONNECTIONS: [number, number][] = [
//   // Wrist to thumb
//   [0, 1], [1, 2], [2, 3], [3, 4],
//   // Wrist to index
//   [0, 5], [5, 6], [6, 7], [7, 8],
//   // Wrist to middle
//   [0, 9], [9, 10], [10, 11], [11, 12],
//   // Wrist to ring
//   [0, 13], [13, 14], [14, 15], [15, 16],
//   // Wrist to pinky
//   [0, 17], [17, 18], [18, 19], [19, 20],
//   // Palm connections
//   [5, 9], [9, 13], [13, 17]
// ];

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

  // Parse arm landmarks if present
  let leftArm: ArmLandmarks | undefined;
  let rightArm: ArmLandmarks | undefined;

  // Check for left arm data
  if (row['LA_shoulder_x'] !== undefined) {
    leftArm = {
      shoulder: [Number(row['LA_shoulder_x']) || 0, Number(row['LA_shoulder_y']) || 0, Number(row['LA_shoulder_z']) || 0],
      elbow: [Number(row['LA_elbow_x']) || 0, Number(row['LA_elbow_y']) || 0, Number(row['LA_elbow_z']) || 0],
      wrist: [Number(row['LA_wrist_x']) || 0, Number(row['LA_wrist_y']) || 0, Number(row['LA_wrist_z']) || 0],
    };
  }

  // Check for right arm data
  if (row['RA_shoulder_x'] !== undefined) {
    rightArm = {
      shoulder: [Number(row['RA_shoulder_x']) || 0, Number(row['RA_shoulder_y']) || 0, Number(row['RA_shoulder_z']) || 0],
      elbow: [Number(row['RA_elbow_x']) || 0, Number(row['RA_elbow_y']) || 0, Number(row['RA_elbow_z']) || 0],
      wrist: [Number(row['RA_wrist_x']) || 0, Number(row['RA_wrist_y']) || 0, Number(row['RA_wrist_z']) || 0],
    };
  }

  return {
    label: String(row.label),
    leftHand,
    rightHand,
    leftArm,
    rightArm,
  };
};

// export const isHandVisible = (landmarks: [number, number, number][]): boolean => {
//   return landmarks.some(([x, y, z]) => x !== 0 || y !== 0 || z !== 0);
// };

// export const normalizeCoordinates = (
//   landmarks: [number, number, number][],
//   scale: number = 2
// ): [number, number, number][] => {
//   return landmarks.map(([x, y, z]) => [
//     (x - 0.5) * scale,
//     -(y - 0.5) * scale, // Flip Y axis
//     (z - 0.5) * scale,
//   ]);
// };

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4], // Thumb
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8], // Index
  [9, 10],
  [10, 11],
  [11, 12], // Middle
  [13, 14],
  [14, 15],
  [15, 16], // Ring
  [17, 18],
  [18, 19],
  [19, 20], // Pinky
  [0, 5],
  [5, 9],
  [9, 13],
  [13, 17],
  [0, 17], // Palm
];

export const normalizeCoordinates = (landmarks: [number, number, number][], scale = 3): [number, number, number][] => {
  if (!landmarks || landmarks.length === 0) return [];

  return landmarks.map((point) => [
    // X: Already mirrored in CameraCapture, just center it
    (point[0] - 0.5) * scale,

    // Y: Flip so Up is Up
    (1 - point[1] - 0.5) * scale,

    // Z: Depth (negative for Three.js depth)
    -point[2] * scale,
  ]);
};

export const isHandVisible = (landmarks: [number, number, number][] | null): boolean => {
  if (!landmarks || landmarks.length === 0) return false;
  // Ignore frames where the hand is just 0,0,0
  return landmarks.some((p) => p[0] !== 0 || p[1] !== 0);
};
