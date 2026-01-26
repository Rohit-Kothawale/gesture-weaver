import * as THREE from 'three';
import { HandFrame, isHandVisible } from '@/types/hand-data';

// Finger landmark indices from MediaPipe
const FINGER_LANDMARKS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

// Bone names that match the mixamo-avatar.glb structure (Mixamo standard naming)
const BONE_NAMES = {
  left: {
    shoulder: 'mixamorigLeftShoulder',
    arm: 'mixamorigLeftArm',
    foreArm: 'mixamorigLeftForeArm',
    hand: 'mixamorigLeftHand',
    fingers: {
      thumb: ['mixamorigLeftHandThumb1', 'mixamorigLeftHandThumb2', 'mixamorigLeftHandThumb3'],
      index: ['mixamorigLeftHandIndex1', 'mixamorigLeftHandIndex2', 'mixamorigLeftHandIndex3'],
      middle: ['mixamorigLeftHandMiddle1', 'mixamorigLeftHandMiddle2', 'mixamorigLeftHandMiddle3'],
      ring: ['mixamorigLeftHandRing1', 'mixamorigLeftHandRing2', 'mixamorigLeftHandRing3'],
      pinky: ['mixamorigLeftHandPinky1', 'mixamorigLeftHandPinky2', 'mixamorigLeftHandPinky3'],
    },
  },
  right: {
    shoulder: 'mixamorigRightShoulder',
    arm: 'mixamorigRightArm',
    foreArm: 'mixamorigRightForeArm',
    hand: 'mixamorigRightHand',
    fingers: {
      thumb: ['mixamorigRightHandThumb1', 'mixamorigRightHandThumb2', 'mixamorigRightHandThumb3'],
      index: ['mixamorigRightHandIndex1', 'mixamorigRightHandIndex2', 'mixamorigRightHandIndex3'],
      middle: ['mixamorigRightHandMiddle1', 'mixamorigRightHandMiddle2', 'mixamorigRightHandMiddle3'],
      ring: ['mixamorigRightHandRing1', 'mixamorigRightHandRing2', 'mixamorigRightHandRing3'],
      pinky: ['mixamorigRightHandPinky1', 'mixamorigRightHandPinky2', 'mixamorigRightHandPinky3'],
    },
  },
};

// Avatar configuration
const AVATAR_CONFIG = {
  shoulderWidth: 0.18,
  shoulderHeight: 0.35,
  upperArmLength: 0.28,
  forearmLength: 0.25,
  handReachScale: 1.2,
};

// Interface for bone rotation data
interface BoneRotation {
  x: number;
  y: number;
  z: number;
  order?: string;
}

interface FingerRotations {
  proximal: BoneRotation;
  intermediate: BoneRotation;
  distal: BoneRotation;
}

interface HandRotations {
  thumb: FingerRotations;
  index: FingerRotations;
  middle: FingerRotations;
  ring: FingerRotations;
  pinky: FingerRotations;
}

interface ArmRotations {
  shoulder: BoneRotation;
  upperArm: BoneRotation;
  foreArm: BoneRotation;
  hand: BoneRotation;
  fingers: HandRotations;
}

// Raw MediaPipe landmark data for direct mapping
interface RawLandmarkData {
  landmarks: [number, number, number][]; // 21 landmarks (0-20)
  wrist: [number, number, number];
  // Direct 3D position in avatar space
  avatarSpaceWrist: { x: number; y: number; z: number };
}

export interface AvatarPoseFrame {
  frameIndex: number;
  label: string;
  timestamp: number;
  // Calculated bone rotations (for IK-based animation)
  leftArm: ArmRotations | null;
  rightArm: ArmRotations | null;
  // Raw MediaPipe data (for direct coordinate mapping)
  rawData: {
    leftHand: RawLandmarkData | null;
    rightHand: RawLandmarkData | null;
  };
}

export interface AvatarAnimationJSON {
  version: string;
  modelName: string;
  fps: number;
  totalFrames: number;
  boneNames: typeof BONE_NAMES;
  // Coordinate system description for direct mapping
  coordinateSystem: {
    mediapipe: {
      description: string;
      xRange: string;
      yRange: string;
      zRange: string;
    };
    avatarSpace: {
      description: string;
      xRange: string;
      yRange: string;
      zRange: string;
      shoulderWidth: number;
      shoulderHeight: number;
      armLength: number;
    };
  };
  frames: AvatarPoseFrame[];
}

// Normalize landmarks for consistent coordinate system
const normalizeLandmarksFor3D = (
  landmarks: [number, number, number][],
  scale: number = 1
): [number, number, number][] => {
  if (!landmarks || landmarks.length === 0) return [];
  return landmarks.map((point) => [
    (1 - point[0] - 0.5) * scale,
    (1 - point[1] - 0.5) * scale,
    -point[2] * scale,
  ]);
};

// Calculate finger curl angle from landmarks
const calculateFingerCurl = (
  landmarks: [number, number, number][],
  fingerName: keyof typeof FINGER_LANDMARKS,
  isThumb: boolean = false
): { proximal: number; intermediate: number; distal: number } => {
  const indices = FINGER_LANDMARKS[fingerName];
  
  const p0 = new THREE.Vector3(...landmarks[indices[0]]);
  const p1 = new THREE.Vector3(...landmarks[indices[1]]);
  const p2 = new THREE.Vector3(...landmarks[indices[2]]);
  const p3 = new THREE.Vector3(...landmarks[indices[3]]);
  
  const v1 = new THREE.Vector3().subVectors(p1, p0).normalize();
  const v2 = new THREE.Vector3().subVectors(p2, p1).normalize();
  const v3 = new THREE.Vector3().subVectors(p3, p2).normalize();
  
  const wrist = new THREE.Vector3(...landmarks[0]);
  const middleMCP = new THREE.Vector3(...landmarks[9]);
  const palmDirection = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
  
  const angle1 = Math.acos(THREE.MathUtils.clamp(v1.dot(v2), -1, 1));
  const angle2 = Math.acos(THREE.MathUtils.clamp(v2.dot(v3), -1, 1));
  const proximalAngle = Math.acos(THREE.MathUtils.clamp(palmDirection.dot(v1), -1, 1));
  
  const curlScale = isThumb ? 1.0 : 1.2;
  
  return {
    proximal: proximalAngle * curlScale * 0.6,
    intermediate: (Math.PI - angle1) * curlScale,
    distal: (Math.PI - angle2) * curlScale * 0.8,
  };
};

// Calculate thumb abduction
const calculateThumbAbduction = (
  landmarks: [number, number, number][],
  isLeftHand: boolean
): number => {
  const wrist = new THREE.Vector3(...landmarks[0]);
  const thumbCMC = new THREE.Vector3(...landmarks[1]);
  const thumbMCP = new THREE.Vector3(...landmarks[2]);
  const indexMCP = new THREE.Vector3(...landmarks[5]);
  const pinkyMCP = new THREE.Vector3(...landmarks[17]);
  const middleMCP = new THREE.Vector3(...landmarks[9]);
  
  const palmForward = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
  const palmSide = new THREE.Vector3().subVectors(indexMCP, pinkyMCP).normalize();
  const palmNormal = new THREE.Vector3().crossVectors(palmForward, palmSide).normalize();
  
  const thumbDirection = new THREE.Vector3().subVectors(thumbMCP, thumbCMC).normalize();
  const thumbOnPalm = thumbDirection.clone().projectOnPlane(palmNormal);
  const palmReference = new THREE.Vector3().subVectors(indexMCP, wrist).normalize();
  
  const abductionAmount = thumbDirection.dot(palmNormal);
  const spreadAngle = Math.acos(THREE.MathUtils.clamp(thumbOnPalm.dot(palmReference), -1, 1));
  
  const abduction = abductionAmount * 1.5 + (spreadAngle - Math.PI * 0.3) * 0.5;
  
  return abduction * (isLeftHand ? 1 : -1);
};

// Calculate finger spread
const calculateFingerSpread = (
  landmarks: [number, number, number][],
  isLeftHand: boolean
): { index: number; middle: number; ring: number; pinky: number } => {
  const indexMCP = new THREE.Vector3(...landmarks[5]);
  const middleMCP = new THREE.Vector3(...landmarks[9]);
  const ringMCP = new THREE.Vector3(...landmarks[13]);
  const pinkyMCP = new THREE.Vector3(...landmarks[17]);
  
  const indexTip = new THREE.Vector3(...landmarks[8]);
  const middleTip = new THREE.Vector3(...landmarks[12]);
  const ringTip = new THREE.Vector3(...landmarks[16]);
  const pinkyTip = new THREE.Vector3(...landmarks[20]);
  
  const wrist = new THREE.Vector3(...landmarks[0]);
  
  const indexDir = new THREE.Vector3().subVectors(indexTip, indexMCP).normalize();
  const middleDir = new THREE.Vector3().subVectors(middleTip, middleMCP).normalize();
  const ringDir = new THREE.Vector3().subVectors(ringTip, ringMCP).normalize();
  const pinkyDir = new THREE.Vector3().subVectors(pinkyTip, pinkyMCP).normalize();
  
  const palmForward = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
  
  const indexSpread = Math.acos(THREE.MathUtils.clamp(indexDir.dot(middleDir), -1, 1));
  const middleSpread = 0;
  const ringSpread = Math.acos(THREE.MathUtils.clamp(ringDir.dot(middleDir), -1, 1));
  const pinkySpread = Math.acos(THREE.MathUtils.clamp(pinkyDir.dot(ringDir), -1, 1));
  
  const palmSide = new THREE.Vector3().subVectors(indexMCP, pinkyMCP).normalize();
  const palmNormal = new THREE.Vector3().crossVectors(palmForward, palmSide).normalize();
  
  const indexCross = new THREE.Vector3().crossVectors(middleDir, indexDir);
  const ringCross = new THREE.Vector3().crossVectors(middleDir, ringDir);
  const pinkyCross = new THREE.Vector3().crossVectors(ringDir, pinkyDir);
  
  const indexSign = indexCross.dot(palmNormal) > 0 ? 1 : -1;
  const ringSign = ringCross.dot(palmNormal) > 0 ? -1 : 1;
  const pinkySign = pinkyCross.dot(palmNormal) > 0 ? -1 : 1;
  
  const baselineSpread = 0.12;
  const spreadScale = 2.0;
  const sideMultiplier = isLeftHand ? 1 : -1;
  
  return {
    index: (indexSpread - baselineSpread) * spreadScale * indexSign * sideMultiplier,
    middle: middleSpread,
    ring: (ringSpread - baselineSpread) * spreadScale * ringSign * sideMultiplier,
    pinky: (pinkySpread - baselineSpread * 0.8) * spreadScale * pinkySign * sideMultiplier,
  };
};

// Convert landmark to 3D position
const landmarkTo3D = (
  x: number,
  y: number,
  z: number,
  isLeftHand: boolean
): THREE.Vector3 => {
  const scale = AVATAR_CONFIG.handReachScale;
  const avatarX = (x - 0.5) * scale;
  const avatarY = (0.5 - y) * scale * 0.8;
  const depthInfluence = Math.max(0, -z) * 0.15;
  const avatarZ = 0.25 + depthInfluence;
  
  return new THREE.Vector3(avatarX, avatarY, avatarZ);
};

// IK solver for arm
const solveArmIK = (
  targetPos: THREE.Vector3,
  isLeftArm: boolean
): { upperArmRotation: THREE.Euler; forearmRotation: THREE.Euler } => {
  const shoulderX = isLeftArm ? -AVATAR_CONFIG.shoulderWidth : AVATAR_CONFIG.shoulderWidth;
  const shoulderPos = new THREE.Vector3(shoulderX, AVATAR_CONFIG.shoulderHeight, 0);
  
  const upperLen = AVATAR_CONFIG.upperArmLength;
  const lowerLen = AVATAR_CONFIG.forearmLength;
  const totalLen = upperLen + lowerLen;
  
  const shoulderToTarget = new THREE.Vector3().subVectors(targetPos, shoulderPos);
  let distance = shoulderToTarget.length();
  
  const minDist = Math.abs(upperLen - lowerLen) * 0.5;
  const maxDist = totalLen * 0.95;
  distance = THREE.MathUtils.clamp(distance, minDist, maxDist);
  
  const direction = shoulderToTarget.clone().normalize();
  
  // Calculate elbow angle using law of cosines
  const cosElbow = (upperLen * upperLen + lowerLen * lowerLen - distance * distance) / (2 * upperLen * lowerLen);
  const elbowAngle = Math.acos(THREE.MathUtils.clamp(cosElbow, -1, 1));
  
  // Calculate shoulder angle
  const cosShoulder = (distance * distance + upperLen * upperLen - lowerLen * lowerLen) / (2 * distance * upperLen);
  const shoulderAngle = Math.acos(THREE.MathUtils.clamp(cosShoulder, -1, 1));
  
  // Convert to bone rotations
  const pitchToTarget = Math.atan2(direction.z, Math.sqrt(direction.x * direction.x + direction.y * direction.y));
  const yawToTarget = Math.atan2(direction.x, direction.y);
  
  const armPitch = -Math.PI / 2 + pitchToTarget + shoulderAngle;
  const armYaw = yawToTarget * (isLeftArm ? 1 : -1);
  const armRoll = isLeftArm ? 0.3 : -0.3;
  
  const forearmBend = Math.PI - elbowAngle;
  
  return {
    upperArmRotation: new THREE.Euler(armPitch, armYaw * 0.3, armRoll, 'XYZ'),
    forearmRotation: new THREE.Euler(forearmBend, 0, 0, 'XYZ'),
  };
};

// Calculate wrist rotation from hand landmarks
const calculateWristRotation = (
  landmarks: [number, number, number][],
  isLeftHand: boolean
): THREE.Euler => {
  const wrist = new THREE.Vector3(...landmarks[0]);
  const indexMCP = new THREE.Vector3(...landmarks[5]);
  const pinkyMCP = new THREE.Vector3(...landmarks[17]);
  const middleMCP = new THREE.Vector3(...landmarks[9]);
  
  const palmForward = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
  const palmSide = new THREE.Vector3().subVectors(indexMCP, pinkyMCP).normalize();
  const palmNormal = new THREE.Vector3().crossVectors(palmForward, palmSide).normalize();
  
  const pitch = Math.atan2(palmNormal.y, Math.sqrt(palmNormal.x ** 2 + palmNormal.z ** 2)) * 0.5;
  const roll = Math.atan2(palmNormal.x, palmNormal.z) * 0.4 * (isLeftHand ? 1 : -1);
  
  return new THREE.Euler(pitch, 0, roll, 'XYZ');
};

// Calculate finger rotations from landmarks
const calculateFingerRotations = (
  rawLandmarks: [number, number, number][],
  isLeftHand: boolean
): HandRotations => {
  const landmarks = normalizeLandmarksFor3D(rawLandmarks, 3);
  const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
  
  const thumbAbduction = calculateThumbAbduction(landmarks, isLeftHand);
  const fingerSpread = calculateFingerSpread(landmarks, isLeftHand);
  
  const result: HandRotations = {
    thumb: { proximal: { x: 0, y: 0, z: 0 }, intermediate: { x: 0, y: 0, z: 0 }, distal: { x: 0, y: 0, z: 0 } },
    index: { proximal: { x: 0, y: 0, z: 0 }, intermediate: { x: 0, y: 0, z: 0 }, distal: { x: 0, y: 0, z: 0 } },
    middle: { proximal: { x: 0, y: 0, z: 0 }, intermediate: { x: 0, y: 0, z: 0 }, distal: { x: 0, y: 0, z: 0 } },
    ring: { proximal: { x: 0, y: 0, z: 0 }, intermediate: { x: 0, y: 0, z: 0 }, distal: { x: 0, y: 0, z: 0 } },
    pinky: { proximal: { x: 0, y: 0, z: 0 }, intermediate: { x: 0, y: 0, z: 0 }, distal: { x: 0, y: 0, z: 0 } },
  };
  
  for (const fingerName of fingers) {
    const isThumb = fingerName === 'thumb';
    const curl = calculateFingerCurl(landmarks, fingerName, isThumb);
    
    if (isThumb) {
      result.thumb.proximal = {
        x: curl.proximal * 0.4,
        y: thumbAbduction * 0.3,
        z: thumbAbduction * 0.6,
      };
      result.thumb.intermediate = {
        x: curl.intermediate * 0.4,
        y: 0,
        z: thumbAbduction * 0.2,
      };
      result.thumb.distal = {
        x: curl.distal * 0.3,
        y: 0,
        z: 0,
      };
    } else {
      const spreadAmount = fingerSpread[fingerName as keyof typeof fingerSpread] || 0;
      result[fingerName].proximal = {
        x: curl.proximal,
        y: 0,
        z: spreadAmount,
      };
      result[fingerName].intermediate = {
        x: curl.intermediate,
        y: 0,
        z: 0,
      };
      result[fingerName].distal = {
        x: curl.distal,
        y: 0,
        z: 0,
      };
    }
  }
  
  return result;
};

// Convert a single frame to avatar pose
const convertFrameToPose = (
  frame: HandFrame,
  frameIndex: number
): AvatarPoseFrame => {
  let leftArm: ArmRotations | null = null;
  let rightArm: ArmRotations | null = null;
  let leftRawData: RawLandmarkData | null = null;
  let rightRawData: RawLandmarkData | null = null;
  
  if (isHandVisible(frame.leftHand)) {
    const wrist = frame.leftHand[0];
    const targetPos = landmarkTo3D(wrist[0], wrist[1], wrist[2], true);
    const ik = solveArmIK(targetPos, true);
    const wristRot = calculateWristRotation(frame.leftHand, true);
    const fingerRotations = calculateFingerRotations(frame.leftHand, true);
    
    leftArm = {
      shoulder: { x: 0, y: 0, z: 0 },
      upperArm: {
        x: ik.upperArmRotation.x,
        y: ik.upperArmRotation.y,
        z: ik.upperArmRotation.z,
        order: 'XYZ',
      },
      foreArm: {
        x: ik.forearmRotation.x,
        y: 0,
        z: 0,
        order: 'XYZ',
      },
      hand: {
        x: wristRot.x,
        y: 0,
        z: wristRot.z,
        order: 'XYZ',
      },
      fingers: fingerRotations,
    };
    
    // Include raw MediaPipe data for direct mapping
    leftRawData = {
      landmarks: frame.leftHand,
      wrist: frame.leftHand[0],
      avatarSpaceWrist: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
    };
  }
  
  if (isHandVisible(frame.rightHand)) {
    const wrist = frame.rightHand[0];
    const targetPos = landmarkTo3D(wrist[0], wrist[1], wrist[2], false);
    const ik = solveArmIK(targetPos, false);
    const wristRot = calculateWristRotation(frame.rightHand, false);
    const fingerRotations = calculateFingerRotations(frame.rightHand, false);
    
    rightArm = {
      shoulder: { x: 0, y: 0, z: 0 },
      upperArm: {
        x: ik.upperArmRotation.x,
        y: ik.upperArmRotation.y,
        z: -ik.upperArmRotation.z,
        order: 'XYZ',
      },
      foreArm: {
        x: ik.forearmRotation.x,
        y: 0,
        z: 0,
        order: 'XYZ',
      },
      hand: {
        x: wristRot.x,
        y: 0,
        z: -wristRot.z,
        order: 'XYZ',
      },
      fingers: fingerRotations,
    };
    
    // Include raw MediaPipe data for direct mapping
    rightRawData = {
      landmarks: frame.rightHand,
      wrist: frame.rightHand[0],
      avatarSpaceWrist: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
    };
  }
  
  return {
    frameIndex,
    label: frame.label,
    timestamp: frameIndex / 30, // Assuming 30 FPS
    leftArm,
    rightArm,
    rawData: {
      leftHand: leftRawData,
      rightHand: rightRawData,
    },
  };
};

// Main export function
export const convertFramesToAvatarJSON = (
  frames: HandFrame[],
  fps: number = 30,
  label?: string
): AvatarAnimationJSON => {
  const poseFrames: AvatarPoseFrame[] = frames.map((frame, index) =>
    convertFrameToPose(frame, index)
  );
  
  return {
    version: '1.0',
    modelName: 'mixamo-avatar.glb',
    fps,
    totalFrames: frames.length,
    boneNames: BONE_NAMES,
    coordinateSystem: {
      mediapipe: {
        description: 'Raw MediaPipe normalized coordinates (0-1 range)',
        xRange: '0 (left) to 1 (right) - already mirrored from camera',
        yRange: '0 (top) to 1 (bottom)',
        zRange: 'Negative values = closer to camera',
      },
      avatarSpace: {
        description: 'Converted 3D coordinates for mixamo-avatar.glb',
        xRange: '-0.6 (left) to 0.6 (right)',
        yRange: '-0.4 (down) to 0.4 (up) relative to shoulder',
        zRange: '0.1 (close to body) to 0.4 (arms extended forward)',
        shoulderWidth: AVATAR_CONFIG.shoulderWidth,
        shoulderHeight: AVATAR_CONFIG.shoulderHeight,
        armLength: AVATAR_CONFIG.upperArmLength + AVATAR_CONFIG.forearmLength,
      },
    },
    frames: poseFrames,
  };
};

// Download JSON function
export const downloadAvatarJSON = (
  frames: HandFrame[],
  fps: number = 30,
  fileName: string = 'avatar_animation'
) => {
  const json = convertFramesToAvatarJSON(frames, fps, fileName);
  const jsonString = JSON.stringify(json, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
