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
    
    if (!frame || !isReady) return;
    
    const bones = bonesRef.current;
    const lerp = 0.15;
    
    // LEFT ARM animation
    // Raw landmarks: x, y, z in range 0-1
    // x: 0 = right side of frame, 1 = left side
    // y: 0 = top of frame, 1 = bottom
    // For "Happy" sign: hands start low (y~0.9) and move up (y decreases)
    if (isHandVisible(frame.leftHand)) {
      const wrist = frame.leftHand[0]; // Raw wrist [x, y, z]
      const middleFinger = frame.leftHand[9];
      
      // Convert raw coords to arm movements
      // Y: 0.9 = hands down (arms down), 0.3 = hands up (arms raised)
      // Map Y position to arm raise angle
      // When y is high (~0.9), arm should be down. When y is low (~0.3), arm should be raised
      const armRaise = (1.0 - wrist[1]) * 2.5 - 0.5; // Higher Y = lower arm
      
      // X position: how far from body center
      // Left hand x ~0.6 means it's toward the left side
      const armSpread = (wrist[0] - 0.5) * 1.5 + 0.5; // Spread based on X
      
      // Forward/back from Z
      const armForward = wrist[2] * 0.5;
      
      if (bones.leftArm) {
        bones.leftArm.rotation.x = THREE.MathUtils.lerp(bones.leftArm.rotation.x, -armRaise, lerp);
        bones.leftArm.rotation.z = THREE.MathUtils.lerp(bones.leftArm.rotation.z, armSpread, lerp);
        bones.leftArm.rotation.y = THREE.MathUtils.lerp(bones.leftArm.rotation.y, armForward, lerp);
      }
      
      // Elbow bend - bend more when arm is raised
      if (bones.leftForeArm) {
        const elbowBend = Math.max(0, armRaise * 0.6);
        bones.leftForeArm.rotation.x = THREE.MathUtils.lerp(bones.leftForeArm.rotation.x, -elbowBend, lerp);
      }
      
      // Hand/wrist rotation based on finger direction
      if (bones.leftHand && middleFinger) {
        const handDirY = (middleFinger[1] - wrist[1]) * 3;
        const handDirX = (middleFinger[0] - wrist[0]) * 3;
        bones.leftHand.rotation.x = THREE.MathUtils.lerp(bones.leftHand.rotation.x, -handDirY, lerp);
        bones.leftHand.rotation.z = THREE.MathUtils.lerp(bones.leftHand.rotation.z, handDirX, lerp);
      }
    }
    
    // RIGHT ARM animation
    if (isHandVisible(frame.rightHand)) {
      const wrist = frame.rightHand[0];
      const middleFinger = frame.rightHand[9];
      
      // Same Y mapping for arm raise
      const armRaise = (1.0 - wrist[1]) * 2.5 - 0.5;
      
      // X position - right hand x ~0.4 means it's toward the right side
      // Negative spread for right arm (mirrors left arm)
      const armSpread = -(0.5 - wrist[0]) * 1.5 - 0.5;
      
      const armForward = -wrist[2] * 0.5;
      
      if (bones.rightArm) {
        bones.rightArm.rotation.x = THREE.MathUtils.lerp(bones.rightArm.rotation.x, -armRaise, lerp);
        bones.rightArm.rotation.z = THREE.MathUtils.lerp(bones.rightArm.rotation.z, armSpread, lerp);
        bones.rightArm.rotation.y = THREE.MathUtils.lerp(bones.rightArm.rotation.y, armForward, lerp);
      }
      
      if (bones.rightForeArm) {
        const elbowBend = Math.max(0, armRaise * 0.6);
        bones.rightForeArm.rotation.x = THREE.MathUtils.lerp(bones.rightForeArm.rotation.x, -elbowBend, lerp);
      }
      
      if (bones.rightHand && middleFinger) {
        const handDirY = (middleFinger[1] - wrist[1]) * 3;
        const handDirX = (middleFinger[0] - wrist[0]) * 3;
        bones.rightHand.rotation.x = THREE.MathUtils.lerp(bones.rightHand.rotation.x, -handDirY, lerp);
        bones.rightHand.rotation.z = THREE.MathUtils.lerp(bones.rightHand.rotation.z, -handDirX, lerp);
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
