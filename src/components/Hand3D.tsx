import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { HAND_CONNECTIONS, normalizeCoordinates, isHandVisible } from '@/types/hand-data';

interface Hand3DProps {
  landmarks: [number, number, number][];
  color: string;
  glowColor: string;
  position?: [number, number, number];
}

const Hand3D = ({ landmarks, color, glowColor, position = [0, 0, 0] }: Hand3DProps) => {
  const visible = isHandVisible(landmarks);
  
  const normalizedLandmarks = useMemo(() => {
    if (!visible) return [];
    return normalizeCoordinates(landmarks, 3);
  }, [landmarks, visible]);

  const linePoints = useMemo(() => {
    if (!visible) return [];
    return HAND_CONNECTIONS.map(([start, end]) => ({
      start: normalizedLandmarks[start],
      end: normalizedLandmarks[end],
    }));
  }, [normalizedLandmarks, visible]);

  if (!visible) return null;

  return (
    <group position={position}>
      {/* Landmark spheres */}
      {normalizedLandmarks.map((pos, index) => (
        <mesh key={index} position={pos}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshStandardMaterial
            color={color}
            emissive={glowColor}
            emissiveIntensity={0.5}
            roughness={0.3}
            metalness={0.7}
          />
        </mesh>
      ))}

      {/* Connection lines */}
      {linePoints.map((line, index) => (
        <Line
          key={index}
          points={[line.start, line.end]}
          color={color}
          lineWidth={2}
          transparent
          opacity={0.8}
        />
      ))}

      {/* Glow effect for fingertips (indices 4, 8, 12, 16, 20) */}
      {[4, 8, 12, 16, 20].map((tipIndex) => (
        <mesh key={`glow-${tipIndex}`} position={normalizedLandmarks[tipIndex]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshBasicMaterial
            color={glowColor}
            transparent
            opacity={0.3}
          />
        </mesh>
      ))}
    </group>
  );
};

export default Hand3D;
