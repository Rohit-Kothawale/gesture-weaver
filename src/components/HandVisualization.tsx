import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera } from '@react-three/drei';
import Hand3D from './Hand3D';
import { HandFrame } from '@/types/hand-data';

interface HandVisualizationProps {
  frame: HandFrame | null;
}

const Scene = ({ frame }: HandVisualizationProps) => {
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

      {/* Hands */}
      {frame && (
        <>
          <Hand3D
            landmarks={frame.leftHand}
            color="#00d4ff"
            glowColor="#00f0ff"
            position={[-1.5, 0, 0]}
          />
          <Hand3D
            landmarks={frame.rightHand}
            color="#00ff88"
            glowColor="#00ffaa"
            position={[1.5, 0, 0]}
          />
        </>
      )}
    </>
  );
};

const HandVisualization = ({ frame }: HandVisualizationProps) => {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden glass-panel animate-pulse-glow">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <color attach="background" args={['#0a0f14']} />
        <fog attach="fog" args={['#0a0f14', 5, 15]} />
        <Scene frame={frame} />
      </Canvas>
    </div>
  );
};

export default HandVisualization;
