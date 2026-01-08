import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HandFrame, isHandVisible, normalizeCoordinates, HAND_CONNECTIONS } from '@/types/hand-data';

interface Avatar3DProps {
  frame: HandFrame | null;
}

const BODY_OFFSET: [number, number, number] = [0, -0.8, 0];
const LEFT_SHOULDER: [number, number, number] = [-0.5, 0.75, 0];
const RIGHT_SHOULDER: [number, number, number] = [0.5, 0.75, 0];

const AvatarBody = () => {
  return (
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
};

interface ArmSegmentProps {
  start: [number, number, number];
  end: [number, number, number];
  color: string;
  radius?: number;
}

const ArmSegment = ({ start, end, color, radius = 0.045 }: ArmSegmentProps) => {
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

interface AvatarHandWithArmProps {
  landmarks: [number, number, number][];
  color: string;
  isLeft: boolean;
  shoulderPos: [number, number, number];
}

const AvatarHandWithArm = ({ landmarks, color, isLeft, shoulderPos }: AvatarHandWithArmProps) => {
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

const Avatar3D = ({ frame }: Avatar3DProps) => {
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

export default Avatar3D;
