import { useEffect, useState } from 'react';
import { Hand, User, Layers } from 'lucide-react';
import HandVisualization from '@/components/HandVisualization';
import AvatarVisualization from '@/components/AvatarVisualization';
import FileUpload from '@/components/FileUpload';
import AnimationControls from '@/components/AnimationControls';
import StatusPanel from '@/components/StatusPanel';
import { useSignAnimation } from '@/hooks/useSignAnimation';

const Index = () => {
  const [viewMode, setViewMode] = useState<'hands' | 'avatar'>('avatar');
  const {
    frames,
    currentFrame,
    isPlaying,
    isLoading,
    fileName,
    loadFile,
    loadFromUrl,
    togglePlay,
    reset,
    setFrame,
    fps,
    setFps,
  } = useSignAnimation();

  const currentFrameData = frames[currentFrame] || null;
  const label = currentFrameData?.label || 'No Data';

  // Load sample data on mount
  useEffect(() => {
    loadFromUrl('/data/Happy_sign_data.csv');
  }, [loadFromUrl]);

  return (
    <div className="min-h-screen p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
              <Hand className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text">
                Sign Language Visualizer
              </h1>
              <p className="text-sm text-muted-foreground">
                3D Hand Motion Capture
              </p>
            </div>
          </div>

          <FileUpload
            onFileUpload={loadFile}
            hasData={frames.length > 0}
            fileName={fileName || undefined}
          />
        </header>

        {/* Current Label */}
        <div className="text-center py-4">
          <span className="text-sm text-muted-foreground uppercase tracking-widest">
            Current Sign
          </span>
          <h2 className="text-5xl font-bold gradient-text mt-2 animate-fade-in" key={label}>
            {label}
          </h2>
        </div>

        {/* View Toggle */}
        <div className="flex justify-center">
          <div className="glass-panel p-1 inline-flex gap-1">
            <button
              onClick={() => setViewMode('avatar')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'avatar'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <User className="w-4 h-4" />
              Avatar
            </button>
            <button
              onClick={() => setViewMode('hands')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'hands'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Layers className="w-4 h-4" />
              Hands Only
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* 3D Visualization */}
          <div className="lg:col-span-3 h-[500px] lg:h-[600px]">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center glass-panel">
                <div className="text-center space-y-3">
                  <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-muted-foreground">Loading data...</p>
                </div>
              </div>
            ) : viewMode === 'avatar' ? (
              <AvatarVisualization frame={currentFrameData} />
            ) : (
              <HandVisualization frame={currentFrameData} />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <AnimationControls
              isPlaying={isPlaying}
              currentFrame={currentFrame}
              totalFrames={frames.length}
              fps={fps}
              onPlayPause={togglePlay}
              onReset={reset}
              onFrameChange={setFrame}
              onFpsChange={setFps}
              disabled={frames.length === 0}
            />

            <StatusPanel frame={currentFrameData} fps={fps} />

            {/* Instructions */}
            <div className="glass-panel p-4 space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Controls
              </h3>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Drag to rotate the view</li>
                <li>• Scroll to zoom in/out</li>
                <li>• Right-click drag to pan</li>
                <li>• Use slider to scrub frames</li>
              </ul>
            </div>

            {/* Legend */}
            <div className="glass-panel p-4 space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Legend
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-leftHand" />
                  <span className="text-sm text-foreground">Left Hand</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-rightHand" />
                  <span className="text-sm text-foreground">Right Hand</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
