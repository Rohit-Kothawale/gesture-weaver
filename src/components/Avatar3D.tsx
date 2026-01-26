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

// ============================================================
// DIRECT POSITION MAPPING (MediaPipe landmarks → Bone positions)
// ============================================================

// Viewport configuration for coordinate conversion
const VIEWPORT_CONFIG = {
  // Convert MediaPipe 0-1 to Three.js world coordinates
  xRange: 3.0,  // -1.5 to 1.5 in world units
  yRange: 3.0,  // -1.5 to 1.5 in world units  
  zRange: 0.5,  // depth range (smaller for 2D-like stability)
  // Hand positioning offsets
  handOffsetY: 0.3, // Offset to position hands at upper body level
};

// Finger tip landmark indices (MediaPipe)
const FINGER_TIP_LANDMARKS = {
  thumb: 4,
  index: 8,
  middle: 12,
  ring: 16,
  pinky: 20,
};

// Finger base landmark indices (MCP/CMC joints)
const FINGER_BASE_LANDMARKS = {
  thumb: 1,
  index: 5,
  middle: 9,
  ring: 13,
  pinky: 17,
};

// Complete finger landmark mapping for hierarchical positioning
// [MCP/CMC, PIP/MCP, DIP/IP, TIP]
const FINGER_JOINT_LANDMARKS = {
  thumb: [1, 2, 3, 4],     // CMC, MCP, IP, TIP
  index: [5, 6, 7, 8],     // MCP, PIP, DIP, TIP
  middle: [9, 10, 11, 12], // MCP, PIP, DIP, TIP
  ring: [13, 14, 15, 16],  // MCP, PIP, DIP, TIP
  pinky: [17, 18, 19, 20], // MCP, PIP, DIP, TIP
};

// Convert MediaPipe normalized coordinates (0-1) to Three.js world coordinates
// Screen mirroring: user's right hand → avatar's right hand (no X flip)
const mediapipeToWorld = (
  x: number, 
  y: number, 
  z: number,
  handScale: number = 1.0
): THREE.Vector3 => {
  // X: MediaPipe 0-1 → Three.js world coordinates
  // Screen mirroring: no flip needed
  const worldX = (x - 0.5) * VIEWPORT_CONFIG.xRange * handScale;
  
  // Y: MediaPipe 0 (top) to 1 (bottom) → Three.js positive (up) to negative (down)
  const worldY = (0.5 - y) * VIEWPORT_CONFIG.yRange * handScale + VIEWPORT_CONFIG.handOffsetY;
  
  // Z: MediaPipe z is negative when closer to camera
  const worldZ = -z * VIEWPORT_CONFIG.zRange * handScale + 0.3;
  
  return new THREE.Vector3(worldX, worldY, worldZ);
};

// Calculate dynamic hand scale based on distance between wrist (0) and middle finger base (9)
const calculateHandScale = (landmarks: [number, number, number][]): number => {
  if (!landmarks || landmarks.length < 10) return 1.0;
  
  const wrist = landmarks[0];
  const middleBase = landmarks[9];
  
  // Calculate 2D distance (ignore z for more stable scaling)
  const dx = middleBase[0] - wrist[0];
  const dy = middleBase[1] - wrist[1];
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Normalize: typical palm length is about 0.15-0.25 in MediaPipe normalized coords
  const baseDistance = 0.18;
  const scale = distance / baseDistance;
  
  // Clamp to prevent extreme scaling
  return THREE.MathUtils.clamp(scale, 0.5, 2.0);
};

// Helper: Convert world position to bone's local space (relative to parent)
const worldToLocalBonePosition = (
  bone: THREE.Bone,
  worldPos: THREE.Vector3
): THREE.Vector3 => {
  if (!bone.parent) return worldPos.clone();
  
  // Update parent's world matrix
  bone.parent.updateWorldMatrix(true, false);
  
  // Get parent's inverse world matrix
  const parentInverse = new THREE.Matrix4().copy(bone.parent.matrixWorld).invert();
  
  // Transform world position to parent's local space
  return worldPos.clone().applyMatrix4(parentInverse);
};

// =============================================================
// HIERARCHICAL POSITION MAPPING
// Position bones in order: Wrist → Knuckles → Tips
// =============================================================

const applyDirectPositionMapping = (
  handBone: THREE.Bone | undefined,
  fingerBones: HandBones,
  landmarks: [number, number, number][],
  handScale: number,
  lerp: number
) => {
  if (!handBone || !landmarks || landmarks.length < 21) return;

  // ============================================
  // STEP 1: Position the Wrist (Hand bone) first
  // ============================================
  const wristLandmark = landmarks[0];
  const targetWristWorldPos = mediapipeToWorld(
    wristLandmark[0], 
    wristLandmark[1], 
    wristLandmark[2],
    handScale
  );

  // Convert to local space and apply
  const wristLocalPos = worldToLocalBonePosition(handBone, targetWristWorldPos);
  handBone.position.lerp(wristLocalPos, lerp);
  
  // Update hand bone's world matrix after positioning
  handBone.updateWorldMatrix(true, false);

  // ============================================
  // STEP 2: Iterate through fingers - position each joint hierarchically
  // ============================================
  const fingers = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const;
  
  for (const fingerName of fingers) {
    const jointIndices = FINGER_JOINT_LANDMARKS[fingerName];
    const bones = fingerBones[fingerName];
    
    // Get all joint positions in world space
    const jointWorldPositions: THREE.Vector3[] = jointIndices.map(idx => {
      const lm = landmarks[idx];
      return mediapipeToWorld(lm[0], lm[1], lm[2], handScale);
    });

    // Position PROXIMAL bone (knuckle) - parent is hand bone
    if (bones.proximal) {
      const targetPos = jointWorldPositions[0]; // MCP/CMC position
      const localPos = worldToLocalBonePosition(bones.proximal, targetPos);
      bones.proximal.position.lerp(localPos, lerp);
      
      // Calculate rotation to point toward next joint
      const nextPos = jointWorldPositions[1];
      const direction = new THREE.Vector3().subVectors(nextPos, targetPos).normalize();
      
      // Convert direction to rotation
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
      const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
      
      // Apply rotation with lerp
      bones.proximal.rotation.x = THREE.MathUtils.lerp(bones.proximal.rotation.x, euler.x, lerp);
      bones.proximal.rotation.y = THREE.MathUtils.lerp(bones.proximal.rotation.y, euler.y, lerp);
      bones.proximal.rotation.z = THREE.MathUtils.lerp(bones.proximal.rotation.z, euler.z, lerp);
      
      // Update matrix for child bones
      bones.proximal.updateWorldMatrix(true, false);
    }

    // Position INTERMEDIATE bone (middle phalanx) - parent is proximal
    if (bones.intermediate) {
      const targetPos = jointWorldPositions[1]; // PIP/MCP position
      const localPos = worldToLocalBonePosition(bones.intermediate, targetPos);
      bones.intermediate.position.lerp(localPos, lerp);
      
      // Calculate rotation to point toward next joint
      const nextPos = jointWorldPositions[2];
      const direction = new THREE.Vector3().subVectors(nextPos, targetPos).normalize();
      
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
      const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
      
      bones.intermediate.rotation.x = THREE.MathUtils.lerp(bones.intermediate.rotation.x, euler.x, lerp);
      bones.intermediate.rotation.y = THREE.MathUtils.lerp(bones.intermediate.rotation.y, euler.y, lerp);
      bones.intermediate.rotation.z = THREE.MathUtils.lerp(bones.intermediate.rotation.z, euler.z, lerp);
      
      bones.intermediate.updateWorldMatrix(true, false);
    }

    // Position DISTAL bone (fingertip) - parent is intermediate
    if (bones.distal) {
      const targetPos = jointWorldPositions[2]; // DIP/IP position
      const localPos = worldToLocalBonePosition(bones.distal, targetPos);
      bones.distal.position.lerp(localPos, lerp);
      
      // Calculate rotation to point toward tip
      const tipPos = jointWorldPositions[3];
      const direction = new THREE.Vector3().subVectors(tipPos, targetPos).normalize();
      
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
      const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
      
      bones.distal.rotation.x = THREE.MathUtils.lerp(bones.distal.rotation.x, euler.x, lerp);
      bones.distal.rotation.y = THREE.MathUtils.lerp(bones.distal.rotation.y, euler.y, lerp);
      bones.distal.rotation.z = THREE.MathUtils.lerp(bones.distal.rotation.z, euler.z, lerp);
    }
  }

  // ============================================
  // STEP 3: Apply overall hand/palm rotation
  // ============================================
  const indexMCP = new THREE.Vector3(...landmarks[5]);
  const pinkyMCP = new THREE.Vector3(...landmarks[17]);
  const middleMCP = new THREE.Vector3(...landmarks[9]);
  const wrist = new THREE.Vector3(...landmarks[0]);

  // Palm vectors in MediaPipe space (with Y flipped)
  const palmForward = new THREE.Vector3(
    middleMCP.x - wrist.x,
    -(middleMCP.y - wrist.y),
    middleMCP.z - wrist.z
  ).normalize();

  const palmSide = new THREE.Vector3(
    indexMCP.x - pinkyMCP.x,
    -(indexMCP.y - pinkyMCP.y),
    indexMCP.z - pinkyMCP.z
  ).normalize();

  // Calculate rotation from palm orientation
  const palmPitch = Math.atan2(palmForward.y, Math.sqrt(palmForward.x ** 2 + palmForward.z ** 2));
  const palmRoll = Math.atan2(palmSide.y, palmSide.x);

  // Apply hand rotation with lerping
  handBone.rotation.x = THREE.MathUtils.lerp(handBone.rotation.x, palmPitch * 0.5, lerp);
  handBone.rotation.z = THREE.MathUtils.lerp(handBone.rotation.z, palmRoll * 0.3, lerp);
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
  
  // Animation loop - DIRECT POSITION MAPPING
  useFrame((state) => {
    // Disable idle sway for stable 2D-like view
    // if (groupRef.current) {
    //   groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.02;
    // }
    
    if (!isReady) return;
    
    const bones = bonesRef.current;
    const lerp = 0.3; // Faster interpolation for responsive direct mapping
    
    // LEFT HAND - Direct position mapping
    if (frame && isHandVisible(frame.leftHand)) {
      // Calculate dynamic hand scale from wrist-to-middle-base distance
      const handScale = calculateHandScale(frame.leftHand);
      
      // Apply direct position mapping (landmark 0 → hand bone position)
      applyDirectPositionMapping(
        bones.leftHand,
        bones.leftFingers,
        frame.leftHand,
        handScale,
        lerp
      );
    } else {
      // Reset hand position and fingers when not visible
      if (bones.leftHand) {
        bones.leftHand.rotation.x = THREE.MathUtils.lerp(bones.leftHand.rotation.x, 0, lerp);
        bones.leftHand.rotation.z = THREE.MathUtils.lerp(bones.leftHand.rotation.z, 0, lerp);
      }
      resetFingerBones(bones.leftFingers, lerp);
    }
    
    // RIGHT HAND - Direct position mapping  
    if (frame && isHandVisible(frame.rightHand)) {
      // Calculate dynamic hand scale from wrist-to-middle-base distance
      const handScale = calculateHandScale(frame.rightHand);
      
      // Apply direct position mapping (landmark 0 → hand bone position)
      applyDirectPositionMapping(
        bones.rightHand,
        bones.rightFingers,
        frame.rightHand,
        handScale,
        lerp
      );
    } else {
      // Reset hand position and fingers when not visible
      if (bones.rightHand) {
        bones.rightHand.rotation.x = THREE.MathUtils.lerp(bones.rightHand.rotation.x, 0, lerp);
        bones.rightHand.rotation.z = THREE.MathUtils.lerp(bones.rightHand.rotation.z, 0, lerp);
      }
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
