import { useRef, useEffect } from 'react';
import { X, Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VideoPlayerProps {
  videoUrl: string;
  videoName: string;
  onClose: () => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  currentTime?: number;
}

const VideoPlayer = ({
  videoUrl,
  videoName,
  onClose,
  isPlaying,
  onPlayPause,
  onTimeUpdate,
  currentTime,
}: VideoPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    if (videoRef.current && currentTime !== undefined) {
      const diff = Math.abs(videoRef.current.currentTime - currentTime);
      if (diff > 0.1) {
        videoRef.current.currentTime = currentTime;
      }
    }
  }, [currentTime]);

  const handleTimeUpdate = () => {
    if (videoRef.current && onTimeUpdate) {
      onTimeUpdate(videoRef.current.currentTime, videoRef.current.duration);
    }
  };

  const handleRestart = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <div className="glass-panel p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Video Reference
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 sm:h-8 sm:w-8"
          onClick={onClose}
        >
          <X className="w-3 h-3 sm:w-4 sm:h-4" />
        </Button>
      </div>
      
      <div className="relative rounded-lg overflow-hidden bg-black/50">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-auto max-h-[200px] sm:max-h-[250px] object-contain"
          onTimeUpdate={handleTimeUpdate}
          loop
          playsInline
          muted
        />
      </div>

      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRestart}
          className="h-7 sm:h-8 px-2 sm:px-3"
        >
          <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4" />
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={onPlayPause}
          className="h-7 sm:h-8 px-3 sm:px-4"
        >
          {isPlaying ? (
            <Pause className="w-3 h-3 sm:w-4 sm:h-4" />
          ) : (
            <Play className="w-3 h-3 sm:w-4 sm:h-4" />
          )}
        </Button>
      </div>

      <p className="text-[10px] sm:text-xs text-muted-foreground text-center truncate">
        {videoName}
      </p>
    </div>
  );
};

export default VideoPlayer;
