import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { HandFrame, isHandVisible } from '@/types/hand-data';

interface Avatar3DProps {
  frame: HandFrame | null;
}

interface BoneRefs {
  leftShoulder?: THREE.Bone;
  leftArm?: THREE.Bone;
  leftForeArm?: THREE.Bone;
  leftHand?: THREE.Bone;
  rightShoulder?: THREE.Bone;
  rightArm?: THREE.Bone;
  rightForeArm?: THREE.Bone;
  rightHand?: THREE.Bone;
}

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
  
  const scale = AVATAR_CONFIG.handReachScale;
  
  // Mirror X so left in camera = left on avatar (when facing camera)
  const avatarX = (0.5 - x) * scale;
  
  // Flip Y - camera Y goes down, avatar Y goes up
  // Map to reasonable arm reach range
  const avatarY = (0.5 - y) * scale * 0.8;
  
  // Z: Always keep hands in front. Use camera depth for relative positioning only
  // Clamp depth influence to prevent hands going behind body
  const depthInfluence = Math.max(0, -z) * 0.15; // Only use negative z (closer to camera)
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
  const bonesRef = useRef<BoneRefs>({});
  const [isReady, setIsReady] = useState(false);
  
  const { scene } = useGLTF('/models/mixamo-avatar.glb');
  
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
    scene.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        const bone = child as THREE.Bone;
        if (bone.name === 'LeftShoulder') bonesRef.current.leftShoulder = bone;
        if (bone.name === 'LeftArm') bonesRef.current.leftArm = bone;
        if (bone.name === 'LeftForeArm') bonesRef.current.leftForeArm = bone;
        if (bone.name === 'LeftHand') bonesRef.current.leftHand = bone;
        if (bone.name === 'RightShoulder') bonesRef.current.rightShoulder = bone;
        if (bone.name === 'RightArm') bonesRef.current.rightArm = bone;
        if (bone.name === 'RightForeArm') bonesRef.current.rightForeArm = bone;
        if (bone.name === 'RightHand') bonesRef.current.rightHand = bone;
      }
    });
    
    const count = Object.values(bonesRef.current).filter(Boolean).length;
    console.log('Found', count, 'arm bones');
    setIsReady(count > 0);
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

useGLTF.preload('/models/mixamo-avatar.glb');

export default Avatar3D;
