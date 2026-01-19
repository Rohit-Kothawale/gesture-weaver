import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, Play, CheckCircle2, XCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { HandFrame } from '@/types/hand-data';

interface VideoProcessorProps {
  videoUrl: string;
  videoName: string;
  onProcessingComplete: (frames: HandFrame[], label: string) => void;
  onClose: () => void;
}

const VideoProcessor = ({ videoUrl, videoName, onProcessingComplete, onClose }: VideoProcessorProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMediaPipeReady, setIsMediaPipeReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedFrames, setProcessedFrames] = useState<HandFrame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'processing' | 'complete' | 'error'>('loading');
  
  const holisticRef = useRef<any>(null);
  const currentFrameDataRef = useRef<HandFrame | null>(null);
  const processingResolveRef = useRef<(() => void) | null>(null);

  // Load MediaPipe Holistic
  useEffect(() => {
    const loadMediaPipe = async () => {
      try {
        const loadScript = (src: string): Promise<void> => {
          return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
              resolve();
              return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
          });
        };

        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/holistic.js');
        
        // @ts-ignore
        const HolisticClass = window.Holistic;
        
        if (!HolisticClass) {
          throw new Error('Holistic class not found');
        }
        
        const holistic = new HolisticClass({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/${file}`;
          }
        });

        holistic.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          refineFaceLandmarks: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        holistic.onResults((results: any) => {
          processResults(results);
          // Resolve the promise to continue processing
          if (processingResolveRef.current) {
            processingResolveRef.current();
            processingResolveRef.current = null;
          }
        });

        holisticRef.current = holistic;
        setIsMediaPipeReady(true);
        setStatus('ready');
      } catch (err) {
        console.error('MediaPipe load error:', err);
        setError('Failed to load hand tracking. Please refresh and try again.');
        setStatus('error');
      }
    };

    loadMediaPipe();
  }, []);

  // Process results from MediaPipe
  const processResults = useCallback((results: any) => {
    let leftHandLandmarks: [number, number, number][] = Array(21).fill(null).map(() => [0, 0, 0]);
    let rightHandLandmarks: [number, number, number][] = Array(21).fill(null).map(() => [0, 0, 0]);
    let leftArm: { shoulder: [number, number, number]; elbow: [number, number, number]; wrist: [number, number, number] } | undefined;
    let rightArm: { shoulder: [number, number, number]; elbow: [number, number, number]; wrist: [number, number, number] } | undefined;

    const poseLandmarks = results.poseLandmarks;
    
    if (poseLandmarks && poseLandmarks.length > 0) {
      // Left arm (indices 11, 13, 15)
      if (poseLandmarks[11] && poseLandmarks[13] && poseLandmarks[15]) {
        leftArm = {
          shoulder: [1.0 - poseLandmarks[11].x, poseLandmarks[11].y, poseLandmarks[11].z],
          elbow: [1.0 - poseLandmarks[13].x, poseLandmarks[13].y, poseLandmarks[13].z],
          wrist: [1.0 - poseLandmarks[15].x, poseLandmarks[15].y, poseLandmarks[15].z],
        };
      }
      
      // Right arm (indices 12, 14, 16)
      if (poseLandmarks[12] && poseLandmarks[14] && poseLandmarks[16]) {
        rightArm = {
          shoulder: [1.0 - poseLandmarks[12].x, poseLandmarks[12].y, poseLandmarks[12].z],
          elbow: [1.0 - poseLandmarks[14].x, poseLandmarks[14].y, poseLandmarks[14].z],
          wrist: [1.0 - poseLandmarks[16].x, poseLandmarks[16].y, poseLandmarks[16].z],
        };
      }
    }

    if (results.leftHandLandmarks) {
      leftHandLandmarks = results.leftHandLandmarks.map((lm: any) => [1.0 - lm.x, lm.y, lm.z]);
    }

    if (results.rightHandLandmarks) {
      rightHandLandmarks = results.rightHandLandmarks.map((lm: any) => [1.0 - lm.x, lm.y, lm.z]);
    }

    currentFrameDataRef.current = {
      label: videoName.replace(/\.[^/.]+$/, ''),
      leftHand: leftHandLandmarks,
      rightHand: rightHandLandmarks,
      leftArm,
      rightArm,
    };
  }, [videoName]);

  // Process video frame by frame
  const processVideo = async () => {
    if (!videoRef.current || !holisticRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsProcessing(true);
    setStatus('processing');
    setProcessedFrames([]);
    setProgress(0);

    const frames: HandFrame[] = [];
    const duration = video.duration;
    const fps = 30; // Process at 30 fps
    const frameInterval = 1 / fps;
    let currentTime = 0;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    while (currentTime < duration) {
      // Seek to the current time
      video.currentTime = currentTime;
      
      // Wait for seek to complete
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      });

      // Draw the frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Process with MediaPipe and wait for results
      currentFrameDataRef.current = null;
      await new Promise<void>((resolve) => {
        processingResolveRef.current = resolve;
        holisticRef.current.send({ image: canvas });
      });

      // Store the frame if we got results
      if (currentFrameDataRef.current) {
        frames.push(currentFrameDataRef.current);
      }

      // Update progress
      currentTime += frameInterval;
      setProgress((currentTime / duration) * 100);
    }

    setProcessedFrames(frames);
    setIsProcessing(false);
    setStatus('complete');
  };

  // Handle video load
  const handleVideoLoad = () => {
    if (status === 'ready' || isMediaPipeReady) {
      setStatus('ready');
    }
  };

  // Use processed frames
  const handleUseFrames = () => {
    if (processedFrames.length > 0) {
      onProcessingComplete(processedFrames, videoName.replace(/\.[^/.]+$/, ''));
      onClose();
    }
  };

  // Download CSV directly from processed frames
  const handleDownloadCSV = () => {
    if (processedFrames.length === 0) return;

    const label = videoName.replace(/\.[^/.]+$/, '');
    
    // Build CSV header
    const headers = ['label'];
    for (let i = 0; i < 21; i++) {
      headers.push(`L_x${i}`, `L_y${i}`, `L_z${i}`);
    }
    for (let i = 0; i < 21; i++) {
      headers.push(`R_x${i}`, `R_y${i}`, `R_z${i}`);
    }
    // Add arm headers
    headers.push('LA_shoulder_x', 'LA_shoulder_y', 'LA_shoulder_z');
    headers.push('LA_elbow_x', 'LA_elbow_y', 'LA_elbow_z');
    headers.push('LA_wrist_x', 'LA_wrist_y', 'LA_wrist_z');
    headers.push('RA_shoulder_x', 'RA_shoulder_y', 'RA_shoulder_z');
    headers.push('RA_elbow_x', 'RA_elbow_y', 'RA_elbow_z');
    headers.push('RA_wrist_x', 'RA_wrist_y', 'RA_wrist_z');

    // Build CSV rows
    const rows = processedFrames.map(frame => {
      const row: (string | number)[] = [frame.label];
      
      // Left hand landmarks
      for (let i = 0; i < 21; i++) {
        if (frame.leftHand && frame.leftHand[i]) {
          row.push(frame.leftHand[i][0], frame.leftHand[i][1], frame.leftHand[i][2]);
        } else {
          row.push(0, 0, 0);
        }
      }
      
      // Right hand landmarks
      for (let i = 0; i < 21; i++) {
        if (frame.rightHand && frame.rightHand[i]) {
          row.push(frame.rightHand[i][0], frame.rightHand[i][1], frame.rightHand[i][2]);
        } else {
          row.push(0, 0, 0);
        }
      }
      
      // Left arm landmarks
      if (frame.leftArm) {
        row.push(frame.leftArm.shoulder[0], frame.leftArm.shoulder[1], frame.leftArm.shoulder[2]);
        row.push(frame.leftArm.elbow[0], frame.leftArm.elbow[1], frame.leftArm.elbow[2]);
        row.push(frame.leftArm.wrist[0], frame.leftArm.wrist[1], frame.leftArm.wrist[2]);
      } else {
        row.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
      
      // Right arm landmarks
      if (frame.rightArm) {
        row.push(frame.rightArm.shoulder[0], frame.rightArm.shoulder[1], frame.rightArm.shoulder[2]);
        row.push(frame.rightArm.elbow[0], frame.rightArm.elbow[1], frame.rightArm.elbow[2]);
        row.push(frame.rightArm.wrist[0], frame.rightArm.wrist[1], frame.rightArm.wrist[2]);
      } else {
        row.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
      
      return row.join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${label}_landmarks.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-panel p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Process Video with MediaPipe</h3>
        <Button onClick={onClose} variant="ghost" size="sm">×</Button>
      </div>

      {/* Video Preview */}
      <div className="relative aspect-video bg-black/50 rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl}
          className="w-full h-full object-contain"
          onLoadedMetadata={handleVideoLoad}
          muted
          playsInline
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Overlay Status */}
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-center space-y-2">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Loading MediaPipe...</p>
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      {isProcessing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Processing frames...</span>
            <span className="text-primary font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {/* Status Messages */}
      {status === 'error' && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <XCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {status === 'complete' && (
        <div className="flex items-center gap-2 text-green-500 text-sm">
          <CheckCircle2 className="w-4 h-4" />
          <span>Extracted {processedFrames.length} frames with hand landmarks</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {status === 'ready' && !isProcessing && (
          <Button onClick={processVideo} className="flex-1">
            <Play className="w-4 h-4 mr-2" />
            Extract Hand Landmarks
          </Button>
        )}
        
        {status === 'complete' && processedFrames.length > 0 && (
          <>
            <Button onClick={handleUseFrames} className="flex-1">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Use Frames ({processedFrames.length})
            </Button>
            <Button onClick={handleDownloadCSV} variant="secondary">
              <Download className="w-4 h-4 mr-2" />
              Download CSV
            </Button>
          </>
        )}
        
        <Button onClick={onClose} variant="outline">
          Cancel
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        This will process the video frame by frame to extract hand and arm landmarks using MediaPipe Holistic.
        The extracted data can then be viewed in Hands Only or Avatar mode.
      </p>
    </div>
  );
};

export default VideoProcessor;
