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

// Convert normalized coordinates to 3D world position
// MUST match the normalizeCoordinates function in hand-data.ts for consistency
const landmarkTo3D = (x: number, y: number, z: number, scale: number = 1.5): THREE.Vector3 => {
  // Match the Hand3D normalizeCoordinates transform:
  // X: mirror and center (1 - x - 0.5)
  // Y: flip and center (1 - y - 0.5)  
  // Z: negative depth
  return new THREE.Vector3(
    (1 - x - 0.5) * scale,   // Same as Hand3D: mirror X
    (1 - y - 0.5) * scale,   // Same as Hand3D: flip Y
    -z * scale * 0.3         // Same direction as Hand3D, scaled down
  );
};

// Simple IK solver for arm (shoulder -> elbow -> wrist)
const solveArmIK = (
  targetPos: THREE.Vector3,
  isLeftArm: boolean,
  // Shoulder positions adjusted for avatar scale
  shoulderPos: THREE.Vector3 = new THREE.Vector3(isLeftArm ? -0.15 : 0.15, 0.3, 0),
  upperArmLength: number = 0.35,
  forearmLength: number = 0.30
) => {
  // Direction from shoulder to target
  const toTarget = new THREE.Vector3().subVectors(targetPos, shoulderPos);
  const distanceToTarget = toTarget.length();
  
  // Clamp distance to arm reach
  const maxReach = upperArmLength + forearmLength - 0.05;
  const minReach = Math.abs(upperArmLength - forearmLength) + 0.05;
  const clampedDistance = THREE.MathUtils.clamp(distanceToTarget, minReach, maxReach);
  
  // Normalize direction
  const direction = toTarget.normalize();
  
  // Calculate elbow angle using law of cosines
  const cosElbowAngle = (upperArmLength * upperArmLength + forearmLength * forearmLength - clampedDistance * clampedDistance) 
    / (2 * upperArmLength * forearmLength);
  const elbowAngle = Math.acos(THREE.MathUtils.clamp(cosElbowAngle, -1, 1));
  
  // Calculate shoulder angle to target
  const cosShoulder = (upperArmLength * upperArmLength + clampedDistance * clampedDistance - forearmLength * forearmLength)
    / (2 * upperArmLength * clampedDistance);
  const shoulderOffset = Math.acos(THREE.MathUtils.clamp(cosShoulder, -1, 1));
  
  // Calculate rotation angles based on direction to target
  // X rotation (pitch): arm up/down
  // Y rotation (yaw): arm forward/back twist
  // Z rotation (roll): arm spread in/out from body
  
  const armPitch = Math.asin(THREE.MathUtils.clamp(-direction.y, -1, 1)); // Negative Y = arm up
  const armYaw = Math.atan2(-direction.z, Math.abs(direction.x) + 0.01); // Z controls forward
  
  // Arm spread based on X direction
  const armSpread = isLeftArm 
    ? Math.atan2(-direction.x, -direction.y) + Math.PI * 0.5  // Left arm spreads with negative X
    : Math.atan2(direction.x, -direction.y) - Math.PI * 0.5;  // Right arm spreads with positive X
  
  return {
    armRotation: {
      x: armPitch - shoulderOffset * 0.5,
      y: armYaw * 0.5,
      z: armSpread
    },
    elbowBend: Math.PI - elbowAngle,
    reachRatio: clampedDistance / maxReach
  };
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
    const lerp = 0.2;
    
    // Default relaxed arm position (arms straight down at sides)
    const relaxedArmX = 0;     // No forward tilt - straight down
    const relaxedArmZ = 0.05;  // Very close to body
    const relaxedForearmX = 0; // Straight forearm
    const relaxedHandX = 0;    // Neutral hand
    
    // LEFT ARM
    if (frame && isHandVisible(frame.leftHand)) {
      const pose = calculateHandPose(frame.leftHand);
      const wrist = frame.leftHand[0];
      
      // Convert wrist position to 3D target
      const targetPos = landmarkTo3D(wrist[0], wrist[1], wrist[2], 1.5);
      
      // Solve IK for arm
      const ik = solveArmIK(targetPos, true);
      
      if (bones.leftArm) {
        bones.leftArm.rotation.x = THREE.MathUtils.lerp(
          bones.leftArm.rotation.x, 
          ik.armRotation.x, 
          lerp
        );
        bones.leftArm.rotation.z = THREE.MathUtils.lerp(
          bones.leftArm.rotation.z, 
          ik.armRotation.z, 
          lerp
        );
        bones.leftArm.rotation.y = THREE.MathUtils.lerp(
          bones.leftArm.rotation.y, 
          ik.armRotation.y, 
          lerp
        );
      }
      
      if (bones.leftForeArm) {
        bones.leftForeArm.rotation.x = THREE.MathUtils.lerp(
          bones.leftForeArm.rotation.x, 
          -ik.elbowBend * 0.8, 
          lerp
        );
      }
      
      // Hand rotation from palm orientation
      if (bones.leftHand) {
        const palmPitch = Math.atan2(pose.palmNormal.y, pose.palmNormal.z);
        const palmRoll = Math.atan2(pose.palmNormal.x, pose.palmNormal.z);
        
        bones.leftHand.rotation.x = THREE.MathUtils.lerp(
          bones.leftHand.rotation.x, 
          palmPitch * 0.5, 
          lerp
        );
        bones.leftHand.rotation.z = THREE.MathUtils.lerp(
          bones.leftHand.rotation.z, 
          palmRoll * 0.5, 
          lerp
        );
      }
    } else {
      // Left arm relaxed position
      if (bones.leftArm) {
        bones.leftArm.rotation.x = THREE.MathUtils.lerp(bones.leftArm.rotation.x, relaxedArmX, lerp);
        bones.leftArm.rotation.z = THREE.MathUtils.lerp(bones.leftArm.rotation.z, relaxedArmZ, lerp);
        bones.leftArm.rotation.y = THREE.MathUtils.lerp(bones.leftArm.rotation.y, 0, lerp);
      }
      if (bones.leftForeArm) {
        bones.leftForeArm.rotation.x = THREE.MathUtils.lerp(bones.leftForeArm.rotation.x, relaxedForearmX, lerp);
      }
      if (bones.leftHand) {
        bones.leftHand.rotation.x = THREE.MathUtils.lerp(bones.leftHand.rotation.x, 0, lerp);
        bones.leftHand.rotation.z = THREE.MathUtils.lerp(bones.leftHand.rotation.z, 0, lerp);
      }
    }
    
    // RIGHT ARM
    if (frame && isHandVisible(frame.rightHand)) {
      const pose = calculateHandPose(frame.rightHand);
      const wrist = frame.rightHand[0];
      
      // Convert wrist position to 3D target
      const targetPos = landmarkTo3D(wrist[0], wrist[1], wrist[2], 1.5);
      
      // Solve IK for arm
      const ik = solveArmIK(targetPos, false);
      
      if (bones.rightArm) {
        bones.rightArm.rotation.x = THREE.MathUtils.lerp(
          bones.rightArm.rotation.x, 
          ik.armRotation.x, 
          lerp
        );
        bones.rightArm.rotation.z = THREE.MathUtils.lerp(
          bones.rightArm.rotation.z, 
          -ik.armRotation.z, 
          lerp
        );
        bones.rightArm.rotation.y = THREE.MathUtils.lerp(
          bones.rightArm.rotation.y, 
          -ik.armRotation.y, 
          lerp
        );
      }
      
      if (bones.rightForeArm) {
        bones.rightForeArm.rotation.x = THREE.MathUtils.lerp(
          bones.rightForeArm.rotation.x, 
          -ik.elbowBend * 0.8, 
          lerp
        );
      }
      
      // Hand rotation from palm orientation
      if (bones.rightHand) {
        const palmPitch = Math.atan2(pose.palmNormal.y, pose.palmNormal.z);
        const palmRoll = Math.atan2(pose.palmNormal.x, pose.palmNormal.z);
        
        bones.rightHand.rotation.x = THREE.MathUtils.lerp(
          bones.rightHand.rotation.x, 
          palmPitch * 0.5, 
          lerp
        );
        bones.rightHand.rotation.z = THREE.MathUtils.lerp(
          bones.rightHand.rotation.z, 
          -palmRoll * 0.5, 
          lerp
        );
      }
    } else {
      // Right arm relaxed position
      if (bones.rightArm) {
        bones.rightArm.rotation.x = THREE.MathUtils.lerp(bones.rightArm.rotation.x, relaxedArmX, lerp);
        bones.rightArm.rotation.z = THREE.MathUtils.lerp(bones.rightArm.rotation.z, -relaxedArmZ, lerp);
        bones.rightArm.rotation.y = THREE.MathUtils.lerp(bones.rightArm.rotation.y, 0, lerp);
      }
      if (bones.rightForeArm) {
        bones.rightForeArm.rotation.x = THREE.MathUtils.lerp(bones.rightForeArm.rotation.x, relaxedForearmX, lerp);
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
