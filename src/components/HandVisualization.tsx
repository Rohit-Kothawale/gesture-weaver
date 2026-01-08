import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera } from '@react-three/drei';
import Hand3D, { ArmSkeleton } from './Hand3D';
import { HandFrame, ArmLandmarks } from '@/types/hand-data';

interface HandVisualizationProps {
  frame: HandFrame | null;
  showArms?: boolean;
}

// Helper to check if arm data is valid
const isArmValid = (arm?: ArmLandmarks) => {
  if (!arm) return false;
  return arm.shoulder.some(v => v !== 0) && arm.elbow.some(v => v !== 0);
};

// Convert arm wrist to 3D position for hand placement
// Coordinates are already mirrored in CameraCapture, so just center and scale
const getWristPosition = (arm: ArmLandmarks, scale = 3): [number, number, number] => {
  return [
    (arm.wrist[0] - 0.5) * scale,
    (1 - arm.wrist[1] - 0.5) * scale,  // Flip Y to convert from screen coords to 3D
    -arm.wrist[2] * scale,
  ];
};

const Scene = ({ frame, showArms = true }: HandVisualizationProps) => {
  const hasLeftArm = showArms && isArmValid(frame?.leftArm);
  const hasRightArm = showArms && isArmValid(frame?.rightArm);

  // Debug logging
  console.log('HandVisualization:', {
    hasLeftArm,
    hasRightArm,
    leftArm: frame?.leftArm,
    rightArm: frame?.rightArm,
    leftHandVisible: frame?.leftHand?.some(p => p[0] !== 0 || p[1] !== 0),
    rightHandVisible: frame?.rightHand?.some(p => p[0] !== 0 || p[1] !== 0),
  });

  // Calculate hand positions - use arm wrist when available, otherwise use fixed offset
  const leftHandPosition = useMemo((): [number, number, number] => {
    if (hasLeftArm && frame?.leftArm) {
      const pos = getWristPosition(frame.leftArm);
      console.log('Left hand position from arm:', pos);
      return pos;
    }
    return [1.5, 0, 0]; // Default fixed position
  }, [hasLeftArm, frame?.leftArm]);

  const rightHandPosition = useMemo((): [number, number, number] => {
    if (hasRightArm && frame?.rightArm) {
      const pos = getWristPosition(frame.rightArm);
      console.log('Right hand position from arm:', pos);
      return pos;
    }
    return [-1.5, 0, 0]; // Default fixed position
  }, [hasRightArm, frame?.rightArm]);

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={10}
        autoRotate={false}
      />

      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} color="#ffffff" />
      <directionalLight position={[-5, -5, -5]} intensity={0.3} color="#00d4ff" />
      <pointLight position={[0, 3, 0]} intensity={0.5} color="#00ff88" />

      {/* Grid */}
      <Grid
        args={[10, 10]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#1a2a3a"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#2a3a4a"
        fadeDistance={15}
        fadeStrength={1}
        followCamera={false}
        position={[0, -2, 0]}
      />

      {/* Arms rendered at world position */}
      {hasLeftArm && frame?.leftArm && (
        <ArmSkeleton 
          armLandmarks={frame.leftArm} 
          color="#00d4ff" 
          glowColor="#00f0ff" 
        />
      )}
      {hasRightArm && frame?.rightArm && (
        <ArmSkeleton 
          armLandmarks={frame.rightArm} 
          color="#00ff88" 
          glowColor="#00ffaa" 
        />
      )}

      {/* Hands positioned at arm wrist (or fixed offset if no arm data) */}
      {frame && (
        <>
          <Hand3D
            landmarks={frame.leftHand}
            color="#00d4ff"
            glowColor="#00f0ff"
            position={leftHandPosition}
            centerOnWrist={hasLeftArm}
          />
          <Hand3D
            landmarks={frame.rightHand}
            color="#00ff88"
            glowColor="#00ffaa"
            position={rightHandPosition}
            centerOnWrist={hasRightArm}
          />
        </>
      )}
    </>
  );
};

const HandVisualization = ({ frame, showArms = true }: HandVisualizationProps) => {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden glass-panel animate-pulse-glow">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <color attach="background" args={['#0a0f14']} />
        <fog attach="fog" args={['#0a0f14', 5, 15]} />
        <Scene frame={frame} showArms={showArms} />
      </Canvas>
    </div>
  );
};

export default HandVisualization;
