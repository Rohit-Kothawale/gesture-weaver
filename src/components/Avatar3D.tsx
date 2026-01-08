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
    // Coordinates after camera mirror fix: x 0=left, 1=right, y 0=top, 1=bottom
    if (isHandVisible(frame.leftHand)) {
      const wrist = frame.leftHand[0];
      const middleFinger = frame.leftHand[9];
      
      // Y position controls arm raise: y=1 (bottom) = arm down, y=0 (top) = arm up
      const yNorm = 1.0 - wrist[1]; // Invert so 0=down, 1=up
      const armRaise = yNorm * Math.PI * 0.7 - 0.3; // Map to rotation range
      
      // X position controls spread: for left hand, x closer to 0 = arm closer to body
      // x closer to 0.5+ = arm spread out
      const xNorm = wrist[0]; // 0=left edge, 0.5=center, 1=right edge  
      const armSpread = (0.5 - xNorm) * Math.PI * 0.5; // Spread outward for left arm
      
      // Z controls forward/back tilt
      const armForward = wrist[2] * 0.3;
      
      if (bones.leftArm) {
        bones.leftArm.rotation.x = THREE.MathUtils.lerp(bones.leftArm.rotation.x, -armRaise, lerp);
        bones.leftArm.rotation.z = THREE.MathUtils.lerp(bones.leftArm.rotation.z, armSpread + 0.3, lerp);
        bones.leftArm.rotation.y = THREE.MathUtils.lerp(bones.leftArm.rotation.y, armForward, lerp);
      }
      
      // Elbow naturally bends when arm is raised
      if (bones.leftForeArm) {
        const elbowBend = Math.max(0, yNorm * 0.8);
        bones.leftForeArm.rotation.x = THREE.MathUtils.lerp(bones.leftForeArm.rotation.x, -elbowBend, lerp);
      }
      
      // Wrist rotation based on finger direction
      if (bones.leftHand && middleFinger) {
        const handTiltX = (middleFinger[1] - wrist[1]) * 2;
        const handTiltZ = (middleFinger[0] - wrist[0]) * 2;
        bones.leftHand.rotation.x = THREE.MathUtils.lerp(bones.leftHand.rotation.x, -handTiltX, lerp);
        bones.leftHand.rotation.z = THREE.MathUtils.lerp(bones.leftHand.rotation.z, handTiltZ, lerp);
      }
    }
    
    // RIGHT ARM animation (mirror of left arm logic)
    if (isHandVisible(frame.rightHand)) {
      const wrist = frame.rightHand[0];
      const middleFinger = frame.rightHand[9];
      
      // Y position controls arm raise
      const yNorm = 1.0 - wrist[1];
      const armRaise = yNorm * Math.PI * 0.7 - 0.3;
      
      // X position: for right hand, x closer to 1 = arm closer to body
      // x closer to 0.5- = arm spread out
      const xNorm = wrist[0];
      const armSpread = (xNorm - 0.5) * Math.PI * 0.5; // Spread outward for right arm (negative Z)
      
      const armForward = -wrist[2] * 0.3;
      
      if (bones.rightArm) {
        bones.rightArm.rotation.x = THREE.MathUtils.lerp(bones.rightArm.rotation.x, -armRaise, lerp);
        bones.rightArm.rotation.z = THREE.MathUtils.lerp(bones.rightArm.rotation.z, -armSpread - 0.3, lerp);
        bones.rightArm.rotation.y = THREE.MathUtils.lerp(bones.rightArm.rotation.y, armForward, lerp);
      }
      
      if (bones.rightForeArm) {
        const elbowBend = Math.max(0, yNorm * 0.8);
        bones.rightForeArm.rotation.x = THREE.MathUtils.lerp(bones.rightForeArm.rotation.x, -elbowBend, lerp);
      }
      
      if (bones.rightHand && middleFinger) {
        const handTiltX = (middleFinger[1] - wrist[1]) * 2;
        const handTiltZ = (middleFinger[0] - wrist[0]) * 2;
        bones.rightHand.rotation.x = THREE.MathUtils.lerp(bones.rightHand.rotation.x, -handTiltX, lerp);
        bones.rightHand.rotation.z = THREE.MathUtils.lerp(bones.rightHand.rotation.z, -handTiltZ, lerp);
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
