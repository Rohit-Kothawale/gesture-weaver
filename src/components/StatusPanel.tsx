import { Hand, Activity } from 'lucide-react';
import { HandFrame, isHandVisible } from '@/types/hand-data';

interface StatusPanelProps {
  frame: HandFrame | null;
  fps: number;
}

const StatusPanel = ({ frame, fps }: StatusPanelProps) => {
  const leftVisible = frame ? isHandVisible(frame.leftHand) : false;
  const rightVisible = frame ? isHandVisible(frame.rightHand) : false;

  return (
    <div className="glass-panel p-3 sm:p-4 space-y-2 sm:space-y-3">
      <h3 className="text-xs sm:text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Status
      </h3>
      
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {/* Left Hand Status */}
        <div className={`
          flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg
          ${leftVisible ? 'bg-leftHand/10 border border-leftHand/30' : 'bg-muted/30 border border-border/30'}
        `}>
          <Hand className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${leftVisible ? 'text-leftHand' : 'text-muted-foreground'}`} />
          <span className={`text-[10px] sm:text-xs font-medium ${leftVisible ? 'text-leftHand' : 'text-muted-foreground'}`}>
            Left
          </span>
          <span className={`
            ml-auto w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full
            ${leftVisible ? 'bg-leftHand animate-pulse' : 'bg-muted-foreground/30'}
          `} />
        </div>

        {/* Right Hand Status */}
        <div className={`
          flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg
          ${rightVisible ? 'bg-rightHand/10 border border-rightHand/30' : 'bg-muted/30 border border-border/30'}
        `}>
          <Hand className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transform scale-x-[-1] ${rightVisible ? 'text-rightHand' : 'text-muted-foreground'}`} />
          <span className={`text-[10px] sm:text-xs font-medium ${rightVisible ? 'text-rightHand' : 'text-muted-foreground'}`}>
            Right
          </span>
          <span className={`
            ml-auto w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full
            ${rightVisible ? 'bg-rightHand animate-pulse' : 'bg-muted-foreground/30'}
          `} />
        </div>
      </div>

      {/* FPS */}
      <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-muted/30 border border-border/30">
        <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
        <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">Playback</span>
        <span className="ml-auto text-[10px] sm:text-xs font-mono text-primary">{fps} FPS</span>
      </div>
    </div>
  );
};

export default StatusPanel;
