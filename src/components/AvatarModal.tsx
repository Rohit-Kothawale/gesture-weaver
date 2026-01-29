import { Suspense, useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, OrthographicCamera, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HandFrame, isHandVisible } from '@/types/hand-data';

interface AvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  frame: HandFrame | null;
  frames?: HandFrame[];
  currentFrameIndex?: number;
  isPlaying?: boolean;
  animationSpeed?: number;
}

// =============================================================================
// BONE MAPPING - Female_05.glb specific names
// =============================================================================
// The model uses lowercase bone names with specific patterns:
// - Arms: leftshoulder, leftupperarm, leftlowerarm, leftarm (wrist)
// - Fingers: leftthumb, leftthumb2, leftthumb1, leftindexfinger, etc.
// Note: "leftHand" doesn't exist - use "leftarm" as the wrist bone

const BONE_NAMES: Record<string, string> = {
  // Spine
  hips: 'hips',
  spine: 'spin', // Model uses 'spin' not 'spine'
  neck: 'neck',
  head: 'head',

  // Left arm (MediaPipe Pose: Shoulder 11→Elbow 13→Wrist 15)
  leftShoulder: 'leftshoulder',
  leftUpperArm: 'leftupperarm',
  leftLowerArm: 'leftlowerarm',
  leftHand: 'leftarm', // Model uses 'leftarm' as the wrist/hand bone

  // Right arm (MediaPipe Pose: Shoulder 12→Elbow 14→Wrist 16)
  rightShoulder: 'rightshoulder',
  rightUpperArm: 'rightupperarm',
  rightLowerArm: 'rightlowerarm',
  rightHand: 'rightarm', // Model uses 'rightarm' as the wrist/hand bone

  // Left fingers (MediaPipe Hand landmarks 0-20)
  // Thumb: indices [1, 2, 3, 4]
  leftThumb1: 'leftthumb',
  leftThumb2: 'leftthumb2',
  leftThumb3: 'leftthumb1',
  // Index: indices [5, 6, 7, 8]
  leftIndex1: 'leftindexfinger',
  leftIndex2: 'leftindexfinger3',
  leftIndex3: 'leftindexfinger2',
  // Middle: indices [9, 10, 11, 12]
  leftMiddle1: 'leftmiddlefinger',
  leftMiddle2: 'leftmiddlefinger3',
  leftMiddle3: 'leftmiddlefinger2',
  // Ring: indices [13, 14, 15, 16]
  leftRing1: 'leftringfinger',
  leftRing2: 'leftringfinger3',
  leftRing3: 'leftringfinger2',
  // Pinky: indices [17, 18, 19, 20]
  leftPinky1: 'leftlittlefinger',
  leftPinky2: 'leftlittlefinger3',
  leftPinky3: 'leftlittlefinger2',

  // Right fingers
  rightThumb1: 'rightthumb',
  rightThumb2: 'rightthumb2',
  rightThumb3: 'rightthumb1',
  rightIndex1: 'rightindexfinger',
  rightIndex2: 'rightindexfinger3',
  rightIndex3: 'rightindexfinger2',
  rightMiddle1: 'rightmiddlefinger',
  rightMiddle2: 'rightmiddlefinger3',
  rightMiddle3: 'rightmiddlefinger2',
  rightRing1: 'rightringfinger',
  rightRing2: 'rightringfinger3',
  rightRing3: 'rightringfinger2',
  rightPinky1: 'rightlittlefinger',
  rightPinky2: 'rightlittlefinger3',
  rightPinky3: 'rightlittlefinger2',
};

// Finger landmark indices in MediaPipe format (0 = wrist, 1-4 = thumb, 5-8 = index, etc.)
const FINGER_LANDMARKS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

// Animation smoothing factor (lower = smoother but slower, higher = more responsive)
const SLERP_FACTOR = 0.2;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Convert MediaPipe normalized coordinates to Three.js world space
 * MediaPipe uses: X (0-1 left-right), Y (0-1 top-bottom), Z (depth, negative towards camera)
 * Three.js uses: X (left-right), Y (up-down), Z (towards camera)
 */
const landmarkTo3D = (coord: [number, number, number], scale: number = 1): THREE.Vector3 => {
  return new THREE.Vector3(
    -(coord[0] - 0.5) * scale, // Negate X for mirror correction
    (1 - coord[1] - 0.5) * scale, // Flip Y (MediaPipe Y goes down, Three.js Y goes up)
    coord[2] * scale // Z depth
  );
};

/**
 * Calculate quaternion rotation to align a bone from its rest direction to a target direction
 * Uses setFromUnitVectors for efficient rotation calculation
 * 
 * @param startPos - Start position of the bone segment (e.g., shoulder)
 * @param endPos - End position of the bone segment (e.g., elbow)
 * @param restDirection - The bone's default direction in rest pose (T-pose)
 * @param parentWorldQuat - Optional parent bone's world quaternion for local space conversion
 */
const calculateLookAtRotation = (
  startPos: THREE.Vector3,
  endPos: THREE.Vector3,
  restDirection: THREE.Vector3,
  parentWorldQuat?: THREE.Quaternion
): THREE.Quaternion => {
  const targetDirection = new THREE.Vector3().subVectors(endPos, startPos).normalize();
  
  if (targetDirection.lengthSq() < 0.000001) {
    return new THREE.Quaternion();
  }
  
  // Calculate world rotation to align rest direction to target direction
  const worldQuat = new THREE.Quaternion();
  worldQuat.setFromUnitVectors(restDirection.clone().normalize(), targetDirection);
  
  // Convert to local space if parent quaternion provided
  if (parentWorldQuat) {
    const parentInverse = parentWorldQuat.clone().invert();
    worldQuat.premultiply(parentInverse);
  }
  
  return worldQuat;
};

/**
 * Calculate finger curl angle from 3 consecutive points
 * Returns the angle of flexion at the middle joint
 */
const calculateFingerCurl = (
  base: THREE.Vector3,
  mid: THREE.Vector3,
  tip: THREE.Vector3
): number => {
  const v1 = new THREE.Vector3().subVectors(mid, base).normalize();
  const v2 = new THREE.Vector3().subVectors(tip, mid).normalize();
  
  const dot = v1.dot(v2);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
};

/**
 * Get finger bone rotations from hand landmarks
 * Returns quaternions for the 3 joints of a finger
 */
const getFingerRotations = (
  landmarks: [number, number, number][],
  fingerIndices: number[],
  isLeft: boolean
): THREE.Quaternion[] => {
  if (!landmarks || landmarks.length < 21) {
    return [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  }
  
  const points = fingerIndices.map(i => landmarkTo3D(landmarks[i], 3));
  const wrist = landmarkTo3D(landmarks[0], 3);
  
  const rotations: THREE.Quaternion[] = [];
  
  // Calculate rotation for each joint (MCP, PIP, DIP)
  for (let i = 0; i < 3; i++) {
    const prevPoint = i === 0 ? wrist : points[i - 1];
    const currentPoint = points[i];
    const nextPoint = points[i + 1];
    
    if (prevPoint && currentPoint && nextPoint) {
      const curl = calculateFingerCurl(prevPoint, currentPoint, nextPoint);
      
      // Apply curl as rotation around local X axis (finger flexion)
      const rotX = curl * 0.8; // Scale factor for natural movement
      const quaternion = new THREE.Quaternion();
      quaternion.setFromEuler(new THREE.Euler(rotX, 0, 0));
      rotations.push(quaternion);
    } else {
      rotations.push(new THREE.Quaternion());
    }
  }
  
  return rotations;
};

// =============================================================================
// AVATAR COMPONENT (Inner Three.js component)
// =============================================================================

interface AvatarProps {
  frame: HandFrame | null;
  animationSpeed?: number;
}

interface BoneRestPose {
  [key: string]: THREE.Quaternion;
}

const Avatar = ({ frame, animationSpeed = 0.2 }: AvatarProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const bonesRef = useRef<{ [key: string]: THREE.Bone }>({});
  const restPoseRef = useRef<BoneRestPose>({});
  const prevRotationsRef = useRef<{ [key: string]: THREE.Quaternion }>({});
  const isInRestPhaseRef = useRef(false);
  
  // Load the GLB model
  const modelPath = `${import.meta.env.BASE_URL}models/Female_05.glb`;
  const { scene } = useGLTF(modelPath);
  
  // Clone scene using SkeletonUtils to preserve bone references
  const { clonedScene, modelOffset } = useMemo(() => {
    const clone = SkeletonUtils.clone(scene) as THREE.Group;
    
    // Calculate bounding box BEFORE scaling
    const boxBefore = new THREE.Box3().setFromObject(clone);
    const sizeBefore = boxBefore.getSize(new THREE.Vector3());
    
    // Scale model to ~1.8m height (model is in centimeters)
    const targetHeight = 1.8;
    const currentHeight = sizeBefore.y;
    const scaleFactor = currentHeight > 10 ? targetHeight / currentHeight : 1;
    
    clone.scale.setScalar(scaleFactor);
    clone.updateMatrixWorld(true);
    
    // Calculate bounding box AFTER scaling
    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    
    // Calculate offset to position model (feet at y=0, centered on X/Z)
    const offset = new THREE.Vector3(
      -center.x,
      -box.min.y,
      -center.z
    );
    
    // Fix materials for visibility
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
        
        const mesh = child as THREE.SkinnedMesh;
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((mat) => {
            mat.visible = true;
            mat.transparent = false;
            mat.opacity = 1;
            mat.side = THREE.DoubleSide;
            
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.roughness = 0.7;
              mat.metalness = 0.1;
              if (!mat.map) {
                mat.color = new THREE.Color('#e8beac');
              }
            }
          });
        }
      }
    });
    
    return { clonedScene: clone, modelOffset: offset };
  }, [scene]);
  
  // Find and store bone references on mount
  useEffect(() => {
    if (!clonedScene) return;
    
    const bones: { [key: string]: THREE.Bone } = {};
    const restPose: BoneRestPose = {};
    
    // Collect all bones by name
    const allBones: { [name: string]: THREE.Bone } = {};
    const allBonesLower: { [name: string]: THREE.Bone } = {};
    clonedScene.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        const bone = child as THREE.Bone;
        allBones[bone.name] = bone;
        allBonesLower[bone.name.toLowerCase()] = bone;
      }
    });
    
    // Map our bone keys to actual bones
    for (const [key, targetName] of Object.entries(BONE_NAMES)) {
      let bone = allBones[targetName];
      if (!bone) {
        bone = allBonesLower[targetName.toLowerCase()];
      }
      if (bone) {
        bones[key] = bone;
        restPose[key] = bone.quaternion.clone();
      }
    }
    
    bonesRef.current = bones;
    restPoseRef.current = restPose;
    
    console.log('AvatarModal: Mapped', Object.keys(bones).length, 'bones');
  }, [clonedScene]);
  
  // Animation loop - drive bones based on frame data
  useFrame(() => {
    const bones = bonesRef.current;
    const restPose = restPoseRef.current;
    const slerp = animationSpeed ?? SLERP_FACTOR;
    
    if (!bones || Object.keys(bones).length === 0) return;
    
    // Detect hand/arm visibility
    const leftHandVisible = frame?.leftHand ? isHandVisible(frame.leftHand) : false;
    const rightHandVisible = frame?.rightHand ? isHandVisible(frame.rightHand) : false;
    const hasLeftArm = frame?.leftArm && (frame.leftArm.shoulder[0] !== 0 || frame.leftArm.shoulder[1] !== 0);
    const hasRightArm = frame?.rightArm && (frame.rightArm.shoulder[0] !== 0 || frame.rightArm.shoulder[1] !== 0);
    
    // Determine if we're in rest phase (no data, returning to neutral)
    const hasAnyData = leftHandVisible || rightHandVisible || hasLeftArm || hasRightArm;
    isInRestPhaseRef.current = !hasAnyData;
    
    // Helper: Apply rotation with slerp smoothing
    const applyRotation = (boneKey: string, targetQuat: THREE.Quaternion) => {
      const bone = bones[boneKey];
      if (!bone) return;
      
      if (!prevRotationsRef.current[boneKey]) {
        prevRotationsRef.current[boneKey] = bone.quaternion.clone();
      }
      
      prevRotationsRef.current[boneKey].slerp(targetQuat, slerp);
      bone.quaternion.copy(prevRotationsRef.current[boneKey]);
    };
    
    // Helper: Reset bone to rest pose
    const resetToRestPose = (boneKey: string) => {
      const rest = restPose[boneKey];
      if (rest) {
        applyRotation(boneKey, rest);
      }
    };
    
    // =========================================================================
    // LEFT ARM IK (MediaPipe Pose landmarks 11, 13, 15)
    // Since leftHand bone is missing, apply wrist rotation to leftLowerArm
    // =========================================================================
    if (hasLeftArm && frame?.leftArm) {
      const shoulder = landmarkTo3D(frame.leftArm.shoulder, 1);
      const elbow = landmarkTo3D(frame.leftArm.elbow, 1);
      const wrist = landmarkTo3D(frame.leftArm.wrist, 1);
      
      // Left arm rest direction in T-pose points to the LEFT (+X)
      const upperArmRest = new THREE.Vector3(1, 0, 0);
      
      // Upper arm: rotate from shoulder to elbow
      const upperArmQuat = calculateLookAtRotation(shoulder, elbow, upperArmRest);
      applyRotation('leftUpperArm', upperArmQuat);
      
      // Lower arm: rotate from elbow to wrist
      // Since leftHand is missing, we apply wrist rotation directly to leftLowerArm
      let lowerArmQuat = calculateLookAtRotation(elbow, wrist, upperArmRest);
      
      // If we have hand data, incorporate wrist/palm orientation into the lower arm
      if (leftHandVisible && frame?.leftHand) {
        const wristLm = landmarkTo3D(frame.leftHand[0], 3);
        const indexBase = landmarkTo3D(frame.leftHand[5], 3);
        const pinkyBase = landmarkTo3D(frame.leftHand[17], 3);
        const middleBase = landmarkTo3D(frame.leftHand[9], 3);
        
        // Calculate palm orientation vectors
        const palmRight = new THREE.Vector3().subVectors(indexBase, pinkyBase).normalize();
        const palmForward = new THREE.Vector3().subVectors(middleBase, wristLm).normalize();
        const palmUp = new THREE.Vector3().crossVectors(palmForward, palmRight).normalize();
        
        // Build wrist rotation from palm orientation
        const palmMatrix = new THREE.Matrix4();
        palmMatrix.makeBasis(palmRight, palmUp, palmForward);
        const wristRotQuat = new THREE.Quaternion().setFromRotationMatrix(palmMatrix);
        
        // Combine forearm direction with wrist twist
        lowerArmQuat.multiply(wristRotQuat);
      }
      
      applyRotation('leftLowerArm', lowerArmQuat);
    } else {
      resetToRestPose('leftUpperArm');
      resetToRestPose('leftLowerArm');
    }
    
    // =========================================================================
    // RIGHT ARM IK (MediaPipe Pose landmarks 12, 14, 16)
    // =========================================================================
    if (hasRightArm && frame?.rightArm) {
      const shoulder = landmarkTo3D(frame.rightArm.shoulder, 1);
      const elbow = landmarkTo3D(frame.rightArm.elbow, 1);
      const wrist = landmarkTo3D(frame.rightArm.wrist, 1);
      
      // Right arm rest direction in T-pose points to the RIGHT (-X)
      const upperArmRest = new THREE.Vector3(-1, 0, 0);
      
      // Upper arm: rotate from shoulder to elbow
      const upperArmQuat = calculateLookAtRotation(shoulder, elbow, upperArmRest);
      applyRotation('rightUpperArm', upperArmQuat);
      
      // Lower arm: rotate from elbow to wrist
      const lowerArmQuat = calculateLookAtRotation(elbow, wrist, upperArmRest);
      applyRotation('rightLowerArm', lowerArmQuat);
    } else {
      resetToRestPose('rightUpperArm');
      resetToRestPose('rightLowerArm');
    }
    
    // =========================================================================
    // LEFT FINGERS (MediaPipe Hand landmarks 0-20)
    // Note: Wrist rotation is now handled by leftLowerArm above
    // =========================================================================
    if (leftHandVisible && frame?.leftHand) {
      // Apply finger rotations only (wrist rotation handled by leftLowerArm)
      const thumbRots = getFingerRotations(frame.leftHand, FINGER_LANDMARKS.thumb, true);
      const indexRots = getFingerRotations(frame.leftHand, FINGER_LANDMARKS.index, true);
      const middleRots = getFingerRotations(frame.leftHand, FINGER_LANDMARKS.middle, true);
      const ringRots = getFingerRotations(frame.leftHand, FINGER_LANDMARKS.ring, true);
      const pinkyRots = getFingerRotations(frame.leftHand, FINGER_LANDMARKS.pinky, true);
      
      applyRotation('leftThumb1', thumbRots[0]);
      applyRotation('leftThumb2', thumbRots[1]);
      applyRotation('leftThumb3', thumbRots[2]);
      
      applyRotation('leftIndex1', indexRots[0]);
      applyRotation('leftIndex2', indexRots[1]);
      applyRotation('leftIndex3', indexRots[2]);
      
      applyRotation('leftMiddle1', middleRots[0]);
      applyRotation('leftMiddle2', middleRots[1]);
      applyRotation('leftMiddle3', middleRots[2]);
      
      applyRotation('leftRing1', ringRots[0]);
      applyRotation('leftRing2', ringRots[1]);
      applyRotation('leftRing3', ringRots[2]);
      
      applyRotation('leftPinky1', pinkyRots[0]);
      applyRotation('leftPinky2', pinkyRots[1]);
      applyRotation('leftPinky3', pinkyRots[2]);
    } else {
      // Reset left fingers to rest pose
      ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].forEach(finger => {
        [1, 2, 3].forEach(joint => {
          resetToRestPose(`left${finger}${joint}`);
        });
      });
    }
    
    // =========================================================================
    // RIGHT HAND & FINGERS (MediaPipe Hand landmarks 0-20)
    // =========================================================================
    if (rightHandVisible && frame?.rightHand) {
      const wrist = landmarkTo3D(frame.rightHand[0], 3);
      const indexBase = landmarkTo3D(frame.rightHand[5], 3);
      const pinkyBase = landmarkTo3D(frame.rightHand[17], 3);
      const middleBase = landmarkTo3D(frame.rightHand[9], 3);
      
      // Palm vectors (mirrored for right hand)
      const palmRight = new THREE.Vector3().subVectors(pinkyBase, indexBase).normalize();
      const palmForward = new THREE.Vector3().subVectors(middleBase, wrist).normalize();
      const palmUp = new THREE.Vector3().crossVectors(palmForward, palmRight).normalize();
      
      const palmMatrix = new THREE.Matrix4();
      palmMatrix.makeBasis(palmRight, palmUp, palmForward);
      const handQuat = new THREE.Quaternion().setFromRotationMatrix(palmMatrix);
      applyRotation('rightHand', handQuat);
      
      // Apply finger rotations
      const thumbRots = getFingerRotations(frame.rightHand, FINGER_LANDMARKS.thumb, false);
      const indexRots = getFingerRotations(frame.rightHand, FINGER_LANDMARKS.index, false);
      const middleRots = getFingerRotations(frame.rightHand, FINGER_LANDMARKS.middle, false);
      const ringRots = getFingerRotations(frame.rightHand, FINGER_LANDMARKS.ring, false);
      const pinkyRots = getFingerRotations(frame.rightHand, FINGER_LANDMARKS.pinky, false);
      
      applyRotation('rightThumb1', thumbRots[0]);
      applyRotation('rightThumb2', thumbRots[1]);
      applyRotation('rightThumb3', thumbRots[2]);
      
      applyRotation('rightIndex1', indexRots[0]);
      applyRotation('rightIndex2', indexRots[1]);
      applyRotation('rightIndex3', indexRots[2]);
      
      applyRotation('rightMiddle1', middleRots[0]);
      applyRotation('rightMiddle2', middleRots[1]);
      applyRotation('rightMiddle3', middleRots[2]);
      
      applyRotation('rightRing1', ringRots[0]);
      applyRotation('rightRing2', ringRots[1]);
      applyRotation('rightRing3', ringRots[2]);
      
      applyRotation('rightPinky1', pinkyRots[0]);
      applyRotation('rightPinky2', pinkyRots[1]);
      applyRotation('rightPinky3', pinkyRots[2]);
    } else {
      resetToRestPose('rightHand');
      ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].forEach(finger => {
        [1, 2, 3].forEach(joint => {
          resetToRestPose(`right${finger}${joint}`);
        });
      });
    }
  });
  
  return (
    <group ref={groupRef} position={[modelOffset.x, modelOffset.y, modelOffset.z]}>
      <primitive object={clonedScene} />
    </group>
  );
};

// Preload the model
useGLTF.preload(`${import.meta.env.BASE_URL}models/Female_05.glb`);

// =============================================================================
// SCENE COMPONENT (Lighting, camera, grid)
// =============================================================================

interface SceneProps {
  frame: HandFrame | null;
  animationSpeed?: number;
}

const Scene = ({ frame, animationSpeed }: SceneProps) => {
  return (
    <>
      {/* Orthographic camera for stable 2D full-body view */}
      <OrthographicCamera
        makeDefault
        position={[0, 0.9, 5]}
        zoom={280}
        near={0.1}
        far={100}
      />
      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={0.5}
        maxDistance={20}
        target={[0, 0.9, 0]}
      />

      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={1} color="#ffffff" />
      <directionalLight position={[-5, 3, -5]} intensity={0.4} color="#ffffff" />
      <pointLight position={[0, 3, 2]} intensity={0.5} color="#ffffff" />

      {/* Grid at ground level */}
      <Grid
        args={[10, 10]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#1a2a3a"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#2a3a4a"
        fadeDistance={12}
        fadeStrength={1}
        followCamera={false}
        position={[0, 0, 0]}
      />

      {/* Avatar */}
      <Suspense fallback={null}>
        <Avatar frame={frame} animationSpeed={animationSpeed} />
      </Suspense>
    </>
  );
};

// =============================================================================
// MAIN MODAL COMPONENT
// =============================================================================

const AvatarModal = ({
  isOpen,
  onClose,
  frame,
  animationSpeed = 0.2,
}: AvatarModalProps) => {
  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        // Close when clicking backdrop (not the modal content)
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative w-full h-full max-w-6xl max-h-[90vh] m-4 rounded-xl overflow-hidden glass-panel">
        {/* Close Button - High visibility */}
        <Button
          onClick={onClose}
          variant="outline"
          size="icon"
          className="absolute top-4 right-4 z-20 bg-background/90 hover:bg-background border-border/50"
        >
          <X className="w-5 h-5" />
        </Button>

        {/* Frame Info */}
        {frame && (
          <div className="absolute top-4 left-4 z-10 glass-panel px-4 py-2">
            <span className="text-sm text-muted-foreground">Sign: </span>
            <span className="text-lg font-bold gradient-text">{frame.label}</span>
          </div>
        )}

        {/* 3D Canvas */}
        <Canvas
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <color attach="background" args={['#0a0f14']} />
          <Suspense fallback={null}>
            <Scene frame={frame} animationSpeed={animationSpeed} />
          </Suspense>
        </Canvas>
      </div>
    </div>
  );
};

export default AvatarModal;
