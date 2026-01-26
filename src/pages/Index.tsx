import { useEffect, useState } from 'react';
import { Hand, User, Layers, Camera, Download, Bone, Wand2, FileJson, Upload } from 'lucide-react';
import { downloadAvatarJSON } from '@/utils/avatarJsonExport';
import HandVisualization from '@/components/HandVisualization';
import AvatarVisualization from '@/components/AvatarVisualization';
import SignAnimationVisualization from '@/components/SignAnimationVisualization';
import FileUpload from '@/components/FileUpload';
import VideoUpload from '@/components/VideoUpload';
import VideoPlayer from '@/components/VideoPlayer';
import VideoProcessor from '@/components/VideoProcessor';
import CameraCapture from '@/components/CameraCapture';
import AnimationControls from '@/components/AnimationControls';
import StatusPanel from '@/components/StatusPanel';
import { useSignAnimation } from '@/hooks/useSignAnimation';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SignAnimationData } from '@/types/sign-animation';

const Index = () => {
  const [viewMode, setViewMode] = useState<'hands' | 'avatar' | 'json'>('avatar');
  const [showCamera, setShowCamera] = useState(false);
  const [showArms, setShowArms] = useState(true);
  const [videoFile, setVideoFile] = useState<{ file: File; url: string } | null>(null);
  const [showVideoProcessor, setShowVideoProcessor] = useState(false);
  const [signAnimationData, setSignAnimationData] = useState<SignAnimationData | null>(null);
  const [jsonFileName, setJsonFileName] = useState<string | null>(null);
  const [jsonFrameIndex, setJsonFrameIndex] = useState(0);
  const {
    frames,
    currentFrame,
    isPlaying,
    isLoading,
    fileName,
    loadFile,
    loadFromUrl,
    loadFrames,
    togglePlay,
    reset,
    setFrame,
    fps,
    setFps,
    downloadCSV,
  } = useSignAnimation();

  const currentFrameData = frames[currentFrame] || null;
  const label = signAnimationData?.word || currentFrameData?.label || 'No Data';

  // Load JSON animation file
  const handleJsonUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as SignAnimationData;
        setSignAnimationData(data);
        setJsonFileName(file.name);
        setViewMode('json');
        setJsonFrameIndex(0);
      } catch (error) {
        console.error('Failed to parse JSON:', error);
      }
    };
    reader.readAsText(file);
  };

  // Load sample JSON on demand
  const loadSampleJson = async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/TECHNOLOGY.json`);
      const data = await response.json() as SignAnimationData;
      setSignAnimationData(data);
      setJsonFileName('TECHNOLOGY.json');
      setViewMode('json');
      setJsonFrameIndex(0);
    } catch (error) {
      console.error('Failed to load sample JSON:', error);
    }
  };

  // Load sample data on mount
  useEffect(() => {
    loadFromUrl(`${import.meta.env.BASE_URL}data/Happy_sign_data.csv`);
  }, [loadFromUrl]);

  return (
    <div className="min-h-screen p-3 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-primary/10 border border-primary/20">
                <Hand className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-lg sm:text-2xl font-bold gradient-text">
                  Sign Language Visualizer
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  3D Hand Motion Capture
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons - Scrollable on mobile */}
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 sm:overflow-visible">
            <Button
              onClick={() => setShowCamera(true)}
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap"
            >
              <Camera className="w-4 h-4" />
              <span className="hidden xs:inline">Capture</span>
            </Button>
            <Button
              onClick={downloadCSV}
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap"
              disabled={frames.length === 0}
            >
              <Download className="w-4 h-4" />
              <span className="hidden xs:inline">CSV</span>
            </Button>
            <Button
              onClick={() => downloadAvatarJSON(frames, fps, fileName?.replace(/\.[^/.]+$/, '') || 'avatar_animation')}
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap"
              disabled={frames.length === 0}
            >
              <FileJson className="w-4 h-4" />
              <span className="hidden xs:inline">JSON</span>
            </Button>
            <FileUpload
              onFileUpload={loadFile}
              hasData={frames.length > 0}
              fileName={fileName || undefined}
            />
            {/* JSON Animation Upload */}
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap relative"
              asChild
            >
              <label>
                <Upload className="w-4 h-4" />
                <span className="hidden xs:inline">{jsonFileName || 'Load JSON'}</span>
                <input
                  type="file"
                  accept=".json"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleJsonUpload(file);
                  }}
                />
              </label>
            </Button>
            <VideoUpload
              onVideoUpload={(file, url) => setVideoFile({ file, url })}
              hasVideo={!!videoFile}
              videoName={videoFile?.file.name}
              onClearVideo={() => {
                if (videoFile?.url) {
                  URL.revokeObjectURL(videoFile.url);
                }
                setVideoFile(null);
                setShowVideoProcessor(false);
              }}
            />
            {videoFile && (
              <Button
                onClick={() => setShowVideoProcessor(true)}
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5 sm:gap-2 whitespace-nowrap"
              >
                <Wand2 className="w-4 h-4" />
                <span className="hidden xs:inline">Extract Landmarks</span>
              </Button>
            )}
          </div>
        </header>

        {/* Current Label */}
        <div className="text-center py-2 sm:py-4">
          <span className="text-xs sm:text-sm text-muted-foreground uppercase tracking-widest">
            Current Sign
          </span>
          <h2 className="text-3xl sm:text-5xl font-bold gradient-text mt-1 sm:mt-2 animate-fade-in" key={label}>
            {label}
          </h2>
        </div>

        {/* View Toggle */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-4">
          <div className="glass-panel p-1 inline-flex gap-1">
            <button
              onClick={() => setViewMode('avatar')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                viewMode === 'avatar'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Avatar
            </button>
            <button
              onClick={() => setViewMode('hands')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                viewMode === 'hands'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Hands Only
            </button>
            {signAnimationData && (
              <button
                onClick={() => setViewMode('json')}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                  viewMode === 'json'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <FileJson className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                JSON Avatar
              </button>
            )}
          </div>
          
          {/* Show Arms Toggle - only visible when in Hands Only view */}
          {viewMode === 'hands' && (
            <div className="glass-panel px-2 sm:px-3 py-1.5 sm:py-2 flex items-center gap-1.5 sm:gap-2">
              <Bone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
              <span className="text-xs sm:text-sm text-muted-foreground">Arms</span>
              <Switch
                checked={showArms}
                onCheckedChange={setShowArms}
              />
            </div>
          )}
        </div>

        {/* Camera Capture Modal */}
        {showCamera && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl">
              <CameraCapture
                onFramesCaptured={(capturedFrames, label) => {
                  loadFrames(capturedFrames, `${label}_captured.csv`);
                }}
                onClose={() => setShowCamera(false)}
              />
            </div>
          </div>
        )}

        {/* Video Processor Modal */}
        {showVideoProcessor && videoFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl">
              <VideoProcessor
                videoUrl={videoFile.url}
                videoName={videoFile.file.name}
                onProcessingComplete={(extractedFrames, label) => {
                  loadFrames(extractedFrames, `${label}_extracted.csv`);
                  setShowVideoProcessor(false);
                }}
                onClose={() => setShowVideoProcessor(false)}
              />
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* 3D Visualization */}
          <div className="lg:col-span-3 h-[350px] sm:h-[500px] lg:h-[600px]">
            {isLoading ? (
              <div className="w-full h-full flex items-center justify-center glass-panel">
                <div className="text-center space-y-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm sm:text-base text-muted-foreground">Loading data...</p>
                </div>
              </div>
            ) : viewMode === 'json' && signAnimationData ? (
              <SignAnimationVisualization 
                animationData={signAnimationData} 
                isPlaying={isPlaying}
                fps={fps}
                onFrameChange={setJsonFrameIndex}
              />
            ) : viewMode === 'avatar' ? (
              <AvatarVisualization frame={currentFrameData} />
            ) : (
              <HandVisualization frame={currentFrameData} showArms={showArms} />
            )}
          </div>

          {/* Sidebar - Collapsible sections on mobile */}
          <div className="space-y-3 sm:space-y-4">
            {/* Video Player - Show when video is uploaded */}
            {videoFile && (
              <VideoPlayer
                videoUrl={videoFile.url}
                videoName={videoFile.file.name}
                onClose={() => {
                  URL.revokeObjectURL(videoFile.url);
                  setVideoFile(null);
                }}
                isPlaying={isPlaying}
                currentFrame={currentFrame}
                totalFrames={frames.length}
                fps={fps}
              />
            )}

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

            {/* Instructions & Legend - Side by side on mobile, stacked on desktop */}
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-4">
              {/* Instructions */}
              <div className="glass-panel p-3 sm:p-4 space-y-2">
                <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Controls
                </h3>
                <ul className="text-[10px] sm:text-xs text-muted-foreground space-y-0.5 sm:space-y-1">
                  <li>• Drag to rotate</li>
                  <li>• Scroll to zoom</li>
                  <li className="hidden sm:block">• Right-click drag to pan</li>
                  <li className="hidden sm:block">• Use slider to scrub frames</li>
                </ul>
              </div>

              {/* Legend */}
              <div className="glass-panel p-3 sm:p-4 space-y-2 sm:space-y-3">
                <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Legend
                </h3>
                <div className="space-y-1.5 sm:space-y-2">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-leftHand" />
                    <span className="text-xs sm:text-sm text-foreground">Left Hand</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-rightHand" />
                    <span className="text-xs sm:text-sm text-foreground">Right Hand</span>
                  </div>
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
