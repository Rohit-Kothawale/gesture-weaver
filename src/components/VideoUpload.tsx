import { useCallback, useRef, useState } from 'react';
import { Video, FileVideo, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface VideoUploadProps {
  onVideoUpload: (file: File, videoUrl: string) => void;
  hasVideo: boolean;
  videoName?: string;
  onClearVideo?: () => void;
}

const VideoUpload = ({ onVideoUpload, hasVideo, videoName, onClearVideo }: VideoUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.type.startsWith('video/')) {
        const videoUrl = URL.createObjectURL(file);
        onVideoUpload(file, videoUrl);
      }
      // Reset input so same file can be selected again
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [onVideoUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('video/')) {
        const videoUrl = URL.createObjectURL(file);
        onVideoUpload(file, videoUrl);
      }
    },
    [onVideoUpload]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="relative"
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div
        className={`
          flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-xl border-2 border-dashed
          transition-all duration-300 cursor-pointer
          ${hasVideo 
            ? 'border-primary/50 bg-primary/10 hover:border-primary' 
            : 'border-border hover:border-primary/50 bg-muted/30 hover:bg-muted/50'
          }
        `}
      >
        {hasVideo ? (
          <>
            <FileVideo className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            <span className="text-xs sm:text-sm text-foreground font-medium truncate max-w-[100px] sm:max-w-[150px]">
              {videoName}
            </span>
            {onClearVideo && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onClearVideo();
                }}
                className="ml-1 p-0.5 rounded-full hover:bg-destructive/20 transition-colors z-20 relative"
              >
                <X className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground hover:text-destructive" />
              </button>
            )}
          </>
        ) : (
          <>
            <Video className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
            <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
              Upload Video
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoUpload;
