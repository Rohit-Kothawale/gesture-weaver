import { Play, Pause, RotateCcw, ChevronFirst, ChevronLast } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface AnimationControlsProps {
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
  onPlayPause: () => void;
  onReset: () => void;
  onFrameChange: (frame: number) => void;
  disabled?: boolean;
}

const AnimationControls = ({
  isPlaying,
  currentFrame,
  totalFrames,
  onPlayPause,
  onReset,
  onFrameChange,
  disabled = false,
}: AnimationControlsProps) => {
  return (
    <div className="glass-panel p-4 space-y-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-mono text-muted-foreground">
          <span>Frame {currentFrame + 1}</span>
          <span>{totalFrames} total</span>
        </div>
        <Slider
          value={[currentFrame]}
          max={Math.max(0, totalFrames - 1)}
          step={1}
          onValueChange={([value]) => onFrameChange(value)}
          disabled={disabled || totalFrames === 0}
          className="w-full"
        />
      </div>

      {/* Control buttons */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => onFrameChange(0)}
          disabled={disabled}
          className="control-button p-2"
          title="First frame"
        >
          <ChevronFirst className="w-5 h-5" />
        </button>

        <button
          onClick={onReset}
          disabled={disabled}
          className="control-button p-2"
          title="Reset"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        <button
          onClick={onPlayPause}
          disabled={disabled}
          className="control-button-primary p-3 rounded-full"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6 ml-0.5" />
          )}
        </button>

        <button
          onClick={() => onFrameChange(Math.max(0, totalFrames - 1))}
          disabled={disabled}
          className="control-button p-2"
          title="Last frame"
        >
          <ChevronLast className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default AnimationControls;
