import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Square, Download, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HandFrame } from '@/types/hand-data';

interface CameraCaptureProps {
  onFramesCaptured: (frames: HandFrame[], label: string) => void;
  onClose: () => void;
}

const CameraCapture = ({ onFramesCaptured, onClose }: CameraCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFrames, setRecordedFrames] = useState<HandFrame[]>([]);
  const [signLabel, setSignLabel] = useState('');
  const [isMediaPipeReady, setIsMediaPipeReady] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handsRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);
  const recordingRef = useRef(false);
  const framesRef = useRef<HandFrame[]>([]);

  // Initialize camera
  useEffect(() => {
    let stream: MediaStream | null = null;

    const initCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setIsCameraReady(true);
        }
      } catch (err) {
        console.error('Camera error:', err);
        setError('Unable to access camera. Please grant camera permissions.');
      }
    };

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Initialize MediaPipe Hands
  useEffect(() => {
    const loadMediaPipe = async () => {
      try {
        // @ts-ignore - MediaPipe is loaded dynamically
        const { Hands } = await import('@mediapipe/hands');
        
        const hands = new Hands({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          }
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        hands.onResults((results: any) => {
          processResults(results);
        });

        handsRef.current = hands;
        setIsMediaPipeReady(true);
      } catch (err) {
        console.error('MediaPipe load error:', err);
        setError('Failed to load hand tracking. Please refresh the page.');
      }
    };

    loadMediaPipe();
  }, []);

  // Process hand tracking results
  const processResults = useCallback((results: any) => {
    if (!canvasRef.current || !videoRef.current) return;
    
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Draw video frame
    ctx.save();
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);

    // Initialize empty landmarks
    let leftHandLandmarks: [number, number, number][] = Array(21).fill([0, 0, 0]);
    let rightHandLandmarks: [number, number, number][] = Array(21).fill([0, 0, 0]);

    if (results.multiHandLandmarks && results.multiHandedness) {
      results.multiHandLandmarks.forEach((landmarks: any[], index: number) => {
        const handedness = results.multiHandedness[index].label;
        const color = handedness === 'Left' ? '#ff6b6b' : '#4ecdc4';
        
        // Draw landmarks
        landmarks.forEach((landmark: any) => {
          const x = landmark.x * canvasRef.current!.width;
          const y = landmark.y * canvasRef.current!.height;
          
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        });

        // Draw connections
        const connections = [
          [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
          [0, 5], [5, 6], [6, 7], [7, 8], // Index
          [5, 9], [9, 10], [10, 11], [11, 12], // Middle
          [9, 13], [13, 14], [14, 15], [15, 16], // Ring
          [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
          [0, 17]
        ];

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        connections.forEach(([start, end]) => {
          const startX = landmarks[start].x * canvasRef.current!.width;
          const startY = landmarks[start].y * canvasRef.current!.height;
          const endX = landmarks[end].x * canvasRef.current!.width;
          const endY = landmarks[end].y * canvasRef.current!.height;
          
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        });

        // Store landmarks with X mirrored to match avatar perspective
        // Camera shows mirror image, so we flip X to correct orientation
        const landmarkData: [number, number, number][] = landmarks.map((lm: any) => [
          1.0 - lm.x, // Mirror X so movements match avatar
          lm.y,
          lm.z
        ]);

        // After mirroring X, assign hands correctly:
        // Your left hand appears on the right side of mirrored camera
        // MediaPipe sees it as "Right" from camera's perspective
        // After X flip, it should be assigned to leftHand
        if (handedness === 'Right') {
          leftHandLandmarks = landmarkData;
        } else {
          rightHandLandmarks = landmarkData;
        }
      });
    }

    ctx.restore();

    // Record frame if recording
    if (recordingRef.current) {
      const frame: HandFrame = {
        label: signLabel || 'Recorded',
        leftHand: leftHandLandmarks,
        rightHand: rightHandLandmarks
      };
      framesRef.current.push(frame);
      setRecordedFrames([...framesRef.current]);
    }
  }, [signLabel]);

  // Detection loop
  useEffect(() => {
    if (!isMediaPipeReady || !isCameraReady) return;

    const detect = async () => {
      if (videoRef.current && handsRef.current) {
        try {
          await handsRef.current.send({ image: videoRef.current });
        } catch (err) {
          console.error('Detection error:', err);
        }
      }
      animationRef.current = requestAnimationFrame(detect);
    };

    detect();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isMediaPipeReady, isCameraReady]);

  const startRecording = () => {
    framesRef.current = [];
    setRecordedFrames([]);
    recordingRef.current = true;
    setIsRecording(true);
  };

  const stopRecording = () => {
    recordingRef.current = false;
    setIsRecording(false);
  };

  const downloadCSV = () => {
    if (recordedFrames.length === 0) return;

    // Generate CSV header
    let header = 'label';
    for (let i = 0; i < 21; i++) {
      header += `,L_x${i},L_y${i},L_z${i}`;
    }
    for (let i = 0; i < 21; i++) {
      header += `,R_x${i},R_y${i},R_z${i}`;
    }

    // Generate CSV rows
    const rows = recordedFrames.map(frame => {
      let row = frame.label;
      frame.leftHand.forEach(([x, y, z]) => {
        row += `,${x},${y},${z}`;
      });
      frame.rightHand.forEach(([x, y, z]) => {
        row += `,${x},${y},${z}`;
      });
      return row;
    });

    const csvContent = header + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${signLabel || 'recording'}_sign_data.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const useRecording = () => {
    if (recordedFrames.length > 0) {
      onFramesCaptured(recordedFrames, signLabel || 'Recorded');
      onClose();
    }
  };

  if (error) {
    return (
      <div className="glass-panel p-6 text-center space-y-4">
        <p className="text-destructive">{error}</p>
        <Button onClick={onClose} variant="outline">Close</Button>
      </div>
    );
  }

  return (
    <div className="glass-panel p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Camera className="w-5 h-5" />
          Camera Capture
        </h3>
        <Button onClick={onClose} variant="ghost" size="sm">×</Button>
      </div>

      {/* Sign Label Input */}
      <div>
        <label className="text-sm text-muted-foreground block mb-1">Sign Label</label>
        <input
          type="text"
          value={signLabel}
          onChange={(e) => setSignLabel(e.target.value)}
          placeholder="e.g., Hello, Thank You..."
          className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Video Preview */}
      <div className="relative rounded-lg overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover opacity-0"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="w-full h-auto"
        />
        
        {!isMediaPipeReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center space-y-2">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-white">Loading hand tracking...</p>
            </div>
          </div>
        )}

        {isRecording && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-destructive px-3 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-xs text-white font-medium">REC</span>
          </div>
        )}

        <div className="absolute bottom-3 right-3 bg-black/70 px-2 py-1 rounded text-xs text-white">
          {recordedFrames.length} frames
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        {!isRecording ? (
          <Button
            onClick={startRecording}
            disabled={!isMediaPipeReady}
            className="flex-1"
          >
            <Camera className="w-4 h-4 mr-2" />
            Start Recording
          </Button>
        ) : (
          <Button
            onClick={stopRecording}
            variant="destructive"
            className="flex-1"
          >
            <Square className="w-4 h-4 mr-2" />
            Stop Recording
          </Button>
        )}
      </div>

      {recordedFrames.length > 0 && !isRecording && (
        <div className="flex gap-2">
          <Button onClick={downloadCSV} variant="outline" className="flex-1">
            <Download className="w-4 h-4 mr-2" />
            Download CSV
          </Button>
          <Button onClick={useRecording} className="flex-1">
            <Play className="w-4 h-4 mr-2" />
            Use Recording
          </Button>
        </div>
      )}

      {/* Instructions */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>• Position your hands in view of the camera</p>
        <p>• Click "Start Recording" and perform your sign</p>
        <p>• Click "Stop Recording" when done</p>
        <p>• Download CSV or use directly with avatar</p>
      </div>
    </div>
  );
};

export default CameraCapture;
