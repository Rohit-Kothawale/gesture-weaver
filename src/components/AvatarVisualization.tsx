import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera } from '@react-three/drei';
import Avatar3D from './Avatar3D';
import { HandFrame } from '@/types/hand-data';

interface AvatarVisualizationProps {
  frame: HandFrame | null;
}

const Scene = ({ frame }: AvatarVisualizationProps) => {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.5, 4]} fov={50} />
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={2}
        maxDistance={8}
        autoRotate={false}
        target={[0, 0.3, 0]}
      />

      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} color="#ffffff" />
      <directionalLight position={[-5, 3, -5]} intensity={0.3} color="#00d4ff" />
      <pointLight position={[0, 3, 2]} intensity={0.4} color="#00ff88" />

      {/* Grid */}
      <Grid
        args={[10, 10]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#1a2a3a"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#2a3a4a"
        fadeDistance={12}
        fadeStrength={1}
        followCamera={false}
        position={[0, -1.5, 0]}
      />

      {/* Avatar */}
      <Suspense fallback={null}>
        <Avatar3D frame={frame} />
      </Suspense>
    </>
  );
};

const AvatarVisualization = ({ frame }: AvatarVisualizationProps) => {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden glass-panel">
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

export default AvatarVisualization;
