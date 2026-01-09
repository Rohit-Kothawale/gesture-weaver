import { useState, useCallback, useEffect, useRef } from 'react';
import Papa from 'papaparse';
import { HandFrame, RawCSVRow, parseCSVRow } from '@/types/hand-data';

interface UseSignAnimationReturn {
  frames: HandFrame[];
  currentFrame: number;
  isPlaying: boolean;
  isLoading: boolean;
  fileName: string | null;
  loadFile: (file: File) => void;
  loadFromUrl: (url: string) => void;
  loadFrames: (frames: HandFrame[], name: string) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  reset: () => void;
  setFrame: (frame: number) => void;
  fps: number;
  setFps: (fps: number) => void;
  downloadCSV: () => void;
}

export const useSignAnimation = (): UseSignAnimationReturn => {
  const [frames, setFrames] = useState<HandFrame[]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fps, setFps] = useState(12);
  
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const parseCSV = useCallback((csvText: string) => {
    const result = Papa.parse<RawCSVRow>(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    });

    const parsedFrames = result.data.map(parseCSVRow);
    setFrames(parsedFrames);
    setCurrentFrame(0);
    setIsPlaying(true);
  }, []);

  const loadFile = useCallback((file: File) => {
    setIsLoading(true);
    setFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      parseCSV(text);
      setIsLoading(false);
    };
    reader.readAsText(file);
  }, [parseCSV]);

  const loadFromUrl = useCallback(async (url: string) => {
    setIsLoading(true);
    setFileName(url.split('/').pop() || 'data.csv');
    
    try {
      const response = await fetch(url);
      const text = await response.text();
      parseCSV(text);
    } catch (error) {
      console.error('Failed to load CSV:', error);
    }
    setIsLoading(false);
  }, [parseCSV]);

  const loadFrames = useCallback((newFrames: HandFrame[], name: string) => {
    setFrames(newFrames);
    setFileName(name);
    setCurrentFrame(0);
    setIsPlaying(true);
  }, []);

  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);
  const togglePlay = useCallback(() => setIsPlaying((p) => !p), []);
  
  const reset = useCallback(() => {
    setCurrentFrame(0);
    setIsPlaying(false);
  }, []);

  const setFrame = useCallback((frame: number) => {
    setCurrentFrame(Math.max(0, Math.min(frame, frames.length - 1)));
  }, [frames.length]);

  const downloadCSV = useCallback(() => {
    if (frames.length === 0) return;

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
    const rows = frames.map(frame => {
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
    link.download = fileName?.replace('.csv', '_export.csv') || 'hand_data_export.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [frames, fileName]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || frames.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const frameInterval = 1000 / fps;

    const animate = (timestamp: number) => {
      if (timestamp - lastTimeRef.current >= frameInterval) {
        setCurrentFrame((prev) => {
          const next = prev + 1;
          if (next >= frames.length) {
            return 0; // Loop
          }
          return next;
        });
        lastTimeRef.current = timestamp;
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, frames.length, fps]);

  return {
    frames,
    currentFrame,
    isPlaying,
    isLoading,
    fileName,
    loadFile,
    loadFromUrl,
    loadFrames,
    play,
    pause,
    togglePlay,
    reset,
    setFrame,
    fps,
    setFps,
    downloadCSV,
  };
};
