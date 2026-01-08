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
  handRadius: 0.06,
  footLength: 0.12,
};

// Colors
const COLORS = {
  skin: "#e8beac",
  body: "#4a90d9",
  pants: "#2d5a87",
  shoes: "#333333",
  joint: "#f0d0c0",
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
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    quaternion.setFromUnitVectors(up, direction.clone().normalize());
    
    return { position: center, quaternion, length };
  }, [start, end]);

  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length, 12]} />
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
    <sphereGeometry args={[radius, 16, 16]} />
    <meshStandardMaterial color={color} roughness={0.5} metalness={0.1} />
  </mesh>
);

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

// Calculate hand orientation from landmarks
const getHandOrientation = (landmarks: [number, number, number][]): THREE.Quaternion => {
  if (!landmarks || landmarks.length < 21) return new THREE.Quaternion();
  
  const wrist = new THREE.Vector3(...landmarks[0]);
  const middleMCP = new THREE.Vector3(...landmarks[9]);
  const indexMCP = new THREE.Vector3(...landmarks[5]);
  const pinkyMCP = new THREE.Vector3(...landmarks[17]);
  
  const forward = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
  const side = new THREE.Vector3().subVectors(indexMCP, pinkyMCP).normalize();
  const up = new THREE.Vector3().crossVectors(forward, side).normalize();
  
  const matrix = new THREE.Matrix4();
  matrix.makeBasis(side, forward, up);
  
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
};

const CartoonAvatar = ({ frame }: CartoonAvatarProps) => {
  const leftHandVisible = frame?.leftHand ? isHandVisible(frame.leftHand) : false;
  const rightHandVisible = frame?.rightHand ? isHandVisible(frame.rightHand) : false;
  
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
    
    if (leftHandVisible && frame?.leftHand) {
      const handPos = normalizeLandmarks(frame.leftHand, 1.2);
      // Offset hand position relative to body
      handPos.y += 0.1; // Adjust for body center
      
      // Calculate elbow position using simple IK
      const shoulderToHand = new THREE.Vector3().subVectors(handPos, defaultLeft.shoulder);
      const dist = shoulderToHand.length();
      const armLength = BODY.upperArmLength + BODY.forearmLength;
      
      if (dist < armLength) {
        const mid = new THREE.Vector3().addVectors(defaultLeft.shoulder, handPos).multiplyScalar(0.5);
        // Push elbow outward
        const elbowOffset = new THREE.Vector3(-0.1, 0, 0.15);
        left.elbow = mid.add(elbowOffset);
      } else {
        // Arm stretched - elbow between shoulder and hand
        left.elbow = new THREE.Vector3().lerpVectors(defaultLeft.shoulder, handPos, 0.5);
        left.elbow.z += 0.1;
      }
      left.wrist = handPos;
    }
    
    if (rightHandVisible && frame?.rightHand) {
      const handPos = normalizeLandmarks(frame.rightHand, 1.2);
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
  }, [frame, leftHandVisible, rightHandVisible]);
  
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
      
      // Hips
      leftHip: new THREE.Vector3(-BODY.hipWidth * 0.5, hipY, 0),
      rightHip: new THREE.Vector3(BODY.hipWidth * 0.5, hipY, 0),
      
      // Knees
      leftKnee: new THREE.Vector3(-BODY.hipWidth * 0.5, hipY - BODY.upperLegLength, 0.02),
      rightKnee: new THREE.Vector3(BODY.hipWidth * 0.5, hipY - BODY.upperLegLength, 0.02),
      
      // Ankles
      leftAnkle: new THREE.Vector3(-BODY.hipWidth * 0.5, hipY - BODY.upperLegLength - BODY.lowerLegLength, 0),
      rightAnkle: new THREE.Vector3(BODY.hipWidth * 0.5, hipY - BODY.upperLegLength - BODY.lowerLegLength, 0),
      
      // Feet
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
      
      {/* Shoulders joint */}
      <Joint position={armPositions.left.shoulder} color={COLORS.body} />
      <Joint position={armPositions.right.shoulder} color={COLORS.body} />
      
      {/* Left Arm */}
      <Limb start={armPositions.left.shoulder} end={armPositions.left.elbow} color={COLORS.body} />
      <Joint position={armPositions.left.elbow} color={COLORS.joint} />
      <Limb start={armPositions.left.elbow} end={armPositions.left.wrist} color={COLORS.skin} />
      
      {/* Left Hand */}
      <mesh position={armPositions.left.wrist}>
        <sphereGeometry args={[BODY.handRadius, 16, 16]} />
        <meshStandardMaterial color={COLORS.skin} roughness={0.5} metalness={0.1} />
      </mesh>
      
      {/* Right Arm */}
      <Limb start={armPositions.right.shoulder} end={armPositions.right.elbow} color={COLORS.body} />
      <Joint position={armPositions.right.elbow} color={COLORS.joint} />
      <Limb start={armPositions.right.elbow} end={armPositions.right.wrist} color={COLORS.skin} />
      
      {/* Right Hand */}
      <mesh position={armPositions.right.wrist}>
        <sphereGeometry args={[BODY.handRadius, 16, 16]} />
        <meshStandardMaterial color={COLORS.skin} roughness={0.5} metalness={0.1} />
      </mesh>
      
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
