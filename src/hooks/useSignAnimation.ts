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
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  reset: () => void;
  setFrame: (frame: number) => void;
  fps: number;
  setFps: (fps: number) => void;
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
    play,
    pause,
    togglePlay,
    reset,
    setFrame,
    fps,
    setFps,
  };
};
