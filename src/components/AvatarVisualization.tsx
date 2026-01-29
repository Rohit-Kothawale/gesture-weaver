import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera } from '@react-three/drei';
import SkinnedMeshAvatar from './SkinnedMeshAvatar';
import { HandFrame } from '@/types/hand-data';

interface AvatarVisualizationProps {
  frame: HandFrame | null;
}

const Scene = ({ frame }: AvatarVisualizationProps) => {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.2, 2.5]} fov={50} />
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={0.5}
        maxDistance={10}
        autoRotate={false}
        target={[0, 1, 0]}
      />

      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1} color="#ffffff" />
      <directionalLight position={[-5, 3, -5]} intensity={0.4} color="#ffffff" />
      <pointLight position={[0, 3, 2]} intensity={0.5} color="#ffffff" />

      {/* Grid at ground level */}
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
        position={[0, 0, 0]}
      />

      {/* Avatar */}
      <Suspense fallback={null}>
        <SkinnedMeshAvatar frame={frame} />
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
        onCreated={({ gl }) => {
          console.log('Canvas created');
        }}
      >
        <color attach="background" args={['#0a0f14']} />
        {/* Removed fog to ensure avatar visibility */}
        <Suspense fallback={null}>
          <Scene frame={frame} />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default AvatarVisualization;
