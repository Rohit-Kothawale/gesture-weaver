// Sign animation JSON format types

export interface BoneRotation {
  x: number;
  y: number;
  z: number;
}

export interface SignKeypoints {
  // Right arm
  rightshoulder?: BoneRotation;
  rightupperarm?: BoneRotation;
  rightlowerarm?: BoneRotation;
  rightarm?: BoneRotation; // This is the hand bone
  rightthumb?: BoneRotation;
  rightindexfinger3?: BoneRotation;
  rightmiddlefinger3?: BoneRotation;
  rightringfinger3?: BoneRotation;
  rightlittlefinger3?: BoneRotation;
  
  // Left arm
  leftshoulder?: BoneRotation;
  leftupperarm?: BoneRotation;
  leftlowerarm?: BoneRotation;
  lefthand?: BoneRotation;
  leftthumb?: BoneRotation;
  leftindexfinger3?: BoneRotation;
  leftmiddlefinger3?: BoneRotation;
  leftringfinger3?: BoneRotation;
  leftlittlefinger3?: BoneRotation;
}

export interface SignFrame {
  keypoints: SignKeypoints;
}

export interface SignAnimationData {
  word: string;
  landmark: SignFrame[];
}

// Mapping from JSON keypoint names to Mixamo bone names
export const KEYPOINT_TO_BONE: Record<string, string> = {
  // Right side
  rightshoulder: 'RightShoulder',
  rightupperarm: 'RightArm',
  rightlowerarm: 'RightForeArm',
  rightarm: 'RightHand',
  rightthumb: 'RightHandThumb1',
  rightindexfinger3: 'RightHandIndex1',
  rightmiddlefinger3: 'RightHandMiddle1',
  rightringfinger3: 'RightHandRing1',
  rightlittlefinger3: 'RightHandPinky1',
  
  // Left side
  leftshoulder: 'LeftShoulder',
  leftupperarm: 'LeftArm',
  leftlowerarm: 'LeftForeArm',
  lefthand: 'LeftHand',
  leftthumb: 'LeftHandThumb1',
  leftindexfinger3: 'LeftHandIndex1',
  leftmiddlefinger3: 'LeftHandMiddle1',
  leftringfinger3: 'LeftHandRing1',
  leftlittlefinger3: 'LeftHandPinky1',
};
