import { useRef, useEffect, useState } from 'react';
import { X, Link, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

interface VideoPlayerProps {
  videoUrl: string;
  videoName: string;
  onClose: () => void;
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  onVideoDurationDetected?: (duration: number) => void;
}

const VideoPlayer = ({
  videoUrl,
  videoName,
  onClose,
  isPlaying,
  currentFrame,
  totalFrames,
  fps,
  onVideoDurationDetected,
}: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isSynced, setIsSynced] = useState(true);
  const [videoDuration, setVideoDuration] = useState(0);

  // Handle video metadata loaded
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      setVideoDuration(duration);
      onVideoDurationDetected?.(duration);
    }
  };

  // Sync video playback with animation
  useEffect(() => {
    if (!videoRef.current || !isSynced) return;

    if (isPlaying) {
      videoRef.current.play().catch(() => {
        // Autoplay might be blocked, that's okay
      });
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, isSynced]);

  // Sync video time with current frame
  useEffect(() => {
    if (!videoRef.current || !isSynced || videoDuration === 0 || totalFrames === 0) return;

    // Calculate the target time based on current frame
    const frameProgress = currentFrame / totalFrames;
    const targetTime = frameProgress * videoDuration;

    // Only seek if the difference is significant (to avoid jitter)
    const currentVideoTime = videoRef.current.currentTime;
    const diff = Math.abs(currentVideoTime - targetTime);
    
    // Seek if difference is more than half a frame duration
    const frameDuration = 1 / fps;
    if (diff > frameDuration * 0.5) {
      videoRef.current.currentTime = targetTime;
    }
  }, [currentFrame, totalFrames, videoDuration, fps, isSynced]);

  // Set playback rate to match animation speed
  useEffect(() => {
    if (!videoRef.current || !isSynced || videoDuration === 0 || totalFrames === 0) return;

    // Calculate the natural video FPS equivalent
    const animationDuration = totalFrames / fps;
    const playbackRate = videoDuration / animationDuration;
    
    // Clamp playback rate to valid range (0.25 to 4)
    const clampedRate = Math.max(0.25, Math.min(4, playbackRate));
    videoRef.current.playbackRate = clampedRate;
  }, [fps, totalFrames, videoDuration, isSynced]);

  return (
    <div className="glass-panel p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Video Reference
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 sm:h-8 sm:w-8"
            onClick={onClose}
          >
            <X className="w-3 h-3 sm:w-4 sm:h-4" />
          </Button>
        </div>
      </div>
      
      <div className="relative rounded-lg overflow-hidden bg-black/50">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-auto max-h-[200px] sm:max-h-[250px] object-contain"
          onLoadedMetadata={handleLoadedMetadata}
          loop
          playsInline
          muted
        />
        
        {/* Sync indicator overlay */}
        {isSynced && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-primary/80 text-[10px] text-primary-foreground font-medium flex items-center gap-1">
            <Link className="w-2.5 h-2.5" />
            Synced
          </div>
        )}
      </div>

      {/* Sync toggle */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          {isSynced ? (
            <Link className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
          ) : (
            <Unlink className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground" />
          )}
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            Sync with animation
          </span>
        </div>
        <Switch
          checked={isSynced}
          onCheckedChange={setIsSynced}
          className="scale-75 sm:scale-90"
        />
      </div>

      <p className="text-[10px] sm:text-xs text-muted-foreground text-center truncate">
        {videoName}
      </p>
    </div>
  );
};

export default VideoPlayer;
