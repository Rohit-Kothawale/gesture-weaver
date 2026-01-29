import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { HandFrame, isHandVisible } from '@/types/hand-data';

interface SkinnedMeshAvatarProps {
  frame: HandFrame | null;
}

// Bone name mappings for the Female_05.glb model (based on actual bone names found)
const BONE_NAMES: Record<string, string> = {
  // Spine
  hips: 'hips',
  spine: 'spin',
  neck: 'neck',
  head: 'head',

  // Left arm
  leftShoulder: 'leftshoulder',
  leftUpperArm: 'leftupperarm',
  leftLowerArm: 'leftlowerarm',
  leftHand: 'lefthand',

  // Right arm
  rightShoulder: 'rightshoulder',
  rightUpperArm: 'rightupperarm',
  rightLowerArm: 'rightlowerarm',
  rightHand: 'rightarm',

  // Left fingers (using lowercase names from GLB)
  leftThumb1: 'leftthumb',
  leftThumb2: 'leftthumb2',
  leftThumb3: 'leftthumb1',
  leftIndex1: 'leftindexfinger',
  leftIndex2: 'leftindexfinger3',
  leftIndex3: 'leftindexfinger2',
  leftMiddle1: 'leftmiddlefinger',
  leftMiddle2: 'leftmiddlefinger3',
  leftMiddle3: 'leftmiddlefinger2',
  leftRing1: 'leftringfinger',
  leftRing2: 'leftringfinger3',
  leftRing3: 'leftringfinger2',
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

// Finger landmark indices in MediaPipe format
const FINGER_LANDMARKS = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

// Smoothing factor for rotations (0 = no smoothing, 1 = no movement)
const SLERP_FACTOR = 0.15;

// Helper to convert MediaPipe coordinates to Three.js world space
const landmarkTo3D = (coord: [number, number, number], scale: number = 1): THREE.Vector3 => {
  return new THREE.Vector3(
    -(coord[0] - 0.5) * scale, // Negate X for mirror correction
    (1 - coord[1] - 0.5) * scale, // Flip Y
    coord[2] * scale // Positive Z towards camera
  );
};

// Calculate rotation to point bone from start to end direction
const calculateLookAtRotation = (
  startPos: THREE.Vector3,
  endPos: THREE.Vector3,
  restDirection: THREE.Vector3,
  upHint: THREE.Vector3 = new THREE.Vector3(0, 1, 0)
): THREE.Quaternion => {
  const targetDirection = new THREE.Vector3().subVectors(endPos, startPos).normalize();
  
  if (targetDirection.length() < 0.001) {
    return new THREE.Quaternion();
  }
  
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(restDirection, targetDirection);
  
  return quaternion;
};

// Calculate finger curl angle from 3 points
const calculateFingerCurl = (
  base: THREE.Vector3,
  mid: THREE.Vector3,
  tip: THREE.Vector3
): number => {
  const v1 = new THREE.Vector3().subVectors(mid, base).normalize();
  const v2 = new THREE.Vector3().subVectors(tip, mid).normalize();
  
  const dot = v1.dot(v2);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  
  return angle;
};

// Get finger bone rotations from landmarks
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

// Store rest pose quaternions
interface BoneRestPose {
  [key: string]: THREE.Quaternion;
}

const SkinnedMeshAvatar = ({ frame }: SkinnedMeshAvatarProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const bonesRef = useRef<{ [key: string]: THREE.Bone }>({});
  const restPoseRef = useRef<BoneRestPose>({});
  const prevRotationsRef = useRef<{ [key: string]: THREE.Quaternion }>({});
  
  // Load the GLB model
  const modelPath = `${import.meta.env.BASE_URL}models/Female_05.glb`;
  const { scene } = useGLTF(modelPath);
  
  // Clone scene and extract bones
  const { clonedScene, modelOffset } = useMemo(() => {
    const clone = scene.clone();
    
    // Calculate bounding box to determine scale and centering
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    console.log('Model size:', size);
    console.log('Model bounding box:', box);
    console.log('Model center:', center);
    
    // The model is in centimeters (height ~115), scale to meters (~1.8)
    const targetHeight = 1.8;
    const currentHeight = size.y;
    const scaleFactor = currentHeight > 10 ? targetHeight / currentHeight : 1;
    console.log('Scale factor:', scaleFactor, 'Current height:', currentHeight);
    
    clone.scale.setScalar(scaleFactor);
    
    // Calculate offset to center model at origin (feet at y=0)
    // The min.y is the feet position, we want that at 0
    const scaledMinY = box.min.y * scaleFactor;
    const offset = new THREE.Vector3(
      -center.x * scaleFactor,
      -scaledMinY,  // Move feet to y=0
      -center.z * scaleFactor
    );
    console.log('Model offset:', offset);
    
    // Enable shadows and fix materials - add fallback color if no texture
    let meshCount = 0;
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        meshCount++;
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false; // Ensure mesh is always rendered
        
        const mesh = child as THREE.SkinnedMesh;
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((mat) => {
            // Ensure material is visible
            mat.visible = true;
            mat.transparent = false;
            mat.opacity = 1;
            mat.side = THREE.DoubleSide;
            
            if (mat instanceof THREE.MeshStandardMaterial) {
              mat.roughness = 0.7;
              mat.metalness = 0.1;
              // If no map (texture), set a default skin color
              if (!mat.map) {
                mat.color = new THREE.Color('#e8beac');
              }
            }
          });
        }
      }
    });
    console.log('Mesh count:', meshCount);
    
    return { clonedScene: clone, modelOffset: offset };
  }, [scene]);
  
  // Find and store bone references on mount
  useEffect(() => {
    if (!clonedScene) return;
    
    const bones: { [key: string]: THREE.Bone } = {};
    const restPose: BoneRestPose = {};
    
    // First, collect all bones by their exact name
    const allBones: { [name: string]: THREE.Bone } = {};
    clonedScene.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        const bone = child as THREE.Bone;
        allBones[bone.name.toLowerCase()] = bone;
      }
    });
    
    // Now map our bone keys to actual bones
    for (const [key, targetName] of Object.entries(BONE_NAMES)) {
      const bone = allBones[targetName.toLowerCase()];
      if (bone) {
        bones[key] = bone;
        restPose[key] = bone.quaternion.clone();
      }
    }
    
    bonesRef.current = bones;
    restPoseRef.current = restPose;
    
    console.log('Mapped bones:', Object.keys(bones));
    console.log('Available bones in model:', Object.keys(allBones));
  }, [clonedScene]);
  
  // Animate bones based on frame data
  useFrame(() => {
    const bones = bonesRef.current;
    const restPose = restPoseRef.current;
    
    if (!bones || Object.keys(bones).length === 0) return;
    
    // Check hand visibility
    const leftHandVisible = frame?.leftHand ? isHandVisible(frame.leftHand) : false;
    const rightHandVisible = frame?.rightHand ? isHandVisible(frame.rightHand) : false;
    const hasLeftArm = frame?.leftArm && (frame.leftArm.shoulder[0] !== 0 || frame.leftArm.shoulder[1] !== 0);
    const hasRightArm = frame?.rightArm && (frame.rightArm.shoulder[0] !== 0 || frame.rightArm.shoulder[1] !== 0);
    
    // Helper to apply rotation with smoothing
    const applyRotation = (boneKey: string, targetQuat: THREE.Quaternion) => {
      const bone = bones[boneKey];
      if (!bone) return;
      
      // Initialize previous rotation if needed
      if (!prevRotationsRef.current[boneKey]) {
        prevRotationsRef.current[boneKey] = bone.quaternion.clone();
      }
      
      // Slerp towards target
      prevRotationsRef.current[boneKey].slerp(targetQuat, SLERP_FACTOR);
      bone.quaternion.copy(prevRotationsRef.current[boneKey]);
    };
    
    // Reset to rest pose helper
    const resetToRestPose = (boneKey: string) => {
      const rest = restPose[boneKey];
      if (rest) {
        applyRotation(boneKey, rest);
      }
    };
    
    // --- LEFT ARM IK ---
    if (hasLeftArm && frame?.leftArm) {
      const shoulder = landmarkTo3D(frame.leftArm.shoulder, 1);
      const elbow = landmarkTo3D(frame.leftArm.elbow, 1);
      const wrist = landmarkTo3D(frame.leftArm.wrist, 1);
      
      // Upper arm: point from shoulder to elbow
      const upperArmRest = new THREE.Vector3(1, 0, 0); // T-pose points left
      const upperArmQuat = calculateLookAtRotation(shoulder, elbow, upperArmRest);
      applyRotation('leftUpperArm', upperArmQuat);
      
      // Lower arm: point from elbow to wrist
      const lowerArmQuat = calculateLookAtRotation(elbow, wrist, upperArmRest);
      applyRotation('leftLowerArm', lowerArmQuat);
    } else {
      resetToRestPose('leftUpperArm');
      resetToRestPose('leftLowerArm');
    }
    
    // --- RIGHT ARM IK ---
    if (hasRightArm && frame?.rightArm) {
      const shoulder = landmarkTo3D(frame.rightArm.shoulder, 1);
      const elbow = landmarkTo3D(frame.rightArm.elbow, 1);
      const wrist = landmarkTo3D(frame.rightArm.wrist, 1);
      
      // Upper arm: point from shoulder to elbow
      const upperArmRest = new THREE.Vector3(-1, 0, 0); // T-pose points right
      const upperArmQuat = calculateLookAtRotation(shoulder, elbow, upperArmRest);
      applyRotation('rightUpperArm', upperArmQuat);
      
      // Lower arm: point from elbow to wrist
      const lowerArmQuat = calculateLookAtRotation(elbow, wrist, upperArmRest);
      applyRotation('rightLowerArm', lowerArmQuat);
    } else {
      resetToRestPose('rightUpperArm');
      resetToRestPose('rightLowerArm');
    }
    
    // --- LEFT HAND & FINGERS ---
    if (leftHandVisible && frame?.leftHand) {
      // Hand orientation from wrist and palm landmarks
      const wrist = landmarkTo3D(frame.leftHand[0], 3);
      const indexBase = landmarkTo3D(frame.leftHand[5], 3);
      const pinkyBase = landmarkTo3D(frame.leftHand[17], 3);
      const middleBase = landmarkTo3D(frame.leftHand[9], 3);
      
      // Calculate palm normal
      const palmRight = new THREE.Vector3().subVectors(indexBase, pinkyBase).normalize();
      const palmForward = new THREE.Vector3().subVectors(middleBase, wrist).normalize();
      const palmUp = new THREE.Vector3().crossVectors(palmForward, palmRight).normalize();
      
      // Create rotation matrix from palm orientation
      const palmMatrix = new THREE.Matrix4();
      palmMatrix.makeBasis(palmRight, palmUp, palmForward);
      const handQuat = new THREE.Quaternion().setFromRotationMatrix(palmMatrix);
      applyRotation('leftHand', handQuat);
      
      // Finger rotations
      const thumbRots = getFingerRotations(frame.leftHand, FINGER_LANDMARKS.thumb, true);
      const indexRots = getFingerRotations(frame.leftHand, FINGER_LANDMARKS.index, true);
      const middleRots = getFingerRotations(frame.leftHand, FINGER_LANDMARKS.middle, true);
      const ringRots = getFingerRotations(frame.leftHand, FINGER_LANDMARKS.ring, true);
      const pinkyRots = getFingerRotations(frame.leftHand, FINGER_LANDMARKS.pinky, true);
      
      // Apply finger rotations
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
      // Reset fingers to rest pose
      resetToRestPose('leftHand');
      ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].forEach(finger => {
        [1, 2, 3].forEach(joint => {
          resetToRestPose(`left${finger}${joint}`);
        });
      });
    }
    
    // --- RIGHT HAND & FINGERS ---
    if (rightHandVisible && frame?.rightHand) {
      // Hand orientation from wrist and palm landmarks
      const wrist = landmarkTo3D(frame.rightHand[0], 3);
      const indexBase = landmarkTo3D(frame.rightHand[5], 3);
      const pinkyBase = landmarkTo3D(frame.rightHand[17], 3);
      const middleBase = landmarkTo3D(frame.rightHand[9], 3);
      
      // Calculate palm normal (mirrored for right hand)
      const palmRight = new THREE.Vector3().subVectors(pinkyBase, indexBase).normalize();
      const palmForward = new THREE.Vector3().subVectors(middleBase, wrist).normalize();
      const palmUp = new THREE.Vector3().crossVectors(palmForward, palmRight).normalize();
      
      // Create rotation matrix from palm orientation
      const palmMatrix = new THREE.Matrix4();
      palmMatrix.makeBasis(palmRight, palmUp, palmForward);
      const handQuat = new THREE.Quaternion().setFromRotationMatrix(palmMatrix);
      applyRotation('rightHand', handQuat);
      
      // Finger rotations
      const thumbRots = getFingerRotations(frame.rightHand, FINGER_LANDMARKS.thumb, false);
      const indexRots = getFingerRotations(frame.rightHand, FINGER_LANDMARKS.index, false);
      const middleRots = getFingerRotations(frame.rightHand, FINGER_LANDMARKS.middle, false);
      const ringRots = getFingerRotations(frame.rightHand, FINGER_LANDMARKS.ring, false);
      const pinkyRots = getFingerRotations(frame.rightHand, FINGER_LANDMARKS.pinky, false);
      
      // Apply finger rotations
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
      // Reset fingers to rest pose
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

export default SkinnedMeshAvatar;
