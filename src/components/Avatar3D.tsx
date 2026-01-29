import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { HandFrame, isHandVisible, normalizeCoordinates } from '@/types/hand-data';

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

// Finger landmark indices from MediaPipe
// Each finger has 4 landmarks: MCP (base), PIP, DIP, TIP
const FINGER_LANDMARKS = {
  thumb: [1, 2, 3, 4],     // CMC, MCP, IP, TIP
  index: [5, 6, 7, 8],     // MCP, PIP, DIP, TIP
  middle: [9, 10, 11, 12], // MCP, PIP, DIP, TIP
  ring: [13, 14, 15, 16],  // MCP, PIP, DIP, TIP
  pinky: [17, 18, 19, 20], // MCP, PIP, DIP, TIP
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

// Calculate finger curl angle from landmarks
// Uses the angle between finger segments to determine bend amount
const calculateFingerCurl = (
  landmarks: [number, number, number][],
  fingerName: keyof typeof FINGER_LANDMARKS,
  isThumb: boolean = false
): { proximal: number; intermediate: number; distal: number } => {
  const indices = FINGER_LANDMARKS[fingerName];
  
  // Get the 4 points of the finger
  const p0 = new THREE.Vector3(...landmarks[indices[0]]); // Base (MCP)
  const p1 = new THREE.Vector3(...landmarks[indices[1]]); // First joint (PIP)
  const p2 = new THREE.Vector3(...landmarks[indices[2]]); // Second joint (DIP)
  const p3 = new THREE.Vector3(...landmarks[indices[3]]); // Tip
  
  // Calculate vectors between consecutive joints
  const v1 = new THREE.Vector3().subVectors(p1, p0).normalize(); // Base to first joint
  const v2 = new THREE.Vector3().subVectors(p2, p1).normalize(); // First to second joint
  const v3 = new THREE.Vector3().subVectors(p3, p2).normalize(); // Second to tip
  
  // For the proximal bone, we need to compare against a "straight" reference
  // Use the direction from wrist to finger base as reference for "straight"
  const wrist = new THREE.Vector3(...landmarks[0]);
  const middleMCP = new THREE.Vector3(...landmarks[9]); // Middle finger base as palm reference
  const palmDirection = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
  
  // Calculate bend angles at each joint
  // Angle between consecutive segments - smaller angle = more bent
  const angle1 = Math.acos(THREE.MathUtils.clamp(v1.dot(v2), -1, 1)); // Angle at PIP joint
  const angle2 = Math.acos(THREE.MathUtils.clamp(v2.dot(v3), -1, 1)); // Angle at DIP joint
  
  // For proximal, measure how much the first segment deviates from palm direction
  const proximalAngle = Math.acos(THREE.MathUtils.clamp(palmDirection.dot(v1), -1, 1));
  
  // Convert angles to curl rotations
  // When finger is straight: angles are ~PI (180°), curl should be ~0
  // When finger is bent: angles decrease, curl should increase
  const curlScale = isThumb ? 1.0 : 1.2;
  
  return {
    proximal: proximalAngle * curlScale * 0.6,
    intermediate: (Math.PI - angle1) * curlScale,
    distal: (Math.PI - angle2) * curlScale * 0.8,
  };
};

// Calculate thumb abduction/adduction (movement away from/toward palm)
const calculateThumbAbduction = (
  landmarks: [number, number, number][],
  isLeftHand: boolean
): number => {
  // Key landmarks for thumb abduction calculation
  const wrist = new THREE.Vector3(...landmarks[0]);
  const thumbCMC = new THREE.Vector3(...landmarks[1]);  // Thumb base
  const thumbMCP = new THREE.Vector3(...landmarks[2]);  // Thumb knuckle
  const indexMCP = new THREE.Vector3(...landmarks[5]);  // Index base
  const pinkyMCP = new THREE.Vector3(...landmarks[17]); // Pinky base
  const middleMCP = new THREE.Vector3(...landmarks[9]); // Middle base
  
  // Calculate palm plane normal
  const palmForward = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
  const palmSide = new THREE.Vector3().subVectors(indexMCP, pinkyMCP).normalize();
  const palmNormal = new THREE.Vector3().crossVectors(palmForward, palmSide).normalize();
  
  // Calculate thumb direction from CMC to MCP
  const thumbDirection = new THREE.Vector3().subVectors(thumbMCP, thumbCMC).normalize();
  
  // Calculate the angle between thumb and palm plane
  // Project thumb direction onto palm plane and measure deviation
  const thumbOnPalm = thumbDirection.clone().projectOnPlane(palmNormal);
  
  // Reference direction: from wrist toward index (along palm)
  const palmReference = new THREE.Vector3().subVectors(indexMCP, wrist).normalize();
  
  // Measure how much thumb deviates from the palm plane (abduction angle)
  // Dot product with palm normal gives us how much thumb points away from palm
  const abductionAmount = thumbDirection.dot(palmNormal);
  
  // Also measure spread angle (how far thumb is from index finger direction)
  const spreadAngle = Math.acos(THREE.MathUtils.clamp(thumbOnPalm.dot(palmReference), -1, 1));
  
  // Combine abduction (out of plane) and spread (within plane)
  // Positive = thumb away from palm, negative = thumb toward palm
  const abduction = abductionAmount * 1.5 + (spreadAngle - Math.PI * 0.3) * 0.5;
  
  // Flip for right hand to maintain correct direction
  return abduction * (isLeftHand ? 1 : -1);
};

// Calculate finger spread angles (how much each finger deviates from its neighbor)
const calculateFingerSpread = (
  landmarks: [number, number, number][],
  isLeftHand: boolean
): { index: number; middle: number; ring: number; pinky: number } => {
  // MCP (base) landmarks for each finger
  const indexMCP = new THREE.Vector3(...landmarks[5]);
  const middleMCP = new THREE.Vector3(...landmarks[9]);
  const ringMCP = new THREE.Vector3(...landmarks[13]);
  const pinkyMCP = new THREE.Vector3(...landmarks[17]);
  
  // Tip landmarks for direction reference
  const indexTip = new THREE.Vector3(...landmarks[8]);
  const middleTip = new THREE.Vector3(...landmarks[12]);
  const ringTip = new THREE.Vector3(...landmarks[16]);
  const pinkyTip = new THREE.Vector3(...landmarks[20]);
  
  // Wrist for reference
  const wrist = new THREE.Vector3(...landmarks[0]);
  
  // Calculate direction vectors for each finger (from MCP toward tip)
  const indexDir = new THREE.Vector3().subVectors(indexTip, indexMCP).normalize();
  const middleDir = new THREE.Vector3().subVectors(middleTip, middleMCP).normalize();
  const ringDir = new THREE.Vector3().subVectors(ringTip, ringMCP).normalize();
  const pinkyDir = new THREE.Vector3().subVectors(pinkyTip, pinkyMCP).normalize();
  
  // Calculate palm forward direction (reference for neutral spread)
  const palmForward = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
  
  // Calculate spread as angle deviation from middle finger direction
  // Positive = spread outward, negative = fingers together
  const indexSpread = Math.acos(THREE.MathUtils.clamp(indexDir.dot(middleDir), -1, 1));
  const middleSpread = 0; // Middle finger is the reference
  const ringSpread = Math.acos(THREE.MathUtils.clamp(ringDir.dot(middleDir), -1, 1));
  const pinkySpread = Math.acos(THREE.MathUtils.clamp(pinkyDir.dot(ringDir), -1, 1));
  
  // Determine spread direction by checking cross product with palm normal
  const palmSide = new THREE.Vector3().subVectors(indexMCP, pinkyMCP).normalize();
  const palmNormal = new THREE.Vector3().crossVectors(palmForward, palmSide).normalize();
  
  // Check which side of middle each finger is on
  const indexCross = new THREE.Vector3().crossVectors(middleDir, indexDir);
  const ringCross = new THREE.Vector3().crossVectors(middleDir, ringDir);
  const pinkyCross = new THREE.Vector3().crossVectors(ringDir, pinkyDir);
  
  const indexSign = indexCross.dot(palmNormal) > 0 ? 1 : -1;
  const ringSign = ringCross.dot(palmNormal) > 0 ? -1 : 1;
  const pinkySign = pinkyCross.dot(palmNormal) > 0 ? -1 : 1;
  
  // Scale spread values - baseline when fingers together is ~0.1-0.15 rad
  const baselineSpread = 0.12;
  const spreadScale = 2.0;
  
  // Flip for hand side
  const sideMultiplier = isLeftHand ? 1 : -1;
  
  return {
    index: (indexSpread - baselineSpread) * spreadScale * indexSign * sideMultiplier,
    middle: middleSpread,
    ring: (ringSpread - baselineSpread) * spreadScale * ringSign * sideMultiplier,
    pinky: (pinkySpread - baselineSpread * 0.8) * spreadScale * pinkySign * sideMultiplier,
  };
};

// Normalize landmarks the same way Hand3D does for consistent coordinate system
const normalizeLandmarksFor3D = (
  landmarks: [number, number, number][],
  scale: number = 1
): [number, number, number][] => {
  if (!landmarks || landmarks.length === 0) return [];
  return landmarks.map((point) => [
    (1 - point[0] - 0.5) * scale, // Mirror X
    (1 - point[1] - 0.5) * scale, // Flip Y
    -point[2] * scale,            // Negate Z for depth
  ]);
};

// Apply finger rotations to bones
const applyFingerRotations = (
  fingerBones: HandBones,
  rawLandmarks: [number, number, number][],
  isLeftHand: boolean,
  lerp: number
) => {
  // Use normalized landmarks for consistent calculations with Hand3D
  const landmarks = normalizeLandmarksFor3D(rawLandmarks, 3);
  const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
  
  // Calculate thumb abduction separately
  const thumbAbduction = calculateThumbAbduction(landmarks, isLeftHand);
  
  // Calculate finger spread
  const fingerSpread = calculateFingerSpread(landmarks, isLeftHand);
  
  for (const fingerName of fingers) {
    const bones = fingerBones[fingerName];
    const isThumb = fingerName === 'thumb';
    const curl = calculateFingerCurl(landmarks, fingerName, isThumb);
    
    // Apply rotation to each bone segment
    if (bones.proximal) {
      if (isThumb) {
        // Thumb has special handling for abduction/adduction
        const targetX = curl.proximal * 0.4;
        bones.proximal.rotation.x = THREE.MathUtils.lerp(bones.proximal.rotation.x, targetX, lerp);
        
        // Z rotation for abduction (thumb moving away from palm)
        bones.proximal.rotation.z = THREE.MathUtils.lerp(
          bones.proximal.rotation.z, 
          thumbAbduction * 0.6, 
          lerp
        );
        
        // Y rotation for opposition (thumb rotating to face other fingers)
        const opposition = thumbAbduction * 0.3;
        bones.proximal.rotation.y = THREE.MathUtils.lerp(
          bones.proximal.rotation.y, 
          opposition, 
          lerp
        );
      } else {
        // Regular fingers curl primarily on X axis
        bones.proximal.rotation.x = THREE.MathUtils.lerp(bones.proximal.rotation.x, curl.proximal, lerp);
        
        // Apply calculated spread for each finger
        const spreadAmount = fingerSpread[fingerName as keyof typeof fingerSpread] || 0;
        bones.proximal.rotation.z = THREE.MathUtils.lerp(
          bones.proximal.rotation.z, 
          spreadAmount, 
          lerp
        );
      }
    }
    
    if (bones.intermediate) {
      const targetX = isThumb ? curl.intermediate * 0.4 : curl.intermediate;
      bones.intermediate.rotation.x = THREE.MathUtils.lerp(bones.intermediate.rotation.x, targetX, lerp);
      
      // Thumb intermediate also gets some abduction influence
      if (isThumb) {
        bones.intermediate.rotation.z = THREE.MathUtils.lerp(
          bones.intermediate.rotation.z, 
          thumbAbduction * 0.2, 
          lerp
        );
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
  const relaxedCurl = 0.15; // Slight natural curl when relaxed
  
  for (const fingerName of fingers) {
    const bones = fingerBones[fingerName];
    
    if (bones.proximal) {
      bones.proximal.rotation.x = THREE.MathUtils.lerp(bones.proximal.rotation.x, relaxedCurl, lerp);
      bones.proximal.rotation.z = THREE.MathUtils.lerp(bones.proximal.rotation.z, 0, lerp);
    }
    if (bones.intermediate) {
      bones.intermediate.rotation.x = THREE.MathUtils.lerp(bones.intermediate.rotation.x, relaxedCurl * 0.5, lerp);
    }
    if (bones.distal) {
      bones.distal.rotation.x = THREE.MathUtils.lerp(bones.distal.rotation.x, relaxedCurl * 0.3, lerp);
    }
  }
};

// Calculate hand center and orientation from landmarks
const calculateHandPose = (landmarks: [number, number, number][]) => {
  // Key landmarks
  const wrist = new THREE.Vector3(landmarks[0][0], landmarks[0][1], landmarks[0][2]);
  const indexMCP = new THREE.Vector3(landmarks[5][0], landmarks[5][1], landmarks[5][2]);
  const middleMCP = new THREE.Vector3(landmarks[9][0], landmarks[9][1], landmarks[9][2]);
  const pinkyMCP = new THREE.Vector3(landmarks[17][0], landmarks[17][1], landmarks[17][2]);
  const middleTip = new THREE.Vector3(landmarks[12][0], landmarks[12][1], landmarks[12][2]);
  
  // Palm center (average of wrist and finger bases)
  const palmCenter = new THREE.Vector3()
    .add(wrist)
    .add(indexMCP)
    .add(middleMCP)
    .add(pinkyMCP)
    .multiplyScalar(0.25);
  
  // Hand direction: from wrist toward middle finger
  const handDirection = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
  
  // Palm width direction: from pinky to index (across the palm)
  const palmWidth = new THREE.Vector3().subVectors(indexMCP, pinkyMCP).normalize();
  
  // Palm normal: perpendicular to palm surface (cross product)
  const palmNormal = new THREE.Vector3().crossVectors(handDirection, palmWidth).normalize();
  
  // Finger extension direction (for hand rotation)
  const fingerDirection = new THREE.Vector3().subVectors(middleTip, middleMCP).normalize();
  
  return {
    wrist,
    palmCenter,
    handDirection,
    palmNormal,
    palmWidth,
    fingerDirection
  };
};

// Avatar configuration - tuned to match Mixamo rig proportions
const AVATAR_CONFIG = {
  shoulderWidth: 0.18,      // Half distance between shoulders
  shoulderHeight: 0.35,     // Shoulder Y position from center
  upperArmLength: 0.28,     // Upper arm bone length
  forearmLength: 0.25,      // Forearm bone length
  handReachScale: 1.2,      // Scale factor for hand position mapping
};

// Convert normalized camera coordinates to avatar world position
// Maps the 2D camera view + depth to 3D positions relative to avatar
const landmarkTo3D = (
  x: number, 
  y: number, 
  z: number, 
  isLeftHand: boolean
): THREE.Vector3 => {
  // Camera coordinates: x (0-1 left to right), y (0-1 top to bottom), z (depth, negative = closer)
  // Avatar coordinates: x (left/right), y (up/down), z (forward/back - positive = front)
  // 
  // The camera feed is already mirrored in CameraCapture (1.0 - x), so:
  // - x=0 means left side of avatar's body (avatar's left)
  // - x=1 means right side of avatar's body (avatar's right)
  
  const scale = AVATAR_CONFIG.handReachScale;
  
  // Map X: x=0 -> avatar's left (negative X), x=1 -> avatar's right (positive X)
  // Center is at x=0.5 -> avatarX=0
  const avatarX = (x - 0.5) * scale;
  
  // Flip Y - camera Y goes down (0=top, 1=bottom), avatar Y goes up
  // y=0 (top of frame) -> high arm position
  // y=1 (bottom of frame) -> low arm position
  const avatarY = (0.5 - y) * scale * 0.8;
  
  // Z: Always keep hands in front. Use camera depth for relative positioning only
  // MediaPipe z is negative when hand is closer to camera
  const depthInfluence = Math.max(0, -z) * 0.15;
  const avatarZ = 0.25 + depthInfluence; // Base forward position + depth variation
  
  return new THREE.Vector3(avatarX, avatarY, avatarZ);
};

// Improved 2-bone IK solver using geometric approach
const solveArmIK = (
  targetPos: THREE.Vector3,
  isLeftArm: boolean
): { upperArmRotation: THREE.Euler; forearmRotation: THREE.Euler; handRotation: THREE.Euler } => {
  
  // Shoulder position in avatar space
  const shoulderX = isLeftArm ? -AVATAR_CONFIG.shoulderWidth : AVATAR_CONFIG.shoulderWidth;
  const shoulderPos = new THREE.Vector3(shoulderX, AVATAR_CONFIG.shoulderHeight, 0);
  
  const upperLen = AVATAR_CONFIG.upperArmLength;
  const lowerLen = AVATAR_CONFIG.forearmLength;
  const totalLen = upperLen + lowerLen;
  
  // Vector from shoulder to target
  const shoulderToTarget = new THREE.Vector3().subVectors(targetPos, shoulderPos);
  let distance = shoulderToTarget.length();
  
  // Clamp distance to reachable range
  const minDist = Math.abs(upperLen - lowerLen) * 0.5;
  const maxDist = totalLen * 0.95; // Leave some slack
  distance = THREE.MathUtils.clamp(distance, minDist, maxDist);
  
  // Normalized direction to target
  const direction = shoulderToTarget.clone().normalize();
  
  // Calculate angles using law of cosines
  // For elbow angle (angle at elbow joint)
  const cosElbow = (upperLen * upperLen + lowerLen * lowerLen - distance * distance) / (2 * upperLen * lowerLen);
  const elbowAngle = Math.acos(THREE.MathUtils.clamp(cosElbow, -1, 1));
  
  // For shoulder offset (angle between upper arm and line to target)
  const cosShoulder = (upperLen * upperLen + distance * distance - lowerLen * lowerLen) / (2 * upperLen * distance);
  const shoulderAngle = Math.acos(THREE.MathUtils.clamp(cosShoulder, -1, 1));
  
  // Convert direction to rotation angles
  // Pitch (X rotation): arm up/down - based on Y component
  const pitch = Math.asin(THREE.MathUtils.clamp(-direction.y, -1, 1));
  
  // Yaw (Y rotation): arm forward/back - based on Z component  
  // Ensure arms always rotate forward (positive Z)
  const horizontalDist = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
  const yaw = Math.atan2(Math.abs(direction.z), horizontalDist) * 0.6;
  
  // Roll (Z rotation): arm spread out from body - based on X component
  const sideSign = isLeftArm ? -1 : 1;
  const spread = Math.atan2(sideSign * direction.x, -direction.y);
  
  // Apply shoulder angle offset to pitch
  const adjustedPitch = pitch + shoulderAngle * 0.4;
  
  // Upper arm rotation
  const upperArmRotation = new THREE.Euler(
    adjustedPitch,
    yaw * (isLeftArm ? 1 : 1), // Same direction for both arms (forward)
    spread + (isLeftArm ? 0.1 : -0.1), // Slight natural offset
    'XYZ'
  );
  
  // Forearm rotation (elbow bend)
  const elbowBend = Math.PI - elbowAngle;
  const forearmRotation = new THREE.Euler(
    -elbowBend * 0.7, // Negative X = bend elbow
    0,
    0,
    'XYZ'
  );
  
  // Hand rotation (neutral for now, could be improved with palm orientation)
  const handRotation = new THREE.Euler(0, 0, 0, 'XYZ');
  
  return { upperArmRotation, forearmRotation, handRotation };
};

// Calculate wrist rotation from palm orientation
const calculateWristRotation = (
  landmarks: [number, number, number][],
  isLeftHand: boolean
): THREE.Euler => {
  const wrist = new THREE.Vector3(...landmarks[0]);
  const indexMCP = new THREE.Vector3(...landmarks[5]);
  const pinkyMCP = new THREE.Vector3(...landmarks[17]);
  const middleMCP = new THREE.Vector3(...landmarks[9]);
  
  // Palm direction vectors
  const palmForward = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
  const palmSide = new THREE.Vector3().subVectors(indexMCP, pinkyMCP).normalize();
  const palmNormal = new THREE.Vector3().crossVectors(palmForward, palmSide).normalize();
  
  // Convert to rotation
  const pitch = Math.atan2(palmNormal.y, Math.sqrt(palmNormal.x ** 2 + palmNormal.z ** 2)) * 0.5;
  const roll = Math.atan2(palmNormal.x, palmNormal.z) * 0.4 * (isLeftHand ? 1 : -1);
  
  return new THREE.Euler(pitch, 0, roll, 'XYZ');
};

// Mixamo Avatar Component
const MixamoAvatar = ({ frame }: Avatar3DProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const bonesRef = useRef<BoneRefs>({
    leftFingers: { thumb: {}, index: {}, middle: {}, ring: {}, pinky: {} },
    rightFingers: { thumb: {}, index: {}, middle: {}, ring: {}, pinky: {} },
  });
  const [isReady, setIsReady] = useState(false);
  
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
    
    // Build mapping for finger bones
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
    
    // Count found bones
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
  
  // Animation loop
  useFrame((state) => {
    // Gentle idle sway
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.02;
    }
    
    if (!isReady) return;
    
    const bones = bonesRef.current;
    const lerp = 0.25; // Slightly faster interpolation for responsiveness
    
    // Default relaxed arm position (arms straight down at sides)
    const relaxedArm = new THREE.Euler(0, 0, 0.05, 'XYZ');
    const relaxedForearm = new THREE.Euler(0, 0, 0, 'XYZ');
    
    // LEFT ARM
    if (frame && isHandVisible(frame.leftHand)) {
      const wrist = frame.leftHand[0];
      
      // Convert wrist position to 3D target
      const targetPos = landmarkTo3D(wrist[0], wrist[1], wrist[2], true);
      
      // Solve IK for arm
      const ik = solveArmIK(targetPos, true);
      
      // Calculate wrist rotation from palm
      const wristRot = calculateWristRotation(frame.leftHand, true);
      
      if (bones.leftArm) {
        bones.leftArm.rotation.x = THREE.MathUtils.lerp(bones.leftArm.rotation.x, ik.upperArmRotation.x, lerp);
        bones.leftArm.rotation.y = THREE.MathUtils.lerp(bones.leftArm.rotation.y, ik.upperArmRotation.y, lerp);
        bones.leftArm.rotation.z = THREE.MathUtils.lerp(bones.leftArm.rotation.z, ik.upperArmRotation.z, lerp);
      }
      
      if (bones.leftForeArm) {
        bones.leftForeArm.rotation.x = THREE.MathUtils.lerp(bones.leftForeArm.rotation.x, ik.forearmRotation.x, lerp);
      }
      
      if (bones.leftHand) {
        bones.leftHand.rotation.x = THREE.MathUtils.lerp(bones.leftHand.rotation.x, wristRot.x, lerp);
        bones.leftHand.rotation.z = THREE.MathUtils.lerp(bones.leftHand.rotation.z, wristRot.z, lerp);
      }
      
      // Apply finger animations
      applyFingerRotations(bones.leftFingers, frame.leftHand, true, lerp);
    } else {
      // Left arm relaxed position
      if (bones.leftArm) {
        bones.leftArm.rotation.x = THREE.MathUtils.lerp(bones.leftArm.rotation.x, relaxedArm.x, lerp);
        bones.leftArm.rotation.y = THREE.MathUtils.lerp(bones.leftArm.rotation.y, relaxedArm.y, lerp);
        bones.leftArm.rotation.z = THREE.MathUtils.lerp(bones.leftArm.rotation.z, relaxedArm.z, lerp);
      }
      if (bones.leftForeArm) {
        bones.leftForeArm.rotation.x = THREE.MathUtils.lerp(bones.leftForeArm.rotation.x, relaxedForearm.x, lerp);
      }
      if (bones.leftHand) {
        bones.leftHand.rotation.x = THREE.MathUtils.lerp(bones.leftHand.rotation.x, 0, lerp);
        bones.leftHand.rotation.z = THREE.MathUtils.lerp(bones.leftHand.rotation.z, 0, lerp);
      }
      
      // Reset fingers to relaxed position
      resetFingerBones(bones.leftFingers, lerp);
    }
    
    // RIGHT ARM
    if (frame && isHandVisible(frame.rightHand)) {
      const wrist = frame.rightHand[0];
      
      // Convert wrist position to 3D target
      const targetPos = landmarkTo3D(wrist[0], wrist[1], wrist[2], false);
      
      // Solve IK for arm
      const ik = solveArmIK(targetPos, false);
      
      // Calculate wrist rotation from palm
      const wristRot = calculateWristRotation(frame.rightHand, false);
      
      if (bones.rightArm) {
        bones.rightArm.rotation.x = THREE.MathUtils.lerp(bones.rightArm.rotation.x, ik.upperArmRotation.x, lerp);
        bones.rightArm.rotation.y = THREE.MathUtils.lerp(bones.rightArm.rotation.y, ik.upperArmRotation.y, lerp);
        bones.rightArm.rotation.z = THREE.MathUtils.lerp(bones.rightArm.rotation.z, -ik.upperArmRotation.z, lerp);
      }
      
      if (bones.rightForeArm) {
        bones.rightForeArm.rotation.x = THREE.MathUtils.lerp(bones.rightForeArm.rotation.x, ik.forearmRotation.x, lerp);
      }
      
      if (bones.rightHand) {
        bones.rightHand.rotation.x = THREE.MathUtils.lerp(bones.rightHand.rotation.x, wristRot.x, lerp);
        bones.rightHand.rotation.z = THREE.MathUtils.lerp(bones.rightHand.rotation.z, -wristRot.z, lerp);
      }
      
      // Apply finger animations
      applyFingerRotations(bones.rightFingers, frame.rightHand, false, lerp);
    } else {
      // Right arm relaxed position
      if (bones.rightArm) {
        bones.rightArm.rotation.x = THREE.MathUtils.lerp(bones.rightArm.rotation.x, relaxedArm.x, lerp);
        bones.rightArm.rotation.y = THREE.MathUtils.lerp(bones.rightArm.rotation.y, relaxedArm.y, lerp);
        bones.rightArm.rotation.z = THREE.MathUtils.lerp(bones.rightArm.rotation.z, -relaxedArm.z, lerp);
      }
      if (bones.rightForeArm) {
        bones.rightForeArm.rotation.x = THREE.MathUtils.lerp(bones.rightForeArm.rotation.x, relaxedForearm.x, lerp);
      }
      if (bones.rightHand) {
        bones.rightHand.rotation.x = THREE.MathUtils.lerp(bones.rightHand.rotation.x, 0, lerp);
        bones.rightHand.rotation.z = THREE.MathUtils.lerp(bones.rightHand.rotation.z, 0, lerp);
      }
      
      // Reset fingers to relaxed position
      resetFingerBones(bones.rightFingers, lerp);
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
