import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { HandFrame, isHandVisible } from '@/types/hand-data';

interface Avatar3DProps {
  frame: HandFrame | null;
}

interface FingerBones {
  proximal?: THREE.Bone;
  intermediate?: THREE.Bone;
  distal?: THREE.Bone;
}

interface HandBones {
  thumb: FingerBones;
  index: FingerBones;
  middle: FingerBones;
  ring: FingerBones;
  pinky: FingerBones;
}

interface BoneRefs {
  hips?: THREE.Bone;
  spine?: THREE.Bone;
  leftShoulder?: THREE.Bone;
  leftArm?: THREE.Bone;
  leftForeArm?: THREE.Bone;
  leftHand?: THREE.Bone;
  leftFingers: HandBones;
  rightShoulder?: THREE.Bone;
  rightArm?: THREE.Bone;
  rightForeArm?: THREE.Bone;
  rightHand?: THREE.Bone;
  rightFingers: HandBones;
}

// Store initial bone rotations for relaxed pose
interface InitialPose {
  leftArm: THREE.Euler;
  leftForeArm: THREE.Euler;
  leftHand: THREE.Euler;
  rightArm: THREE.Euler;
  rightForeArm: THREE.Euler;
  rightHand: THREE.Euler;
}

// Finger landmark indices from MediaPipe
const FINGER_LANDMARKS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

// Mixamo finger bone naming convention
const FINGER_BONE_NAMES = {
  left: {
    thumb: ['LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3'],
    index: ['LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3'],
    middle: ['LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3'],
    ring: ['LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3'],
    pinky: ['LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3'],
  },
  right: {
    thumb: ['RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3'],
    index: ['RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3'],
    middle: ['RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3'],
    ring: ['RightHandRing1', 'RightHandRing2', 'RightHandRing3'],
    pinky: ['RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3'],
  },
};

// ============================================================
// RELAXED POSE ROTATIONS (Arms at sides, natural standing pose)
// ============================================================
const RELAXED_POSE = {
  // Left arm hanging naturally at side
  leftArm: new THREE.Euler(0, 0, Math.PI * 0.05, 'XYZ'), // Slight outward angle
  leftForeArm: new THREE.Euler(0, 0, 0, 'XYZ'),
  leftHand: new THREE.Euler(0, 0, 0, 'XYZ'),
  // Right arm hanging naturally at side  
  rightArm: new THREE.Euler(0, 0, -Math.PI * 0.05, 'XYZ'), // Slight outward angle
  rightForeArm: new THREE.Euler(0, 0, 0, 'XYZ'),
  rightHand: new THREE.Euler(0, 0, 0, 'XYZ'),
};

// Finger relaxed curl (natural slight bend)
const RELAXED_FINGER_CURL = {
  proximal: 0.15,
  intermediate: 0.1,
  distal: 0.05,
};

// ============================================================
// SIMPLIFIED ARM MAPPING - MATCHING Hand3D EXACTLY
// Uses the same coordinate transform as normalizeCoordinates
// ============================================================

// Convert MediaPipe landmark to Three.js vector
// EXACT SAME as Hand3D's normalizeCoordinates in hand-data.ts
const landmarkToVector = (landmark: [number, number, number], scale = 3): THREE.Vector3 => {
  return new THREE.Vector3(
    (landmark[0] - 0.5) * scale,      // X: center around 0
    (1 - landmark[1] - 0.5) * scale,  // Y: flip so up is up
    -landmark[2] * scale              // Z: negate for Three.js depth
  );
};

// Calculate quaternion to rotate from one direction to another
const getRotationBetweenVectors = (from: THREE.Vector3, to: THREE.Vector3): THREE.Quaternion => {
  const quat = new THREE.Quaternion();
  quat.setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  return quat;
};

// Get direction vector between two landmarks
const getDirection = (
  startLandmark: [number, number, number],
  endLandmark: [number, number, number]
): THREE.Vector3 => {
  const start = landmarkToVector(startLandmark);
  const end = landmarkToVector(endLandmark);
  return new THREE.Vector3().subVectors(end, start).normalize();
};

// Mixamo rest pose: arms are in T-pose pointing outward
// Left arm points in +X, Right arm points in -X
const MIXAMO_REST_DIRECTIONS = {
  leftUpperArm: new THREE.Vector3(1, 0, 0),   // Points right (+X) in T-pose
  leftForeArm: new THREE.Vector3(1, 0, 0),    // Points right (+X) in T-pose
  rightUpperArm: new THREE.Vector3(-1, 0, 0), // Points left (-X) in T-pose
  rightForeArm: new THREE.Vector3(-1, 0, 0),  // Points left (-X) in T-pose
};

// Calculate rotation for upper arm bone
const calculateUpperArmRotation = (
  shoulderLandmark: [number, number, number],
  elbowLandmark: [number, number, number],
  isLeftSide: boolean
): THREE.Quaternion => {
  // Direction from shoulder to elbow in world space
  const targetDir = getDirection(shoulderLandmark, elbowLandmark);
  
  // Rest pose direction for this arm
  const restDir = isLeftSide 
    ? MIXAMO_REST_DIRECTIONS.leftUpperArm.clone()
    : MIXAMO_REST_DIRECTIONS.rightUpperArm.clone();
  
  return getRotationBetweenVectors(restDir, targetDir);
};

// Calculate rotation for forearm bone (relative to upper arm)
const calculateForeArmRotation = (
  elbowLandmark: [number, number, number],
  wristLandmark: [number, number, number],
  shoulderLandmark: [number, number, number],
  isLeftSide: boolean
): THREE.Quaternion => {
  // Direction from elbow to wrist in world space
  const forearmDir = getDirection(elbowLandmark, wristLandmark);
  
  // Direction from shoulder to elbow (upper arm direction)
  const upperArmDir = getDirection(shoulderLandmark, elbowLandmark);
  
  // Forearm rest direction is same as upper arm in T-pose
  // But we need rotation relative to parent (upper arm)
  // So we calculate how much the forearm deviates from the upper arm line
  
  return getRotationBetweenVectors(upperArmDir, forearmDir);
};

// ============================================================
// FINGER ROTATION CALCULATIONS
// ============================================================

// Calculate finger curl angle from landmarks
const calculateFingerCurl = (
  landmarks: [number, number, number][],
  fingerName: keyof typeof FINGER_LANDMARKS,
  isThumb: boolean = false
): { proximal: number; intermediate: number; distal: number } => {
  const indices = FINGER_LANDMARKS[fingerName];
  
  const p0 = landmarkToVector(landmarks[indices[0]]);
  const p1 = landmarkToVector(landmarks[indices[1]]);
  const p2 = landmarkToVector(landmarks[indices[2]]);
  const p3 = landmarkToVector(landmarks[indices[3]]);
  
  // Vectors between consecutive joints
  const v1 = new THREE.Vector3().subVectors(p1, p0).normalize();
  const v2 = new THREE.Vector3().subVectors(p2, p1).normalize();
  const v3 = new THREE.Vector3().subVectors(p3, p2).normalize();
  
  // Reference for straight finger
  const wrist = landmarkToVector(landmarks[0]);
  const middleMCP = landmarkToVector(landmarks[9]);
  const palmDirection = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
  
  // Angles at each joint
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
  const wrist = landmarkToVector(landmarks[0]);
  const thumbCMC = landmarkToVector(landmarks[1]);
  const thumbMCP = landmarkToVector(landmarks[2]);
  const indexMCP = landmarkToVector(landmarks[5]);
  const pinkyMCP = landmarkToVector(landmarks[17]);
  const middleMCP = landmarkToVector(landmarks[9]);
  
  const palmForward = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
  const palmSide = new THREE.Vector3().subVectors(indexMCP, pinkyMCP).normalize();
  const palmNormal = new THREE.Vector3().crossVectors(palmForward, palmSide).normalize();
  
  const thumbDirection = new THREE.Vector3().subVectors(thumbMCP, thumbCMC).normalize();
  const abductionAmount = thumbDirection.dot(palmNormal);
  
  const thumbOnPalm = thumbDirection.clone().projectOnPlane(palmNormal);
  const palmReference = new THREE.Vector3().subVectors(indexMCP, wrist).normalize();
  const spreadAngle = Math.acos(THREE.MathUtils.clamp(thumbOnPalm.dot(palmReference), -1, 1));
  
  const abduction = abductionAmount * 1.5 + (spreadAngle - Math.PI * 0.3) * 0.5;
  return abduction * (isLeftHand ? 1 : -1);
};

// Calculate finger spread
const calculateFingerSpread = (
  landmarks: [number, number, number][],
  isLeftHand: boolean
): { index: number; middle: number; ring: number; pinky: number } => {
  const indexMCP = landmarkToVector(landmarks[5]);
  const middleMCP = landmarkToVector(landmarks[9]);
  const ringMCP = landmarkToVector(landmarks[13]);
  const pinkyMCP = landmarkToVector(landmarks[17]);
  const wrist = landmarkToVector(landmarks[0]);
  
  const indexTip = landmarkToVector(landmarks[8]);
  const middleTip = landmarkToVector(landmarks[12]);
  const ringTip = landmarkToVector(landmarks[16]);
  const pinkyTip = landmarkToVector(landmarks[20]);
  
  const indexDir = new THREE.Vector3().subVectors(indexTip, indexMCP).normalize();
  const middleDir = new THREE.Vector3().subVectors(middleTip, middleMCP).normalize();
  const ringDir = new THREE.Vector3().subVectors(ringTip, ringMCP).normalize();
  const pinkyDir = new THREE.Vector3().subVectors(pinkyTip, pinkyMCP).normalize();
  
  const palmForward = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
  const palmSide = new THREE.Vector3().subVectors(indexMCP, pinkyMCP).normalize();
  const palmNormal = new THREE.Vector3().crossVectors(palmForward, palmSide).normalize();
  
  const indexSpread = Math.acos(THREE.MathUtils.clamp(indexDir.dot(middleDir), -1, 1));
  const ringSpread = Math.acos(THREE.MathUtils.clamp(ringDir.dot(middleDir), -1, 1));
  const pinkySpread = Math.acos(THREE.MathUtils.clamp(pinkyDir.dot(ringDir), -1, 1));
  
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
    middle: 0,
    ring: (ringSpread - baselineSpread) * spreadScale * ringSign * sideMultiplier,
    pinky: (pinkySpread - baselineSpread * 0.8) * spreadScale * pinkySign * sideMultiplier,
  };
};

// Apply finger rotations to bones
const applyFingerRotations = (
  fingerBones: HandBones,
  landmarks: [number, number, number][],
  isLeftHand: boolean,
  lerp: number
) => {
  const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
  const thumbAbduction = calculateThumbAbduction(landmarks, isLeftHand);
  const fingerSpread = calculateFingerSpread(landmarks, isLeftHand);
  
  for (const fingerName of fingers) {
    const bones = fingerBones[fingerName];
    const isThumb = fingerName === 'thumb';
    const curl = calculateFingerCurl(landmarks, fingerName, isThumb);
    
    if (bones.proximal) {
      if (isThumb) {
        const targetX = curl.proximal * 0.4;
        bones.proximal.rotation.x = THREE.MathUtils.lerp(bones.proximal.rotation.x, targetX, lerp);
        bones.proximal.rotation.z = THREE.MathUtils.lerp(bones.proximal.rotation.z, thumbAbduction * 0.6, lerp);
        bones.proximal.rotation.y = THREE.MathUtils.lerp(bones.proximal.rotation.y, thumbAbduction * 0.3, lerp);
      } else {
        bones.proximal.rotation.x = THREE.MathUtils.lerp(bones.proximal.rotation.x, curl.proximal, lerp);
        const spreadAmount = fingerSpread[fingerName as keyof typeof fingerSpread] || 0;
        bones.proximal.rotation.z = THREE.MathUtils.lerp(bones.proximal.rotation.z, spreadAmount, lerp);
      }
    }
    
    if (bones.intermediate) {
      const targetX = isThumb ? curl.intermediate * 0.4 : curl.intermediate;
      bones.intermediate.rotation.x = THREE.MathUtils.lerp(bones.intermediate.rotation.x, targetX, lerp);
      if (isThumb) {
        bones.intermediate.rotation.z = THREE.MathUtils.lerp(bones.intermediate.rotation.z, thumbAbduction * 0.2, lerp);
      }
    }
    
    if (bones.distal) {
      const targetX = isThumb ? curl.distal * 0.3 : curl.distal;
      bones.distal.rotation.x = THREE.MathUtils.lerp(bones.distal.rotation.x, targetX, lerp);
    }
  }
};

// Reset finger bones to relaxed position
const resetFingerBones = (fingerBones: HandBones, lerp: number) => {
  const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
  
  for (const fingerName of fingers) {
    const bones = fingerBones[fingerName];
    
    if (bones.proximal) {
      bones.proximal.rotation.x = THREE.MathUtils.lerp(bones.proximal.rotation.x, RELAXED_FINGER_CURL.proximal, lerp);
      bones.proximal.rotation.z = THREE.MathUtils.lerp(bones.proximal.rotation.z, 0, lerp);
      bones.proximal.rotation.y = THREE.MathUtils.lerp(bones.proximal.rotation.y, 0, lerp);
    }
    if (bones.intermediate) {
      bones.intermediate.rotation.x = THREE.MathUtils.lerp(bones.intermediate.rotation.x, RELAXED_FINGER_CURL.intermediate, lerp);
      bones.intermediate.rotation.z = THREE.MathUtils.lerp(bones.intermediate.rotation.z, 0, lerp);
    }
    if (bones.distal) {
      bones.distal.rotation.x = THREE.MathUtils.lerp(bones.distal.rotation.x, RELAXED_FINGER_CURL.distal, lerp);
    }
  }
};

// ============================================================
// SIMPLIFIED ARM MAPPING - Direct Quaternion Application
// ============================================================

const applyArmMapping = (
  armBone: THREE.Bone | undefined,
  foreArmBone: THREE.Bone | undefined,
  handBone: THREE.Bone | undefined,
  fingerBones: HandBones,
  handLandmarks: [number, number, number][],
  armLandmarks: { shoulder: [number, number, number]; elbow: [number, number, number]; wrist: [number, number, number] } | undefined,
  isLeftSide: boolean,
  lerp: number
) => {
  if (!handLandmarks || handLandmarks.length < 21) return;
  
  if (armLandmarks && armBone && foreArmBone) {
    // ============================================
    // UPPER ARM: Rotate to point toward elbow
    // ============================================
    const upperArmQuat = calculateUpperArmRotation(
      armLandmarks.shoulder,
      armLandmarks.elbow,
      isLeftSide
    );
    
    // Convert quaternion to euler and lerp
    const targetUpperArmEuler = new THREE.Euler().setFromQuaternion(upperArmQuat, 'XYZ');
    armBone.rotation.x = THREE.MathUtils.lerp(armBone.rotation.x, targetUpperArmEuler.x, lerp);
    armBone.rotation.y = THREE.MathUtils.lerp(armBone.rotation.y, targetUpperArmEuler.y, lerp);
    armBone.rotation.z = THREE.MathUtils.lerp(armBone.rotation.z, targetUpperArmEuler.z, lerp);
    
    // ============================================
    // FOREARM: Rotate relative to upper arm direction
    // ============================================
    const foreArmQuat = calculateForeArmRotation(
      armLandmarks.elbow,
      armLandmarks.wrist,
      armLandmarks.shoulder,
      isLeftSide
    );
    
    const targetForeArmEuler = new THREE.Euler().setFromQuaternion(foreArmQuat, 'XYZ');
    foreArmBone.rotation.x = THREE.MathUtils.lerp(foreArmBone.rotation.x, targetForeArmEuler.x, lerp);
    foreArmBone.rotation.y = THREE.MathUtils.lerp(foreArmBone.rotation.y, targetForeArmEuler.y, lerp);
    foreArmBone.rotation.z = THREE.MathUtils.lerp(foreArmBone.rotation.z, targetForeArmEuler.z, lerp);
  }
  
  // ============================================
  // HAND: Align palm orientation using landmarks 0, 5, 17
  // ============================================
  if (handBone) {
    const wrist = landmarkToVector(handLandmarks[0]);
    const indexMCP = landmarkToVector(handLandmarks[5]);
    const middleMCP = landmarkToVector(handLandmarks[9]);
    const pinkyMCP = landmarkToVector(handLandmarks[17]);
    
    // Palm forward (wrist to middle finger base)
    const palmForward = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
    
    // Palm side (index to pinky direction)
    const palmSide = new THREE.Vector3().subVectors(pinkyMCP, indexMCP).normalize();
    
    // Palm normal (perpendicular to palm surface)
    const palmNormal = new THREE.Vector3().crossVectors(palmForward, palmSide).normalize();
    
    // Build rotation matrix - palm faces -Z (toward camera), fingers point up
    const rotMatrix = new THREE.Matrix4();
    
    // For the hand bone: X = side, Y = forward (fingers), Z = normal
    if (isLeftSide) {
      rotMatrix.makeBasis(palmSide.negate(), palmForward, palmNormal);
    } else {
      rotMatrix.makeBasis(palmSide, palmForward, palmNormal.negate());
    }
    
    const handQuat = new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
    const targetHandEuler = new THREE.Euler().setFromQuaternion(handQuat, 'XYZ');
    
    handBone.rotation.x = THREE.MathUtils.lerp(handBone.rotation.x, targetHandEuler.x, lerp);
    handBone.rotation.y = THREE.MathUtils.lerp(handBone.rotation.y, targetHandEuler.y, lerp);
    handBone.rotation.z = THREE.MathUtils.lerp(handBone.rotation.z, targetHandEuler.z, lerp);
  }
  
  // ============================================
  // FINGERS: Apply curl and spread
  // ============================================
  applyFingerRotations(fingerBones, handLandmarks, isLeftSide, lerp);
};

// Reset arm to relaxed pose
const resetArmToRelaxedPose = (
  armBone: THREE.Bone | undefined,
  foreArmBone: THREE.Bone | undefined,
  handBone: THREE.Bone | undefined,
  fingerBones: HandBones,
  isLeftSide: boolean,
  lerp: number
) => {
  const relaxed = isLeftSide ? 
    { arm: RELAXED_POSE.leftArm, foreArm: RELAXED_POSE.leftForeArm, hand: RELAXED_POSE.leftHand } :
    { arm: RELAXED_POSE.rightArm, foreArm: RELAXED_POSE.rightForeArm, hand: RELAXED_POSE.rightHand };
  
  if (armBone) {
    armBone.rotation.x = THREE.MathUtils.lerp(armBone.rotation.x, relaxed.arm.x, lerp);
    armBone.rotation.y = THREE.MathUtils.lerp(armBone.rotation.y, relaxed.arm.y, lerp);
    armBone.rotation.z = THREE.MathUtils.lerp(armBone.rotation.z, relaxed.arm.z, lerp);
  }
  
  if (foreArmBone) {
    foreArmBone.rotation.x = THREE.MathUtils.lerp(foreArmBone.rotation.x, relaxed.foreArm.x, lerp);
    foreArmBone.rotation.y = THREE.MathUtils.lerp(foreArmBone.rotation.y, relaxed.foreArm.y, lerp);
    foreArmBone.rotation.z = THREE.MathUtils.lerp(foreArmBone.rotation.z, relaxed.foreArm.z, lerp);
  }
  
  if (handBone) {
    handBone.rotation.x = THREE.MathUtils.lerp(handBone.rotation.x, relaxed.hand.x, lerp);
    handBone.rotation.y = THREE.MathUtils.lerp(handBone.rotation.y, relaxed.hand.y, lerp);
    handBone.rotation.z = THREE.MathUtils.lerp(handBone.rotation.z, relaxed.hand.z, lerp);
  }
  
  resetFingerBones(fingerBones, lerp);
};

// ============================================================
// MIXAMO AVATAR COMPONENT
// ============================================================

const MixamoAvatar = ({ frame }: Avatar3DProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const bonesRef = useRef<BoneRefs>({
    leftFingers: { thumb: {}, index: {}, middle: {}, ring: {}, pinky: {} },
    rightFingers: { thumb: {}, index: {}, middle: {}, ring: {}, pinky: {} },
  });
  const [isReady, setIsReady] = useState(false);
  const initialPoseApplied = useRef(false);
  
  const modelPath = `${import.meta.env.BASE_URL}models/mixamo-avatar.glb`;
  const { scene } = useGLTF(modelPath);
  
  // Calculate scale to fit avatar
  const { scale, yOffset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    return {
      scale: 2.5 / maxDim,
      yOffset: -center.y * (2.5 / maxDim) - 0.5
    };
  }, [scene]);
  
  // Find bones on mount
  useEffect(() => {
    const fingerBoneMap: Record<string, { hand: 'left' | 'right'; finger: keyof HandBones; segment: keyof FingerBones }> = {};
    
    for (const [side, fingers] of Object.entries(FINGER_BONE_NAMES)) {
      for (const [fingerName, boneNames] of Object.entries(fingers)) {
        const segments: (keyof FingerBones)[] = ['proximal', 'intermediate', 'distal'];
        boneNames.forEach((boneName, idx) => {
          fingerBoneMap[boneName] = {
            hand: side as 'left' | 'right',
            finger: fingerName as keyof HandBones,
            segment: segments[idx],
          };
        });
      }
    }
    
    scene.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        const bone = child as THREE.Bone;
        
        // Core bones
        if (bone.name === 'Hips') bonesRef.current.hips = bone;
        if (bone.name === 'Spine') bonesRef.current.spine = bone;
        
        // Arm bones
        if (bone.name === 'LeftShoulder') bonesRef.current.leftShoulder = bone;
        if (bone.name === 'LeftArm') bonesRef.current.leftArm = bone;
        if (bone.name === 'LeftForeArm') bonesRef.current.leftForeArm = bone;
        if (bone.name === 'LeftHand') bonesRef.current.leftHand = bone;
        if (bone.name === 'RightShoulder') bonesRef.current.rightShoulder = bone;
        if (bone.name === 'RightArm') bonesRef.current.rightArm = bone;
        if (bone.name === 'RightForeArm') bonesRef.current.rightForeArm = bone;
        if (bone.name === 'RightHand') bonesRef.current.rightHand = bone;
        
        // Finger bones
        if (fingerBoneMap[bone.name]) {
          const { hand, finger, segment } = fingerBoneMap[bone.name];
          const fingerBones = hand === 'left' ? bonesRef.current.leftFingers : bonesRef.current.rightFingers;
          fingerBones[finger][segment] = bone;
        }
      }
    });
    
    const armBoneCount = [
      bonesRef.current.leftArm,
      bonesRef.current.leftForeArm,
      bonesRef.current.leftHand,
      bonesRef.current.rightArm,
      bonesRef.current.rightForeArm,
      bonesRef.current.rightHand,
    ].filter(Boolean).length;
    
    const fingerBoneCount = 
      Object.values(bonesRef.current.leftFingers).reduce((sum, f) => sum + Object.values(f).filter(Boolean).length, 0) +
      Object.values(bonesRef.current.rightFingers).reduce((sum, f) => sum + Object.values(f).filter(Boolean).length, 0);
    
    console.log('Found', armBoneCount, 'arm bones and', fingerBoneCount, 'finger bones');
    setIsReady(armBoneCount > 0);
  }, [scene]);
  
  // Animation loop - ROTATION-BASED MAPPING (No stretching)
  useFrame(() => {
    if (!isReady) return;
    
    const bones = bonesRef.current;
    const lerp = 0.15; // Smooth interpolation
    
    // Check if hands are visible with sufficient confidence
    const leftHandVisible = frame && isHandVisible(frame.leftHand);
    const rightHandVisible = frame && isHandVisible(frame.rightHand);
    
    // LEFT ARM - Direct mapping
    if (leftHandVisible && frame) {
      applyArmMapping(
        bones.leftArm,
        bones.leftForeArm,
        bones.leftHand,
        bones.leftFingers,
        frame.leftHand,
        frame.leftArm,
        true, // isLeftSide
        lerp
      );
    } else {
      // Return to relaxed pose
      resetArmToRelaxedPose(
        bones.leftArm,
        bones.leftForeArm,
        bones.leftHand,
        bones.leftFingers,
        true,
        lerp * 0.5 // Slower return to relaxed
      );
    }
    
    // RIGHT ARM - Direct mapping
    if (rightHandVisible && frame) {
      applyArmMapping(
        bones.rightArm,
        bones.rightForeArm,
        bones.rightHand,
        bones.rightFingers,
        frame.rightHand,
        frame.rightArm,
        false, // isLeftSide
        lerp
      );
    } else {
      // Return to relaxed pose
      resetArmToRelaxedPose(
        bones.rightArm,
        bones.rightForeArm,
        bones.rightHand,
        bones.rightFingers,
        false,
        lerp * 0.5
      );
    }
  });
  
  return (
    <group ref={groupRef} position={[0, yOffset, 0]} scale={scale}>
      <primitive object={scene} />
    </group>
  );
};

// Main component
const Avatar3D = ({ frame }: Avatar3DProps) => {
  return <MixamoAvatar frame={frame} />;
};

useGLTF.preload(`${import.meta.env.BASE_URL}models/mixamo-avatar.glb`);

export default Avatar3D;
