import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Square, Download, Play, Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HandFrame } from '@/types/hand-data';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Avatar3D from './Avatar3D';

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
  const [showAvatarPreview, setShowAvatarPreview] = useState(true);
  const [currentFrame, setCurrentFrame] = useState<HandFrame | null>(null);
  
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

  // Initialize MediaPipe Holistic for full body + hands tracking
  useEffect(() => {
    const loadMediaPipe = async () => {
      try {
        // Load Holistic from CDN for full body tracking
        const holisticModule = await import('@mediapipe/holistic');
        const HolisticClass = holisticModule.Holistic || (holisticModule as any).default?.Holistic;
        
        if (!HolisticClass) {
          throw new Error('Holistic class not found in module');
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
        });

        handsRef.current = holistic;
        console.log('MediaPipe Holistic loaded successfully');
        setIsMediaPipeReady(true);
      } catch (err) {
        console.error('MediaPipe Holistic load error, falling back to Hands:', err);
        // Fallback to Hands-only
        try {
          const handsModule = await import('@mediapipe/hands');
          const HandsClass = handsModule.Hands || (handsModule as any).default?.Hands;
          
          if (!HandsClass) {
            throw new Error('Hands class not found in module');
          }
          
          const hands = new HandsClass({
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
          console.log('MediaPipe Hands loaded (fallback)');
          setIsMediaPipeReady(true);
        } catch (fallbackErr) {
          console.error('MediaPipe load error:', fallbackErr);
          setError('Failed to load hand tracking. Please refresh the page.');
        }
      }
    };

    loadMediaPipe();
  }, []);

  // Process hand tracking results (supports both Holistic and Hands-only)
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
    let leftArm: { shoulder: [number, number, number]; elbow: [number, number, number]; wrist: [number, number, number] } | undefined;
    let rightArm: { shoulder: [number, number, number]; elbow: [number, number, number]; wrist: [number, number, number] } | undefined;

    // Check if this is Holistic results (has poseLandmarks) or Hands-only results
    const isHolistic = results.poseLandmarks !== undefined;

    if (isHolistic) {
      // Process Holistic results - extract pose landmarks for arms
      const poseLandmarks = results.poseLandmarks;
      
      // MediaPipe Holistic naming convention:
      // - "left" in MediaPipe = the person's actual left side (appears on RIGHT of camera view)
      // - "right" in MediaPipe = the person's actual right side (appears on LEFT of camera view)
      // 
      // After mirroring (1.0 - x), the avatar's left side should match user's left side
      // So: MediaPipe leftHand -> avatar leftHand, MediaPipe rightHand -> avatar rightHand
      // But arm indices: 11,13,15 = MediaPipe "left" side, 12,14,16 = MediaPipe "right" side
      
      if (poseLandmarks && poseLandmarks.length > 0) {
        // MediaPipe "left" arm (indices 11, 13, 15) = user's actual left arm
        // This should connect to leftHandLandmarks
        if (poseLandmarks[11] && poseLandmarks[13] && poseLandmarks[15]) {
          leftArm = {
            shoulder: [1.0 - poseLandmarks[11].x, poseLandmarks[11].y, poseLandmarks[11].z],
            elbow: [1.0 - poseLandmarks[13].x, poseLandmarks[13].y, poseLandmarks[13].z],
            wrist: [1.0 - poseLandmarks[15].x, poseLandmarks[15].y, poseLandmarks[15].z],
          };
          
          // Draw left arm on canvas (cyan to match left hand)
          ctx.strokeStyle = '#00d4ff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(poseLandmarks[11].x * canvasRef.current!.width, poseLandmarks[11].y * canvasRef.current!.height);
          ctx.lineTo(poseLandmarks[13].x * canvasRef.current!.width, poseLandmarks[13].y * canvasRef.current!.height);
          ctx.lineTo(poseLandmarks[15].x * canvasRef.current!.width, poseLandmarks[15].y * canvasRef.current!.height);
          ctx.stroke();
        }
        
        // MediaPipe "right" arm (indices 12, 14, 16) = user's actual right arm
        // This should connect to rightHandLandmarks
        if (poseLandmarks[12] && poseLandmarks[14] && poseLandmarks[16]) {
          rightArm = {
            shoulder: [1.0 - poseLandmarks[12].x, poseLandmarks[12].y, poseLandmarks[12].z],
            elbow: [1.0 - poseLandmarks[14].x, poseLandmarks[14].y, poseLandmarks[14].z],
            wrist: [1.0 - poseLandmarks[16].x, poseLandmarks[16].y, poseLandmarks[16].z],
          };
          
          // Draw right arm on canvas (green to match right hand)
          ctx.strokeStyle = '#00ff88';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(poseLandmarks[12].x * canvasRef.current!.width, poseLandmarks[12].y * canvasRef.current!.height);
          ctx.lineTo(poseLandmarks[14].x * canvasRef.current!.width, poseLandmarks[14].y * canvasRef.current!.height);
          ctx.lineTo(poseLandmarks[16].x * canvasRef.current!.width, poseLandmarks[16].y * canvasRef.current!.height);
          ctx.stroke();
        }
      }

      // MediaPipe leftHandLandmarks = user's actual left hand
      if (results.leftHandLandmarks) {
        const landmarks = results.leftHandLandmarks;
        const color = '#00d4ff'; // Cyan for left
        
        landmarks.forEach((landmark: any) => {
          const x = landmark.x * canvasRef.current!.width;
          const y = landmark.y * canvasRef.current!.height;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        });

        // Mirror X for avatar display
        leftHandLandmarks = landmarks.map((lm: any) => [1.0 - lm.x, lm.y, lm.z]);
      }

      // MediaPipe rightHandLandmarks = user's actual right hand  
      if (results.rightHandLandmarks) {
        const landmarks = results.rightHandLandmarks;
        const color = '#00ff88'; // Green for right
        
        landmarks.forEach((landmark: any) => {
          const x = landmark.x * canvasRef.current!.width;
          const y = landmark.y * canvasRef.current!.height;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        });

        // Mirror X for avatar display
        rightHandLandmarks = landmarks.map((lm: any) => [1.0 - lm.x, lm.y, lm.z]);
      }
    } else {
      // Original Hands-only processing
      if (results.multiHandLandmarks && results.multiHandedness) {
        results.multiHandLandmarks.forEach((landmarks: any[], index: number) => {
          const handedness = results.multiHandedness[index].label;
          const color = handedness === 'Left' ? '#ff6b6b' : '#4ecdc4';
          
          landmarks.forEach((landmark: any) => {
            const x = landmark.x * canvasRef.current!.width;
            const y = landmark.y * canvasRef.current!.height;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          });

          const connections = [
            [0, 1], [1, 2], [2, 3], [3, 4],
            [0, 5], [5, 6], [6, 7], [7, 8],
            [5, 9], [9, 10], [10, 11], [11, 12],
            [9, 13], [13, 14], [14, 15], [15, 16],
            [13, 17], [17, 18], [18, 19], [19, 20],
            [0, 17]
          ];

          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          connections.forEach(([start, end]) => {
            ctx.beginPath();
            ctx.moveTo(landmarks[start].x * canvasRef.current!.width, landmarks[start].y * canvasRef.current!.height);
            ctx.lineTo(landmarks[end].x * canvasRef.current!.width, landmarks[end].y * canvasRef.current!.height);
            ctx.stroke();
          });

          const landmarkData: [number, number, number][] = landmarks.map((lm: any) => [1.0 - lm.x, lm.y, lm.z]);

          if (handedness === 'Right') {
            leftHandLandmarks = landmarkData;
          } else {
            rightHandLandmarks = landmarkData;
          }
        });
      }
    }

    ctx.restore();

    // Create current frame for live preview
    const liveFrame: HandFrame = {
      label: signLabel || 'Live',
      leftHand: leftHandLandmarks,
      rightHand: rightHandLandmarks,
      leftArm,
      rightArm,
    };
    setCurrentFrame(liveFrame);

    // Record frame if recording
    if (recordingRef.current) {
      const frame: HandFrame = {
        label: signLabel || 'Recorded',
        leftHand: leftHandLandmarks,
        rightHand: rightHandLandmarks,
        leftArm,
        rightArm,
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
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => setShowAvatarPreview(!showAvatarPreview)} 
            variant={showAvatarPreview ? "default" : "outline"}
            size="sm"
            title="Toggle Avatar Preview"
          >
            <User className="w-4 h-4" />
          </Button>
          <Button onClick={onClose} variant="ghost" size="sm">×</Button>
        </div>
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

      {/* Video and Avatar Preview */}
      <div className={`grid gap-3 ${showAvatarPreview ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {/* Camera Feed */}
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
          
          <div className="absolute top-3 right-3 bg-black/70 px-2 py-1 rounded text-xs text-white">
            Camera
          </div>
        </div>

        {/* Live Avatar Preview */}
        {showAvatarPreview && (
          <div className="relative rounded-lg overflow-hidden bg-gradient-to-b from-slate-800 to-slate-900 aspect-[4/3]">
            <Canvas
              camera={{ position: [0, 0.5, 2.5], fov: 50 }}
              className="w-full h-full"
            >
              <ambientLight intensity={0.6} />
              <directionalLight position={[5, 5, 5]} intensity={0.8} />
              <directionalLight position={[-5, 3, -5]} intensity={0.3} />
              <Avatar3D frame={currentFrame} />
              <OrbitControls 
                enableZoom={false}
                enablePan={false}
                minPolarAngle={Math.PI / 3}
                maxPolarAngle={Math.PI / 1.8}
              />
            </Canvas>
            
            <div className="absolute top-3 right-3 bg-black/70 px-2 py-1 rounded text-xs text-white">
              Live Preview
            </div>
            
            {currentFrame && (
              <div className="absolute bottom-3 left-3 bg-black/70 px-2 py-1 rounded text-xs text-green-400">
                ● Tracking
              </div>
            )}
          </div>
        )}
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
