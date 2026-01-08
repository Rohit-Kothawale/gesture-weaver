import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { HandFrame, isHandVisible, normalizeCoordinates, HAND_CONNECTIONS } from '@/types/hand-data';

interface Avatar3DProps {
  frame: HandFrame | null;
}

// Mixamo bone names
const MIXAMO_BONES = {
  leftShoulder: ['LeftShoulder'],
  leftArm: ['LeftArm'],
  leftForeArm: ['LeftForeArm'],
  leftHand: ['LeftHand'],
  rightShoulder: ['RightShoulder'],
  rightArm: ['RightArm'],
  rightForeArm: ['RightForeArm'],
  rightHand: ['RightHand'],
  spine: ['Spine'],
  head: ['Head'],
};

interface BoneRefs {
  leftShoulder?: THREE.Bone;
  leftArm?: THREE.Bone;
  leftForeArm?: THREE.Bone;
  leftHand?: THREE.Bone;
  rightShoulder?: THREE.Bone;
  rightArm?: THREE.Bone;
  rightForeArm?: THREE.Bone;
  rightHand?: THREE.Bone;
  spine?: THREE.Bone;
  head?: THREE.Bone;
}

// Mixamo Avatar Component
const MixamoAvatar = ({ frame }: Avatar3DProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const bonesRef = useRef<BoneRefs>({});
  const [isReady, setIsReady] = useState(false);
  
  const { scene } = useGLTF('/models/mixamo-avatar.glb');
  
  // Calculate scale
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
  
  // Find bones directly on the scene (not a clone)
  useEffect(() => {
    const findBone = (names: string[]): THREE.Bone | undefined => {
      let found: THREE.Bone | undefined;
      scene.traverse((child) => {
        if (found) return;
        if ((child as THREE.Bone).isBone) {
          for (const name of names) {
            if (child.name === name) {
              found = child as THREE.Bone;
              return;
            }
          }
        }
      });
      return found;
    };
    
    bonesRef.current = {
      leftShoulder: findBone(MIXAMO_BONES.leftShoulder),
      leftArm: findBone(MIXAMO_BONES.leftArm),
      leftForeArm: findBone(MIXAMO_BONES.leftForeArm),
      leftHand: findBone(MIXAMO_BONES.leftHand),
      rightShoulder: findBone(MIXAMO_BONES.rightShoulder),
      rightArm: findBone(MIXAMO_BONES.rightArm),
      rightForeArm: findBone(MIXAMO_BONES.rightForeArm),
      rightHand: findBone(MIXAMO_BONES.rightHand),
      spine: findBone(MIXAMO_BONES.spine),
      head: findBone(MIXAMO_BONES.head),
    };
    
    const foundCount = Object.values(bonesRef.current).filter(b => b).length;
    console.log('Bones found:', foundCount, bonesRef.current);
    setIsReady(foundCount > 0);
  }, [scene]);
  
  // Animate bones based on hand landmarks
  useFrame((state) => {
    // Subtle idle sway
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.03;
    }
    
    if (!frame || !isReady) return;
    
    const bones = bonesRef.current;
    
    // Animate left arm based on left hand landmarks
    if (isHandVisible(frame.leftHand)) {
      const normalized = normalizeCoordinates(frame.leftHand);
      const wrist = normalized[0]; // Wrist position (0-1 range, centered)
      const middleFinger = normalized[9];
      
      // Convert normalized coords to arm angles
      // wrist[0] = x (left-right), wrist[1] = y (up-down), wrist[2] = z (forward-back)
      
      // Upper arm rotation
      if (bones.leftArm) {
        // Raise arm based on wrist Y position
        const raiseAngle = -(wrist[1] - 0.3) * 2.0; // More movement range
        // Spread arm based on wrist X position
        const spreadAngle = (wrist[0] + 0.3) * 1.5;
        
        bones.leftArm.rotation.x = THREE.MathUtils.lerp(bones.leftArm.rotation.x, raiseAngle, 0.15);
        bones.leftArm.rotation.z = THREE.MathUtils.lerp(bones.leftArm.rotation.z, spreadAngle, 0.15);
      }
      
      // Forearm rotation (elbow bend)
      if (bones.leftForeArm) {
        const bendAngle = -Math.max(0, (0.5 - wrist[1])) * 2.5; // Bend elbow when hand is lower
        const twistAngle = -wrist[2] * 0.8;
        
        bones.leftForeArm.rotation.x = THREE.MathUtils.lerp(bones.leftForeArm.rotation.x, bendAngle, 0.15);
        bones.leftForeArm.rotation.y = THREE.MathUtils.lerp(bones.leftForeArm.rotation.y, twistAngle, 0.15);
      }
      
      // Hand/wrist rotation
      if (bones.leftHand) {
        const handTiltX = (middleFinger[1] - wrist[1]) * 3;
        const handTiltZ = (middleFinger[0] - wrist[0]) * 3;
        
        bones.leftHand.rotation.x = THREE.MathUtils.lerp(bones.leftHand.rotation.x, handTiltX, 0.2);
        bones.leftHand.rotation.z = THREE.MathUtils.lerp(bones.leftHand.rotation.z, handTiltZ, 0.2);
      }
    }
    
    // Animate right arm based on right hand landmarks
    if (isHandVisible(frame.rightHand)) {
      const normalized = normalizeCoordinates(frame.rightHand);
      const wrist = normalized[0];
      const middleFinger = normalized[9];
      
      // Upper arm rotation
      if (bones.rightArm) {
        const raiseAngle = -(wrist[1] - 0.3) * 2.0;
        const spreadAngle = -(wrist[0] - 0.3) * 1.5; // Negative for right side
        
        bones.rightArm.rotation.x = THREE.MathUtils.lerp(bones.rightArm.rotation.x, raiseAngle, 0.15);
        bones.rightArm.rotation.z = THREE.MathUtils.lerp(bones.rightArm.rotation.z, spreadAngle, 0.15);
      }
      
      // Forearm rotation
      if (bones.rightForeArm) {
        const bendAngle = -Math.max(0, (0.5 - wrist[1])) * 2.5;
        const twistAngle = wrist[2] * 0.8;
        
        bones.rightForeArm.rotation.x = THREE.MathUtils.lerp(bones.rightForeArm.rotation.x, bendAngle, 0.15);
        bones.rightForeArm.rotation.y = THREE.MathUtils.lerp(bones.rightForeArm.rotation.y, twistAngle, 0.15);
      }
      
      // Hand rotation
      if (bones.rightHand) {
        const handTiltX = (middleFinger[1] - wrist[1]) * 3;
        const handTiltZ = -(middleFinger[0] - wrist[0]) * 3;
        
        bones.rightHand.rotation.x = THREE.MathUtils.lerp(bones.rightHand.rotation.x, handTiltX, 0.2);
        bones.rightHand.rotation.z = THREE.MathUtils.lerp(bones.rightHand.rotation.z, handTiltZ, 0.2);
      }
    }
  });
  
  return (
    <group ref={groupRef} position={[0, yOffset, 0]} scale={scale}>
      <primitive object={scene} />
    </group>
  );
};

// Procedural fallback components (kept for backup)
const BODY_OFFSET: [number, number, number] = [0, -0.8, 0];
const LEFT_SHOULDER: [number, number, number] = [-0.5, 0.75, 0];
const RIGHT_SHOULDER: [number, number, number] = [0.5, 0.75, 0];

const AvatarBody = () => (
  <group position={BODY_OFFSET}>
    <mesh position={[0, 1.6, 0]}>
      <sphereGeometry args={[0.25, 32, 32]} />
      <meshStandardMaterial color="#f5d0c5" roughness={0.8} />
    </mesh>
    <mesh position={[-0.08, 1.65, 0.2]}>
      <sphereGeometry args={[0.04, 16, 16]} />
      <meshStandardMaterial color="#2d3748" />
    </mesh>
    <mesh position={[0.08, 1.65, 0.2]}>
      <sphereGeometry args={[0.04, 16, 16]} />
      <meshStandardMaterial color="#2d3748" />
    </mesh>
    <mesh position={[0, 1.52, 0.22]}>
      <torusGeometry args={[0.06, 0.015, 8, 16, Math.PI]} />
      <meshStandardMaterial color="#d4726a" />
    </mesh>
    <mesh position={[0, 1.25, 0]}>
      <cylinderGeometry args={[0.08, 0.1, 0.15, 16]} />
      <meshStandardMaterial color="#f5d0c5" roughness={0.8} />
    </mesh>
    <mesh position={[0, 0.85, 0]}>
      <capsuleGeometry args={[0.3, 0.5, 8, 16]} />
      <meshStandardMaterial color="#4299e1" roughness={0.6} />
    </mesh>
    <mesh position={[-0.4, 1.05, 0]}>
      <sphereGeometry args={[0.1, 16, 16]} />
      <meshStandardMaterial color="#4299e1" roughness={0.6} />
    </mesh>
    <mesh position={[0.4, 1.05, 0]}>
      <sphereGeometry args={[0.1, 16, 16]} />
      <meshStandardMaterial color="#4299e1" roughness={0.6} />
    </mesh>
  </group>
);

const ArmSegment = ({ start, end, color, radius = 0.045 }: {
  start: [number, number, number];
  end: [number, number, number];
  color: string;
  radius?: number;
}) => {
  const startVec = new THREE.Vector3(...start);
  const endVec = new THREE.Vector3(...end);
  const midpoint = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
  const direction = new THREE.Vector3().subVectors(endVec, startVec);
  const length = direction.length();
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  
  return (
    <>
      <mesh position={start}>
        <sphereGeometry args={[radius * 1.2, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={midpoint} quaternion={quaternion}>
        <capsuleGeometry args={[radius, length - radius * 2, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </>
  );
};

const AvatarHandWithArm = ({ landmarks, color, isLeft, shoulderPos }: {
  landmarks: [number, number, number][];
  color: string;
  isLeft: boolean;
  shoulderPos: [number, number, number];
}) => {
  if (!isHandVisible(landmarks)) return null;
  
  const normalizedLandmarks = normalizeCoordinates(landmarks);
  const handScale = 0.8;
  const xOffset = isLeft ? -0.7 : 0.7;
  const yOffset = 0.2;
  const zOffset = 0.3;
  
  const scaledLandmarks: [number, number, number][] = normalizedLandmarks.map(([x, y, z]) => [
    x * handScale + xOffset,
    y * handScale + yOffset,
    z * handScale + zOffset
  ]);
  
  const wristPos = scaledLandmarks[0];
  const elbowPos: [number, number, number] = [
    (shoulderPos[0] + wristPos[0]) / 2 + (isLeft ? -0.1 : 0.1),
    (shoulderPos[1] + wristPos[1]) / 2 - 0.05,
    (shoulderPos[2] + wristPos[2]) / 2 + 0.15
  ];
  
  return (
    <group>
      <ArmSegment start={shoulderPos} end={elbowPos} color="#f5d0c5" radius={0.055} />
      <ArmSegment start={elbowPos} end={wristPos} color="#f5d0c5" radius={0.045} />
      
      {scaledLandmarks.map((pos, idx) => {
        const isFingertip = [4, 8, 12, 16, 20].includes(idx);
        const isWrist = idx === 0;
        return (
          <mesh key={idx} position={pos}>
            <sphereGeometry args={[isWrist ? 0.05 : isFingertip ? 0.035 : 0.025, 16, 16]} />
            <meshStandardMaterial 
              color={isFingertip ? "#ffffff" : isWrist ? "#f5d0c5" : color}
              emissive={isFingertip ? color : "#000000"}
              emissiveIntensity={isFingertip ? 0.5 : 0}
              roughness={0.3}
            />
          </mesh>
        );
      })}
      
      {HAND_CONNECTIONS.map(([start, end], idx) => {
        const startPos = new THREE.Vector3(...scaledLandmarks[start]);
        const endPos = new THREE.Vector3(...scaledLandmarks[end]);
        const midpoint = new THREE.Vector3().addVectors(startPos, endPos).multiplyScalar(0.5);
        const direction = new THREE.Vector3().subVectors(endPos, startPos);
        const length = direction.length();
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
        
        return (
          <mesh key={`conn-${idx}`} position={midpoint} quaternion={quaternion}>
            <cylinderGeometry args={[0.012, 0.012, length, 8]} />
            <meshStandardMaterial color={color} roughness={0.4} />
          </mesh>
        );
      })}
    </group>
  );
};

const ProceduralAvatar = ({ frame }: Avatar3DProps) => {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
    }
  });
  
  const leftShoulderAbs: [number, number, number] = [
    BODY_OFFSET[0] + LEFT_SHOULDER[0],
    BODY_OFFSET[1] + LEFT_SHOULDER[1],
    BODY_OFFSET[2] + LEFT_SHOULDER[2]
  ];
  const rightShoulderAbs: [number, number, number] = [
    BODY_OFFSET[0] + RIGHT_SHOULDER[0],
    BODY_OFFSET[1] + RIGHT_SHOULDER[1],
    BODY_OFFSET[2] + RIGHT_SHOULDER[2]
  ];
  
  return (
    <group ref={groupRef}>
      <AvatarBody />
      {frame && (
        <>
          <AvatarHandWithArm landmarks={frame.leftHand} color="#00d4ff" isLeft={true} shoulderPos={leftShoulderAbs} />
          <AvatarHandWithArm landmarks={frame.rightHand} color="#00ff88" isLeft={false} shoulderPos={rightShoulderAbs} />
        </>
      )}
    </group>
  );
};

// Main component
const Avatar3D = ({ frame }: Avatar3DProps) => {
  return <MixamoAvatar frame={frame} />;
};

useGLTF.preload('/models/mixamo-avatar.glb');

export default Avatar3D;
