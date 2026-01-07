import { Play, Pause, RotateCcw, ChevronFirst, ChevronLast, Gauge } from 'lucide-react';
import { Slider } from '@/components/ui/slider';

interface AnimationControlsProps {
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  onPlayPause: () => void;
  onReset: () => void;
  onFrameChange: (frame: number) => void;
  onFpsChange: (fps: number) => void;
  disabled?: boolean;
}

const AnimationControls = ({
  isPlaying,
  currentFrame,
  totalFrames,
  fps,
  onPlayPause,
  onReset,
  onFrameChange,
  onFpsChange,
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

      {/* Speed Control */}
      <div className="space-y-2 pt-2 border-t border-border/50">
        <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5" />
            <span>Speed</span>
          </div>
          <span className="text-primary font-semibold">{fps} FPS</span>
        </div>
        <Slider
          value={[fps]}
          min={5}
          max={30}
          step={1}
          onValueChange={([value]) => onFpsChange(value)}
          disabled={disabled}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/60">
          <span>Slow</span>
          <span>Fast</span>
        </div>
      </div>
    </div>
  );
};

export default AnimationControls;
