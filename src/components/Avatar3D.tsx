import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HandFrame, isHandVisible, normalizeCoordinates, HAND_CONNECTIONS } from '@/types/hand-data';

interface Avatar3DProps {
  frame: HandFrame | null;
}

const AvatarBody = () => {
  return (
    <group position={[0, -0.8, 0]}>
      {/* Head */}
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshStandardMaterial color="#f5d0c5" roughness={0.8} />
      </mesh>
      
      {/* Eyes */}
      <mesh position={[-0.08, 1.65, 0.2]}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshStandardMaterial color="#2d3748" />
      </mesh>
      <mesh position={[0.08, 1.65, 0.2]}>
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshStandardMaterial color="#2d3748" />
      </mesh>
      
      {/* Smile */}
      <mesh position={[0, 1.52, 0.22]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.06, 0.015, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#d4726a" />
      </mesh>
      
      {/* Neck */}
      <mesh position={[0, 1.25, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.15, 16]} />
        <meshStandardMaterial color="#f5d0c5" roughness={0.8} />
      </mesh>
      
      {/* Torso */}
      <mesh position={[0, 0.85, 0]}>
        <capsuleGeometry args={[0.3, 0.5, 8, 16]} />
        <meshStandardMaterial color="#4299e1" roughness={0.6} />
      </mesh>
      
      {/* Left Shoulder */}
      <mesh position={[-0.4, 1.05, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="#4299e1" roughness={0.6} />
      </mesh>
      
      {/* Right Shoulder */}
      <mesh position={[0.4, 1.05, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color="#4299e1" roughness={0.6} />
      </mesh>
      
      {/* Left Upper Arm */}
      <mesh position={[-0.55, 0.85, 0]} rotation={[0, 0, Math.PI / 6]}>
        <capsuleGeometry args={[0.06, 0.25, 8, 16]} />
        <meshStandardMaterial color="#f5d0c5" roughness={0.8} />
      </mesh>
      
      {/* Right Upper Arm */}
      <mesh position={[0.55, 0.85, 0]} rotation={[0, 0, -Math.PI / 6]}>
        <capsuleGeometry args={[0.06, 0.25, 8, 16]} />
        <meshStandardMaterial color="#f5d0c5" roughness={0.8} />
      </mesh>
    </group>
  );
};

interface AvatarHandProps {
  landmarks: [number, number, number][];
  color: string;
  isLeft: boolean;
}

const AvatarHand = ({ landmarks, color, isLeft }: AvatarHandProps) => {
  const groupRef = useRef<THREE.Group>(null);
  
  if (!isHandVisible(landmarks)) return null;
  
  const normalizedLandmarks = normalizeCoordinates(landmarks);
  
  // Scale and position hands relative to avatar body
  const handScale = 0.8;
  const xOffset = isLeft ? -0.7 : 0.7;
  const yOffset = 0.2;
  const zOffset = 0.3;
  
  const scaledLandmarks: [number, number, number][] = normalizedLandmarks.map(([x, y, z]) => [
    x * handScale + xOffset,
    y * handScale + yOffset,
    z * handScale + zOffset
  ]);
  
  return (
    <group ref={groupRef}>
      {/* Draw landmarks */}
      {scaledLandmarks.map((pos, idx) => {
        const isFingertip = [4, 8, 12, 16, 20].includes(idx);
        const isWrist = idx === 0;
        
        return (
          <mesh key={idx} position={pos}>
            <sphereGeometry args={[isWrist ? 0.04 : isFingertip ? 0.035 : 0.025, 16, 16]} />
            <meshStandardMaterial 
              color={isFingertip ? "#ffffff" : color}
              emissive={isFingertip ? color : "#000000"}
              emissiveIntensity={isFingertip ? 0.5 : 0}
              roughness={0.3}
            />
          </mesh>
        );
      })}
      
      {/* Draw connections */}
      {HAND_CONNECTIONS.map(([start, end], idx) => {
        const startPos = new THREE.Vector3(...scaledLandmarks[start] as [number, number, number]);
        const endPos = new THREE.Vector3(...scaledLandmarks[end] as [number, number, number]);
        
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
  
  // Subtle idle animation
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
    }
  });
  
  return (
    <group ref={groupRef}>
      <AvatarBody />
      {frame && (
        <>
          <AvatarHand 
            landmarks={frame.leftHand} 
            color="#00d4ff" 
            isLeft={true}
          />
          <AvatarHand 
            landmarks={frame.rightHand} 
            color="#00ff88" 
            isLeft={false}
          />
        </>
      )}
    </group>
  );
};

export default Avatar3D;
