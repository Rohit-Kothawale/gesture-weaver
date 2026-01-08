import { useRef, useEffect, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { HandFrame, isHandVisible, normalizeCoordinates, HAND_CONNECTIONS } from '@/types/hand-data';

interface Avatar3DProps {
  frame: HandFrame | null;
}

// Mixamo bone names (standardized naming convention)
const MIXAMO_BONES = {
  // Left arm chain
  leftShoulder: ['LeftShoulder', 'mixamorig:LeftShoulder', 'mixamorig1LeftShoulder'],
  leftArm: ['LeftArm', 'mixamorig:LeftArm', 'mixamorig1LeftArm'],
  leftForeArm: ['LeftForeArm', 'mixamorig:LeftForeArm', 'mixamorig1LeftForeArm'],
  leftHand: ['LeftHand', 'mixamorig:LeftHand', 'mixamorig1LeftHand'],
  // Right arm chain  
  rightShoulder: ['RightShoulder', 'mixamorig:RightShoulder', 'mixamorig1RightShoulder'],
  rightArm: ['RightArm', 'mixamorig:RightArm', 'mixamorig1RightArm'],
  rightForeArm: ['RightForeArm', 'mixamorig:RightForeArm', 'mixamorig1RightForeArm'],
  rightHand: ['RightHand', 'mixamorig:RightHand', 'mixamorig1RightHand'],
  // Spine
  spine: ['Spine', 'mixamorig:Spine', 'mixamorig1Spine'],
  spine1: ['Spine1', 'mixamorig:Spine1', 'mixamorig1Spine1'],
  spine2: ['Spine2', 'mixamorig:Spine2', 'mixamorig1Spine2'],
  head: ['Head', 'mixamorig:Head', 'mixamorig1Head'],
  neck: ['Neck', 'mixamorig:Neck', 'mixamorig1Neck'],
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

const findBone = (root: THREE.Object3D, names: string[]): THREE.Bone | undefined => {
  let found: THREE.Bone | undefined;
  root.traverse((child) => {
    if (found) return;
    if ((child as THREE.Bone).isBone) {
      for (const name of names) {
        if (child.name === name || child.name.includes(name)) {
          found = child as THREE.Bone;
          return;
        }
      }
    }
  });
  return found;
};

// Mixamo Avatar Component
const MixamoAvatar = ({ frame }: Avatar3DProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const [bones, setBones] = useState<BoneRefs>({});
  const [isReady, setIsReady] = useState(false);
  const initialRotations = useRef<Record<string, THREE.Euler>>({});
  
  const { scene } = useGLTF('/models/mixamo-avatar.glb');
  
  // Clone scene and find bones
  const clonedScene = useMemo(() => {
    const clone = scene.clone();
    return clone;
  }, [scene]);
  
  // Calculate scale to fit avatar in view
  const { scale, yOffset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    console.log('Mixamo avatar size:', size, 'center:', center);
    
    return {
      scale: 2.5 / maxDim,
      yOffset: -center.y * (2.5 / maxDim) - 0.5
    };
  }, [clonedScene]);
  
  // Find bones after scene is ready
  useEffect(() => {
    const foundBones: BoneRefs = {
      leftShoulder: findBone(clonedScene, MIXAMO_BONES.leftShoulder),
      leftArm: findBone(clonedScene, MIXAMO_BONES.leftArm),
      leftForeArm: findBone(clonedScene, MIXAMO_BONES.leftForeArm),
      leftHand: findBone(clonedScene, MIXAMO_BONES.leftHand),
      rightShoulder: findBone(clonedScene, MIXAMO_BONES.rightShoulder),
      rightArm: findBone(clonedScene, MIXAMO_BONES.rightArm),
      rightForeArm: findBone(clonedScene, MIXAMO_BONES.rightForeArm),
      rightHand: findBone(clonedScene, MIXAMO_BONES.rightHand),
      spine: findBone(clonedScene, MIXAMO_BONES.spine),
      head: findBone(clonedScene, MIXAMO_BONES.head),
    };
    
    // Store initial rotations
    Object.entries(foundBones).forEach(([key, bone]) => {
      if (bone) {
        initialRotations.current[key] = bone.rotation.clone();
      }
    });
    
    console.log('Found Mixamo bones:', Object.entries(foundBones).map(([k, v]) => `${k}: ${v?.name || 'not found'}`));
    setBones(foundBones);
    setIsReady(Object.values(foundBones).some(b => b !== undefined));
  }, [clonedScene]);
  
  // Animate bones based on hand landmarks
  useFrame((state) => {
    // Subtle idle animation
    if (groupRef.current) {
      groupRef.current.position.y = yOffset + Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
    }
    
    if (!frame || !isReady) return;
    
    const { leftArm, leftForeArm, leftHand, rightArm, rightForeArm, rightHand } = bones;
    
    // Animate left arm based on left hand landmarks
    if (isHandVisible(frame.leftHand)) {
      const normalized = normalizeCoordinates(frame.leftHand);
      const wrist = normalized[0];
      const middleFinger = normalized[9];
      
      // Calculate arm angles from wrist position
      const armAngleX = -(wrist[1] - 0.5) * 1.5; // Up/down based on Y
      const armAngleZ = (wrist[0] - 0.5) * 1.0 + 0.3; // Side angle
      const foreArmAngle = -Math.abs(wrist[1] - 0.5) * 0.8; // Elbow bend
      
      // Hand rotation from finger direction
      const handRotX = (middleFinger[1] - wrist[1]) * 2;
      const handRotZ = (middleFinger[0] - wrist[0]) * 2;
      
      if (leftArm) {
        leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, armAngleX, 0.12);
        leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, armAngleZ, 0.12);
      }
      if (leftForeArm) {
        leftForeArm.rotation.x = THREE.MathUtils.lerp(leftForeArm.rotation.x, foreArmAngle, 0.12);
        leftForeArm.rotation.y = THREE.MathUtils.lerp(leftForeArm.rotation.y, -wrist[2] * 0.5, 0.12);
      }
      if (leftHand) {
        leftHand.rotation.x = THREE.MathUtils.lerp(leftHand.rotation.x, handRotX, 0.15);
        leftHand.rotation.z = THREE.MathUtils.lerp(leftHand.rotation.z, handRotZ, 0.15);
      }
    }
    
    // Animate right arm based on right hand landmarks
    if (isHandVisible(frame.rightHand)) {
      const normalized = normalizeCoordinates(frame.rightHand);
      const wrist = normalized[0];
      const middleFinger = normalized[9];
      
      const armAngleX = -(wrist[1] - 0.5) * 1.5;
      const armAngleZ = -(wrist[0] - 0.5) * 1.0 - 0.3;
      const foreArmAngle = -Math.abs(wrist[1] - 0.5) * 0.8;
      
      const handRotX = (middleFinger[1] - wrist[1]) * 2;
      const handRotZ = (middleFinger[0] - wrist[0]) * 2;
      
      if (rightArm) {
        rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, armAngleX, 0.12);
        rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, armAngleZ, 0.12);
      }
      if (rightForeArm) {
        rightForeArm.rotation.x = THREE.MathUtils.lerp(rightForeArm.rotation.x, foreArmAngle, 0.12);
        rightForeArm.rotation.y = THREE.MathUtils.lerp(rightForeArm.rotation.y, wrist[2] * 0.5, 0.12);
      }
      if (rightHand) {
        rightHand.rotation.x = THREE.MathUtils.lerp(rightHand.rotation.x, handRotX, 0.15);
        rightHand.rotation.z = THREE.MathUtils.lerp(rightHand.rotation.z, -handRotZ, 0.15);
      }
    }
  });
  
  return (
    <group ref={groupRef} position={[0, yOffset, 0]} scale={scale}>
      <primitive object={clonedScene} />
    </group>
  );
};

// Procedural fallback avatar (same as before)
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

// Main component - uses Mixamo avatar
const Avatar3D = ({ frame }: Avatar3DProps) => {
  return <MixamoAvatar frame={frame} />;
};

// Preload the model
useGLTF.preload('/models/mixamo-avatar.glb');

export default Avatar3D;
