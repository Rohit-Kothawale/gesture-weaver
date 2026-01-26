import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, Grid } from '@react-three/drei';
import SignAnimationPlayer from './SignAnimationPlayer';
import { SignAnimationData } from '@/types/sign-animation';

interface SignAnimationVisualizationProps {
  animationData: SignAnimationData | null;
  isPlaying: boolean;
  fps?: number;
  onFrameChange?: (frameIndex: number) => void;
}

const Scene = ({ animationData, isPlaying, fps, onFrameChange }: SignAnimationVisualizationProps) => {
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

      {/* Sign Animation Player */}
      <Suspense fallback={null}>
        <SignAnimationPlayer
          animationData={animationData}
          isPlaying={isPlaying}
          fps={fps}
          loop={true}
          onFrameChange={onFrameChange}
        />
      </Suspense>
    </>
  );
};

const SignAnimationVisualization = ({ 
  animationData, 
  isPlaying, 
  fps = 10,
  onFrameChange 
}: SignAnimationVisualizationProps) => {
  return (
    <div className="w-full h-full rounded-xl overflow-hidden glass-panel">
      <Canvas
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <color attach="background" args={['#0a0f14']} />
        <fog attach="fog" args={['#0a0f14', 5, 15]} />
        <Suspense fallback={null}>
          <Scene 
            animationData={animationData} 
            isPlaying={isPlaying} 
            fps={fps}
            onFrameChange={onFrameChange}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default SignAnimationVisualization;
