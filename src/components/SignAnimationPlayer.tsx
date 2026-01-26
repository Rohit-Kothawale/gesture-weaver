import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { SignAnimationData, SignKeypoints, KEYPOINT_TO_BONE } from '@/types/sign-animation';

interface SignAnimationPlayerProps {
  animationData: SignAnimationData | null;
  isPlaying: boolean;
  fps?: number;
  loop?: boolean;
  onFrameChange?: (frameIndex: number) => void;
}

const SignAnimationPlayer = ({ 
  animationData, 
  isPlaying, 
  fps = 10,
  loop = true,
  onFrameChange 
}: SignAnimationPlayerProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const bonesRef = useRef<Map<string, THREE.Bone>>(new Map());
  const [isReady, setIsReady] = useState(false);
  const frameRef = useRef(0);
  const timeRef = useRef(0);
  
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
  
  // Find all bones on mount
  useEffect(() => {
    const boneMap = new Map<string, THREE.Bone>();
    
    scene.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        const bone = child as THREE.Bone;
        boneMap.set(bone.name, bone);
      }
    });
    
    bonesRef.current = boneMap;
    console.log('SignAnimationPlayer: Found', boneMap.size, 'bones');
    setIsReady(boneMap.size > 0);
  }, [scene]);
  
  // Apply keypoints to bones
  const applyKeypoints = (keypoints: SignKeypoints, lerp: number) => {
    const bones = bonesRef.current;
    
    for (const [keypointName, rotation] of Object.entries(keypoints)) {
      const boneName = KEYPOINT_TO_BONE[keypointName];
      if (!boneName) continue;
      
      const bone = bones.get(boneName);
      if (!bone || !rotation) continue;
      
      // Apply rotation with lerp for smooth transitions
      bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, rotation.x, lerp);
      bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, rotation.y, lerp);
      bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, rotation.z, lerp);
    }
  };
  
  // Animation loop
  useFrame((_, delta) => {
    if (!isReady || !animationData || !isPlaying) return;
    
    const frames = animationData.landmark;
    if (frames.length === 0) return;
    
    // Advance time
    timeRef.current += delta;
    const frameDuration = 1 / fps;
    
    // Check if we need to advance to next frame
    if (timeRef.current >= frameDuration) {
      timeRef.current = 0;
      frameRef.current++;
      
      if (frameRef.current >= frames.length) {
        if (loop) {
          frameRef.current = 0;
        } else {
          frameRef.current = frames.length - 1;
        }
      }
      
      onFrameChange?.(frameRef.current);
    }
    
    // Get current frame and apply
    const currentFrame = frames[frameRef.current];
    if (currentFrame?.keypoints) {
      applyKeypoints(currentFrame.keypoints, 0.3);
    }
  });
  
  // Reset frame when animation data changes
  useEffect(() => {
    frameRef.current = 0;
    timeRef.current = 0;
  }, [animationData]);
  
  return (
    <group ref={groupRef} position={[0, yOffset, 0]} scale={scale}>
      <primitive object={scene} />
    </group>
  );
};

export default SignAnimationPlayer;
