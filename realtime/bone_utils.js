import * as THREE from "https://esm.sh/three@0.164.1";

export const PARENT_BONE_MAP = {
  spine: "hip",
  chest: "spine",
  neck: "chest",
  head: "neck",
  leftShoulder: "chest",
  leftUpperArm: "leftShoulder",
  leftLowerArm: "leftUpperArm",
  leftHand: "leftLowerArm",
  rightShoulder: "chest",
  rightUpperArm: "rightShoulder",
  rightLowerArm: "rightUpperArm",
  rightHand: "rightLowerArm",
  leftUpLeg: "hip",
  leftLeg: "leftUpLeg",
  leftFoot: "leftLeg",
  leftToe: "leftFoot",
  leftToeEnd: "leftToe",
  rightUpLeg: "hip",
  rightLeg: "rightUpLeg",
  rightFoot: "rightLeg",
  rightToe: "rightFoot",
  rightToeEnd: "rightToe",
};

export function calculateRelativeBones(message) {
  const stack = [];
  const relativeData = {};

  // Initialize the stack with the root bone
  stack.push("hip");

  while (stack.length > 0) {
    const boneName = stack.pop();
    const parentBoneName = PARENT_BONE_MAP[boneName];

    const pos = message[boneName].position;
    const rot = message[boneName].rotation;

    if (parentBoneName) {
      const parentPos = relativeData[parentBoneName].position;
      const parentRot = relativeData[parentBoneName].rotation;

      const relativePos = {
        x: pos.x - parentPos.x,
        y: pos.y - parentPos.y,
        z: pos.z - parentPos.z,
      };

      const parentQuaternion = new THREE.Quaternion(
        parentRot.x,
        parentRot.y,
        parentRot.z,
        parentRot.w
      ).invert();

      const boneQuaternion = new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w);

      const relativeRot = parentQuaternion.multiply(boneQuaternion);

      relativeData[boneName] = {
        position: relativePos,
        rotation: {
          x: relativeRot.x,
          y: relativeRot.y,
          z: relativeRot.z,
          w: relativeRot.w,
        },
      };
    } else {
      // Root bone (hip) uses absolute values
      relativeData[boneName] = {
        position: pos,
        rotation: rot,
      };
    }

    // Add child bones to the stack
    for (const childBoneName in PARENT_BONE_MAP) {
      if (PARENT_BONE_MAP[childBoneName] === boneName) {
        stack.push(childBoneName);
      }
    }
  }

  return relativeData;
}
