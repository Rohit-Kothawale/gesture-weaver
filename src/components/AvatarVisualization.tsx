import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, Grid } from '@react-three/drei';
import Avatar3D from './Avatar3D';
import { HandFrame } from '@/types/hand-data';

interface AvatarVisualizationProps {
  frame: HandFrame | null;
}

const Scene = ({ frame }: AvatarVisualizationProps) => {
  return (
    <>
      {/* Fixed orthographic camera for 2D-like stable view */}
      <OrthographicCamera
        makeDefault
        position={[0, 0.3, 5]}
        zoom={280}
        near={0.1}
        far={100}
      />

      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[0, 2, 5]} intensity={0.8} color="#ffffff" />
      <directionalLight position={[-2, 1, 3]} intensity={0.3} color="#00d4ff" />
      <pointLight position={[0, 3, 2]} intensity={0.4} color="#00ff88" />

      {/* Subtle grid for grounding */}
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
        onCreated={({ gl }) => {
          console.log('Canvas created');
        }}
      >
        <color attach="background" args={['#0a0f14']} />
        <fog attach="fog" args={['#0a0f14', 5, 15]} />
        <Suspense fallback={null}>
          <Scene frame={frame} />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default AvatarVisualization;
