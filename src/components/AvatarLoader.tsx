// components/AvatarLoader.tsx
import { Html, useProgress } from "@react-three/drei";

export function AvatarLoader() {
  const { progress } = useProgress();

  return (
    <Html center>
      <div className="flex flex-col items-center min-w-[220px] gap-4 rounded-3xl bg-card/80 p-8 shadow-2xl backdrop-blur-md border border-border/50 text-foreground">

        {/* Loading Spinner Ring */}
        <div className="relative h-12 w-12 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <div
            className="absolute inset-0 rounded-full border-2 border-t-primary animate-spin"
            style={{ animationDuration: '1.5s' }}
          />
          <span className="text-[10px] font-bold text-primary">{progress.toFixed(0)}%</span>
        </div>

        {/* Your Text Section */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs font-bold tracking-wider text-foreground uppercase">
            Initializing Avatar
          </span>
          <span className="text-[10px] text-muted-foreground italic">
            please wait...
          </span>
        </div>

        {/* Modern Progress Bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

      </div>
    </Html>
  );
}
