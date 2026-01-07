import { useMemo } from "react";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import { HAND_CONNECTIONS, normalizeCoordinates, isHandVisible } from "@/types/hand-data";

interface Hand3DProps {
  landmarks: [number, number, number][];
  color: string;
  glowColor: string;
  position?: [number, number, number];
}

const Hand3D = ({ landmarks, color, glowColor, position = [0, 0, 0] }: Hand3DProps) => {
  const visible = isHandVisible(landmarks);

  // Apply the reversal fixes and convert to Three.js Vectors
  const normalizedLandmarks = useMemo(() => {
    if (!visible) return [];
    const coords = normalizeCoordinates(landmarks, 3);
    return coords.map((p) => new THREE.Vector3(...p));
  }, [landmarks, visible]);

  // Create the skeleton lines
  const linePoints = useMemo(() => {
    if (!visible || normalizedLandmarks.length === 0) return [];
    return HAND_CONNECTIONS.map(([start, end]) => [normalizedLandmarks[start], normalizedLandmarks[end]]);
  }, [normalizedLandmarks, visible]);

  if (!visible) return null;

  return (
    <group position={position}>
      {/* Draw Joints */}
      {normalizedLandmarks.map((pos, index) => (
        <mesh key={index} position={pos}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshStandardMaterial color={color} emissive={glowColor} emissiveIntensity={0.5} />
        </mesh>
      ))}

      {/* Draw Skeleton Lines */}
      {linePoints.map((points, index) => (
        <Line key={index} points={points} color={color} lineWidth={2} transparent opacity={0.7} />
      ))}

      {/* Fingertip Highlight */}
      {[4, 8, 12, 16, 20].map((tip) => (
        <mesh key={`glow-${tip}`} position={normalizedLandmarks[tip]}>
          <sphereGeometry args={[0.06, 16, 16]} />
          <meshBasicMaterial color={glowColor} transparent opacity={0.3} />
        </mesh>
      ))}
    </group>
  );
};

export default Hand3D;
