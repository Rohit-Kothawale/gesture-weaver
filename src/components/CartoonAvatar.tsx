import { useMemo } from 'react';
import * as THREE from 'three';
import { HandFrame, isHandVisible } from '@/types/hand-data';

interface CartoonAvatarProps {
  frame: HandFrame | null;
}

// Body proportions
const BODY = {
  headRadius: 0.15,
  neckLength: 0.08,
  torsoLength: 0.4,
  torsoWidth: 0.25,
  hipWidth: 0.15,
  upperArmLength: 0.22,
  forearmLength: 0.2,
  upperLegLength: 0.3,
  lowerLegLength: 0.28,
  jointRadius: 0.04,
  limbRadius: 0.03,
  handRadius: 0.04,
  footLength: 0.12,
  fingerRadius: 0.008,
  fingerJointRadius: 0.01,
};

// Colors
const COLORS = {
  skin: "#e8beac",
  body: "#4a90d9",
  pants: "#2d5a87",
  shoes: "#333333",
  joint: "#f0d0c0",
  fingerTip: "#f5c4b8",
};

// Finger segment connections (landmark indices)
const FINGER_SEGMENTS = {
  thumb: [[0, 1], [1, 2], [2, 3], [3, 4]],
  index: [[0, 5], [5, 6], [6, 7], [7, 8]],
  middle: [[0, 9], [9, 10], [10, 11], [11, 12]],
  ring: [[0, 13], [13, 14], [14, 15], [15, 16]],
  pinky: [[0, 17], [17, 18], [18, 19], [19, 20]],
};

// Cylinder component for limbs
const Limb = ({ 
  start, 
  end, 
  radius = BODY.limbRadius,
  color = COLORS.body 
}: { 
  start: THREE.Vector3; 
  end: THREE.Vector3; 
  radius?: number;
  color?: string;
}) => {
  const { position, quaternion, length } = useMemo(() => {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    if (length < 0.001) return { position: start, quaternion: new THREE.Quaternion(), length: 0 };
    
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    quaternion.setFromUnitVectors(up, direction.clone().normalize());
    
    return { position: center, quaternion, length };
  }, [start, end]);

  if (length < 0.001) return null;

  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 8]} />
      <meshStandardMaterial color={color} roughness={0.6} metalness={0.1} />
    </mesh>
  );
};

// Joint sphere component
const Joint = ({ 
  position, 
  radius = BODY.jointRadius,
  color = COLORS.joint 
}: { 
  position: THREE.Vector3; 
  radius?: number;
  color?: string;
}) => (
  <mesh position={position}>
    <sphereGeometry args={[radius, 12, 12]} />
    <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} />
  </mesh>
);

// Finger component that renders all segments of a finger
const Finger = ({
  landmarks,
  segments,
  wristPos,
  handScale,
  color,
}: {
  landmarks: THREE.Vector3[];
  segments: number[][];
  wristPos: THREE.Vector3;
  handScale: number;
  color: string;
}) => {
  return (
    <>
      {segments.slice(1).map(([start, end], idx) => {
        const startPos = landmarks[start];
        const endPos = landmarks[end];
        if (!startPos || !endPos) return null;
        
        // Taper the finger radius from base to tip
        const taperFactor = 1 - (idx * 0.15);
        const radius = BODY.fingerRadius * handScale * taperFactor;
        
        return (
          <group key={`seg-${start}-${end}`}>
            <Limb start={startPos} end={endPos} radius={radius} color={color} />
            <Joint position={startPos} radius={BODY.fingerJointRadius * handScale} color={color} />
          </group>
        );
      })}
      {/* Fingertip */}
      {landmarks[segments[segments.length - 1][1]] && (
        <Joint 
          position={landmarks[segments[segments.length - 1][1]]} 
          radius={BODY.fingerJointRadius * handScale * 0.8} 
          color={COLORS.fingerTip} 
        />
      )}
    </>
  );
};

// Palm mesh component
const PalmMesh = ({
  landmarks,
  color,
}: {
  landmarks: THREE.Vector3[];
  color: string;
}) => {
  const palmGeometry = useMemo(() => {
    if (landmarks.length < 21) return null;

    // Key palm landmarks
    const wrist = landmarks[0];
    const thumbBase = landmarks[1];
    const indexBase = landmarks[5];
    const middleBase = landmarks[9];
    const ringBase = landmarks[13];
    const pinkyBase = landmarks[17];

    // Create vertices for palm triangles
    const vertices = new Float32Array([
      // Triangle 1: wrist -> thumb -> index
      wrist.x, wrist.y, wrist.z,
      thumbBase.x, thumbBase.y, thumbBase.z,
      indexBase.x, indexBase.y, indexBase.z,
      
      // Triangle 2: wrist -> index -> middle
      wrist.x, wrist.y, wrist.z,
      indexBase.x, indexBase.y, indexBase.z,
      middleBase.x, middleBase.y, middleBase.z,
      
      // Triangle 3: wrist -> middle -> ring
      wrist.x, wrist.y, wrist.z,
      middleBase.x, middleBase.y, middleBase.z,
      ringBase.x, ringBase.y, ringBase.z,
      
      // Triangle 4: wrist -> ring -> pinky
      wrist.x, wrist.y, wrist.z,
      ringBase.x, ringBase.y, ringBase.z,
      pinkyBase.x, pinkyBase.y, pinkyBase.z,
      
      // Triangle 5: index -> middle -> ring (upper palm)
      indexBase.x, indexBase.y, indexBase.z,
      middleBase.x, middleBase.y, middleBase.z,
      ringBase.x, ringBase.y, ringBase.z,
      
      // Triangle 6: index -> ring -> pinky
      indexBase.x, indexBase.y, indexBase.z,
      ringBase.x, ringBase.y, ringBase.z,
      pinkyBase.x, pinkyBase.y, pinkyBase.z,
      
      // Triangle 7: thumb -> index (thumb web)
      thumbBase.x, thumbBase.y, thumbBase.z,
      indexBase.x, indexBase.y, indexBase.z,
      wrist.x, wrist.y, wrist.z,
    ]);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }, [landmarks]);

  if (!palmGeometry) return null;

  return (
    <mesh geometry={palmGeometry}>
      <meshStandardMaterial 
        color={color} 
        roughness={0.6} 
        metalness={0.1}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

// Hand with fingers component
const HandWithFingers = ({
  landmarks,
  wristPos,
  isVisible,
}: {
  landmarks: [number, number, number][] | null;
  wristPos: THREE.Vector3;
  isVisible: boolean;
}) => {
  const fingerData = useMemo(() => {
    if (!isVisible || !landmarks || landmarks.length < 21) {
      return null;
    }

    // Convert landmarks to 3D vectors relative to wrist position
    const handScale = 0.4; // Scale down the hand to fit the avatar
    
    // Calculate the center of the hand (wrist) for offset
    const wristLandmark = landmarks[0];
    
    // Transform landmarks to be relative to the avatar's wrist position
    const transformedLandmarks = landmarks.map((lm) => {
      // Get relative position from wrist landmark
      const relX = (lm[0] - wristLandmark[0]) * handScale;
      const relY = -(lm[1] - wristLandmark[1]) * handScale; // Flip Y
      const relZ = -(lm[2] - wristLandmark[2]) * handScale;
      
      return new THREE.Vector3(
        wristPos.x + relX,
        wristPos.y + relY,
        wristPos.z + relZ
      );
    });

    return {
      landmarks: transformedLandmarks,
      handScale,
    };
  }, [landmarks, wristPos, isVisible]);

  if (!fingerData) {
    // Show simple hand sphere when no landmark data
    return (
      <mesh position={wristPos}>
        <sphereGeometry args={[BODY.handRadius, 16, 16]} />
        <meshStandardMaterial color={COLORS.skin} roughness={0.5} metalness={0.1} />
      </mesh>
    );
  }

  const { landmarks: lms, handScale } = fingerData;

  return (
    <group>
      {/* Palm mesh */}
      <PalmMesh landmarks={lms} color={COLORS.skin} />
      
      {/* Wrist joint */}
      <Joint position={wristPos} radius={BODY.handRadius * 0.5} color={COLORS.skin} />
      
      {/* Fingers */}
      <Finger 
        landmarks={lms} 
        segments={FINGER_SEGMENTS.thumb} 
        wristPos={wristPos} 
        handScale={handScale} 
        color={COLORS.skin} 
      />
      <Finger 
        landmarks={lms} 
        segments={FINGER_SEGMENTS.index} 
        wristPos={wristPos} 
        handScale={handScale} 
        color={COLORS.skin} 
      />
      <Finger 
        landmarks={lms} 
        segments={FINGER_SEGMENTS.middle} 
        wristPos={wristPos} 
        handScale={handScale} 
        color={COLORS.skin} 
      />
      <Finger 
        landmarks={lms} 
        segments={FINGER_SEGMENTS.ring} 
        wristPos={wristPos} 
        handScale={handScale} 
        color={COLORS.skin} 
      />
      <Finger 
        landmarks={lms} 
        segments={FINGER_SEGMENTS.pinky} 
        wristPos={wristPos} 
        handScale={handScale} 
        color={COLORS.skin} 
      />
    </group>
  );
};

// Normalize landmarks for positioning
const normalizeLandmarks = (
  landmarks: [number, number, number][],
  scale: number = 1
): THREE.Vector3 => {
  if (!landmarks || landmarks.length === 0) return new THREE.Vector3();
  
  // Get wrist position (landmark 0)
  const wrist = landmarks[0];
  
  // Map from camera coordinates to 3D space
  const x = (wrist[0] - 0.5) * scale;
  const y = (0.5 - wrist[1]) * scale * 0.8;
  const z = 0.25 + Math.max(0, -wrist[2]) * 0.15;
  
  return new THREE.Vector3(x, y, z);
};

const CartoonAvatar = ({ frame }: CartoonAvatarProps) => {
  // Swap hands to match the Hands Only view mirroring (user's left = avatar's right)
  const leftHandVisible = frame?.rightHand ? isHandVisible(frame.rightHand) : false;
  const rightHandVisible = frame?.leftHand ? isHandVisible(frame.leftHand) : false;
  const leftHandData = frame?.rightHand || null;
  const rightHandData = frame?.leftHand || null;
  
  // Calculate arm positions based on hand landmarks
  const armPositions = useMemo(() => {
    const defaultLeft = {
      shoulder: new THREE.Vector3(-BODY.torsoWidth * 0.5, BODY.torsoLength * 0.4, 0),
      elbow: new THREE.Vector3(-BODY.torsoWidth * 0.5 - 0.15, BODY.torsoLength * 0.2, 0.05),
      wrist: new THREE.Vector3(-BODY.torsoWidth * 0.5 - 0.1, 0, 0.1),
    };
    
    const defaultRight = {
      shoulder: new THREE.Vector3(BODY.torsoWidth * 0.5, BODY.torsoLength * 0.4, 0),
      elbow: new THREE.Vector3(BODY.torsoWidth * 0.5 + 0.15, BODY.torsoLength * 0.2, 0.05),
      wrist: new THREE.Vector3(BODY.torsoWidth * 0.5 + 0.1, 0, 0.1),
    };
    
    let left = { ...defaultLeft };
    let right = { ...defaultRight };
    
    // Left arm uses rightHand data (swapped for mirror effect)
    if (leftHandVisible && leftHandData) {
      const handPos = normalizeLandmarks(leftHandData, 1.2);
      handPos.y += 0.1;
      
      const shoulderToHand = new THREE.Vector3().subVectors(handPos, defaultLeft.shoulder);
      const dist = shoulderToHand.length();
      const armLength = BODY.upperArmLength + BODY.forearmLength;
      
      if (dist < armLength) {
        const mid = new THREE.Vector3().addVectors(defaultLeft.shoulder, handPos).multiplyScalar(0.5);
        const elbowOffset = new THREE.Vector3(-0.1, 0, 0.15);
        left.elbow = mid.add(elbowOffset);
      } else {
        left.elbow = new THREE.Vector3().lerpVectors(defaultLeft.shoulder, handPos, 0.5);
        left.elbow.z += 0.1;
      }
      left.wrist = handPos;
    }
    
    // Right arm uses leftHand data (swapped for mirror effect)
    if (rightHandVisible && rightHandData) {
      const handPos = normalizeLandmarks(rightHandData, 1.2);
      handPos.y += 0.1;
      
      const shoulderToHand = new THREE.Vector3().subVectors(handPos, defaultRight.shoulder);
      const dist = shoulderToHand.length();
      const armLength = BODY.upperArmLength + BODY.forearmLength;
      
      if (dist < armLength) {
        const mid = new THREE.Vector3().addVectors(defaultRight.shoulder, handPos).multiplyScalar(0.5);
        const elbowOffset = new THREE.Vector3(0.1, 0, 0.15);
        right.elbow = mid.add(elbowOffset);
      } else {
        right.elbow = new THREE.Vector3().lerpVectors(defaultRight.shoulder, handPos, 0.5);
        right.elbow.z += 0.1;
      }
      right.wrist = handPos;
    }
    
    return { left, right };
  }, [leftHandData, rightHandData, leftHandVisible, rightHandVisible]);
  
  // Static body positions
  const positions = useMemo(() => {
    const headY = BODY.torsoLength + BODY.neckLength + BODY.headRadius;
    const neckTop = BODY.torsoLength + BODY.neckLength;
    const hipY = -0.05;
    
    return {
      head: new THREE.Vector3(0, headY, 0),
      neckTop: new THREE.Vector3(0, neckTop, 0),
      neckBottom: new THREE.Vector3(0, BODY.torsoLength, 0),
      torsoTop: new THREE.Vector3(0, BODY.torsoLength, 0),
      torsoBottom: new THREE.Vector3(0, hipY, 0),
      leftHip: new THREE.Vector3(-BODY.hipWidth * 0.5, hipY, 0),
      rightHip: new THREE.Vector3(BODY.hipWidth * 0.5, hipY, 0),
      leftKnee: new THREE.Vector3(-BODY.hipWidth * 0.5, hipY - BODY.upperLegLength, 0.02),
      rightKnee: new THREE.Vector3(BODY.hipWidth * 0.5, hipY - BODY.upperLegLength, 0.02),
      leftAnkle: new THREE.Vector3(-BODY.hipWidth * 0.5, hipY - BODY.upperLegLength - BODY.lowerLegLength, 0),
      rightAnkle: new THREE.Vector3(BODY.hipWidth * 0.5, hipY - BODY.upperLegLength - BODY.lowerLegLength, 0),
      leftFoot: new THREE.Vector3(-BODY.hipWidth * 0.5, hipY - BODY.upperLegLength - BODY.lowerLegLength - 0.02, BODY.footLength * 0.3),
      rightFoot: new THREE.Vector3(BODY.hipWidth * 0.5, hipY - BODY.upperLegLength - BODY.lowerLegLength - 0.02, BODY.footLength * 0.3),
    };
  }, []);

  return (
    <group position={[0, -0.2, 0]}>
      {/* Head */}
      <mesh position={positions.head}>
        <sphereGeometry args={[BODY.headRadius, 24, 24]} />
        <meshStandardMaterial color={COLORS.skin} roughness={0.5} metalness={0.1} />
      </mesh>
      
      {/* Eyes */}
      <mesh position={[positions.head.x - 0.04, positions.head.y + 0.02, positions.head.z + BODY.headRadius * 0.85]}>
        <sphereGeometry args={[0.02, 12, 12]} />
        <meshStandardMaterial color="#333" roughness={0.3} />
      </mesh>
      <mesh position={[positions.head.x + 0.04, positions.head.y + 0.02, positions.head.z + BODY.headRadius * 0.85]}>
        <sphereGeometry args={[0.02, 12, 12]} />
        <meshStandardMaterial color="#333" roughness={0.3} />
      </mesh>
      
      {/* Smile */}
      <mesh position={[0, positions.head.y - 0.03, positions.head.z + BODY.headRadius * 0.9]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.04, 0.008, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#333" roughness={0.3} />
      </mesh>
      
      {/* Neck */}
      <Limb start={positions.neckBottom} end={positions.neckTop} radius={0.035} color={COLORS.skin} />
      
      {/* Torso */}
      <Limb start={positions.torsoBottom} end={positions.torsoTop} radius={0.08} color={COLORS.body} />
      
      {/* Shoulders */}
      <Joint position={armPositions.left.shoulder} color={COLORS.body} />
      <Joint position={armPositions.right.shoulder} color={COLORS.body} />
      
      {/* Left Arm */}
      <Limb start={armPositions.left.shoulder} end={armPositions.left.elbow} color={COLORS.body} />
      <Joint position={armPositions.left.elbow} color={COLORS.joint} />
      <Limb start={armPositions.left.elbow} end={armPositions.left.wrist} color={COLORS.skin} />
      
      {/* Left Hand with Fingers (uses rightHand data - swapped) */}
      <HandWithFingers 
        landmarks={leftHandData}
        wristPos={armPositions.left.wrist}
        isVisible={leftHandVisible}
      />
      
      {/* Right Arm */}
      <Limb start={armPositions.right.shoulder} end={armPositions.right.elbow} color={COLORS.body} />
      <Joint position={armPositions.right.elbow} color={COLORS.joint} />
      <Limb start={armPositions.right.elbow} end={armPositions.right.wrist} color={COLORS.skin} />
      
      {/* Right Hand with Fingers (uses leftHand data - swapped) */}
      <HandWithFingers 
        landmarks={rightHandData}
        wristPos={armPositions.right.wrist}
        isVisible={rightHandVisible}
      />
      
      {/* Hips */}
      <Joint position={positions.leftHip} color={COLORS.pants} />
      <Joint position={positions.rightHip} color={COLORS.pants} />
      
      {/* Left Leg */}
      <Limb start={positions.leftHip} end={positions.leftKnee} color={COLORS.pants} />
      <Joint position={positions.leftKnee} color={COLORS.pants} />
      <Limb start={positions.leftKnee} end={positions.leftAnkle} color={COLORS.pants} />
      
      {/* Left Foot */}
      <mesh position={positions.leftFoot}>
        <boxGeometry args={[0.06, 0.04, BODY.footLength]} />
        <meshStandardMaterial color={COLORS.shoes} roughness={0.7} />
      </mesh>
      
      {/* Right Leg */}
      <Limb start={positions.rightHip} end={positions.rightKnee} color={COLORS.pants} />
      <Joint position={positions.rightKnee} color={COLORS.pants} />
      <Limb start={positions.rightKnee} end={positions.rightAnkle} color={COLORS.pants} />
      
      {/* Right Foot */}
      <mesh position={positions.rightFoot}>
        <boxGeometry args={[0.06, 0.04, BODY.footLength]} />
        <meshStandardMaterial color={COLORS.shoes} roughness={0.7} />
      </mesh>
    </group>
  );
};

export default CartoonAvatar;
