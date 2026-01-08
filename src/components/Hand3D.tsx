import { useMemo } from "react";
import { Line, Tube } from "@react-three/drei";
import * as THREE from "three";
import { HAND_CONNECTIONS, normalizeCoordinates, isHandVisible } from "@/types/hand-data";

interface Hand3DProps {
  landmarks: [number, number, number][];
  color: string;
  glowColor: string;
  position?: [number, number, number];
}

// Finger segment connections for skin tubes
const FINGER_SEGMENTS = [
  // Thumb
  [[0, 1], [1, 2], [2, 3], [3, 4]],
  // Index
  [[0, 5], [5, 6], [6, 7], [7, 8]],
  // Middle
  [[0, 9], [9, 10], [10, 11], [11, 12]],
  // Ring
  [[0, 13], [13, 14], [14, 15], [15, 16]],
  // Pinky
  [[0, 17], [17, 18], [18, 19], [19, 20]],
];

// Palm connections for the palm mesh
const PALM_INDICES = [0, 5, 9, 13, 17];

// Skin tube component for finger segments
const SkinTube = ({ 
  start, 
  end, 
  startRadius, 
  endRadius,
  skinColor 
}: { 
  start: THREE.Vector3; 
  end: THREE.Vector3; 
  startRadius: number;
  endRadius: number;
  skinColor: string;
}) => {
  const curve = useMemo(() => {
    return new THREE.LineCurve3(start, end);
  }, [start, end]);

  return (
    <mesh>
      <tubeGeometry args={[curve, 8, startRadius, 12, false]} />
      <meshStandardMaterial 
        color={skinColor} 
        roughness={0.7} 
        metalness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// Palm mesh component
const PalmMesh = ({ 
  landmarks, 
  skinColor 
}: { 
  landmarks: THREE.Vector3[];
  skinColor: string;
}) => {
  const palmGeometry = useMemo(() => {
    if (landmarks.length < 21) return null;

    // Create a shape from palm landmarks
    const wrist = landmarks[0];
    const indexBase = landmarks[5];
    const middleBase = landmarks[9];
    const ringBase = landmarks[13];
    const pinkyBase = landmarks[17];

    // Create vertices for palm
    const vertices = new Float32Array([
      // Triangle 1: wrist -> index -> middle
      wrist.x, wrist.y, wrist.z,
      indexBase.x, indexBase.y, indexBase.z,
      middleBase.x, middleBase.y, middleBase.z,
      
      // Triangle 2: wrist -> middle -> ring
      wrist.x, wrist.y, wrist.z,
      middleBase.x, middleBase.y, middleBase.z,
      ringBase.x, ringBase.y, ringBase.z,
      
      // Triangle 3: wrist -> ring -> pinky
      wrist.x, wrist.y, wrist.z,
      ringBase.x, ringBase.y, ringBase.z,
      pinkyBase.x, pinkyBase.y, pinkyBase.z,
      
      // Triangle 4: index -> middle -> ring (upper palm)
      indexBase.x, indexBase.y, indexBase.z,
      middleBase.x, middleBase.y, middleBase.z,
      ringBase.x, ringBase.y, ringBase.z,
      
      // Triangle 5: index -> ring -> pinky (connect across)
      indexBase.x, indexBase.y, indexBase.z,
      ringBase.x, ringBase.y, ringBase.z,
      pinkyBase.x, pinkyBase.y, pinkyBase.z,
    ]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }, [landmarks]);

  if (!palmGeometry) return null;

  return (
    <mesh geometry={palmGeometry}>
      <meshStandardMaterial 
        color={skinColor} 
        roughness={0.7} 
        metalness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

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

  // Skin color - warm peachy tone
  const skinColor = "#e8beac";
  
  // Calculate finger tube radii based on segment
  const getSegmentRadius = (segmentIndex: number, isThumb: boolean) => {
    // Taper from base to tip
    const baseRadius = isThumb ? 0.06 : 0.055;
    const taperFactor = 1 - (segmentIndex * 0.15);
    return baseRadius * taperFactor;
  };

  if (!visible) return null;

  return (
    <group position={position}>
      {/* Skin Layer - Palm */}
      {normalizedLandmarks.length >= 21 && (
        <PalmMesh landmarks={normalizedLandmarks} skinColor={skinColor} />
      )}

      {/* Skin Layer - Finger tubes */}
      {normalizedLandmarks.length >= 21 && FINGER_SEGMENTS.map((finger, fingerIdx) => (
        finger.slice(1).map(([start, end], segmentIdx) => (
          <SkinTube
            key={`skin-${fingerIdx}-${segmentIdx}`}
            start={normalizedLandmarks[start]}
            end={normalizedLandmarks[end]}
            startRadius={getSegmentRadius(segmentIdx, fingerIdx === 0)}
            endRadius={getSegmentRadius(segmentIdx + 1, fingerIdx === 0)}
            skinColor={skinColor}
          />
        ))
      ))}

      {/* Skin spheres at joints for smooth connections */}
      {normalizedLandmarks.map((pos, index) => {
        // Determine joint size based on position
        const isWrist = index === 0;
        const isTip = [4, 8, 12, 16, 20].includes(index);
        const isBase = [1, 5, 9, 13, 17].includes(index);
        
        let radius = 0.045;
        if (isWrist) radius = 0.08;
        else if (isBase) radius = 0.055;
        else if (isTip) radius = 0.035;
        
        return (
          <mesh key={`skin-joint-${index}`} position={pos}>
            <sphereGeometry args={[radius, 16, 16]} />
            <meshStandardMaterial 
              color={skinColor} 
              roughness={0.7} 
              metalness={0.1}
            />
          </mesh>
        );
      })}

      {/* Skeleton overlay - joints (smaller, subtle) */}
      {normalizedLandmarks.map((pos, index) => (
        <mesh key={index} position={pos}>
          <sphereGeometry args={[0.02, 12, 12]} />
          <meshStandardMaterial color={color} emissive={glowColor} emissiveIntensity={0.8} />
        </mesh>
      ))}

      {/* Skeleton overlay - lines (thinner, subtle) */}
      {linePoints.map((points, index) => (
        <Line key={index} points={points} color={color} lineWidth={1.5} transparent opacity={0.5} />
      ))}

      {/* Fingertip Highlight */}
      {[4, 8, 12, 16, 20].map((tip) => (
        <mesh key={`glow-${tip}`} position={normalizedLandmarks[tip]}>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshBasicMaterial color={glowColor} transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  );
};

export default Hand3D;
