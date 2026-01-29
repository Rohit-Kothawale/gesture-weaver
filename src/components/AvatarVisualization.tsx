import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import SkinnedMeshAvatar from './SkinnedMeshAvatar';
import { HandFrame } from '@/types/hand-data';
import { AvatarLoader } from '@/components/AvatarLoader';

interface AvatarVisualizationProps {
  frame: HandFrame | null;
}

const Scene = ({ frame }: AvatarVisualizationProps) => {
  return (
    <>
      {/* Orthographic camera for flat 2D cutout view - full body framing */}
      <OrthographicCamera
        makeDefault
        position={[0, 0.5, 5]}
        zoom={100}
        near={-50}
        far={50}
      />

      {/* Flat lighting - no shadows or depth cues */}
      <ambientLight intensity={1.2} />

      {/* Avatar only - no grid or 3D scene elements */}
      <Suspense fallback={<AvatarLoader />}>
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
      >
        <Suspense fallback={<AvatarLoader />}>
          <Scene frame={frame} />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default AvatarVisualization;
