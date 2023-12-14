// This code detectzs the finger movement events and marks them.

import { videoTimeToMocapFrame } from "./math";

const MOCAP_FPS = 30;
const RATE_OF_CHANGE_THRESHOLD = 150;
const BONE_NAMES = [
  "LeftFinger1Proximal",
  "LeftFinger2Proximal",
  "LeftFinger3Proximal",
  "LeftFinger4Proximal",
  "LeftFinger5Proximal",
  "RightFinger1Proximal",
  "RightFinger2Proximal",
  "RightFinger3Proximal",
  "RightFinger4Proximal",
  "RightFinger5Proximal",
];

function frameIsInAudioSegment(frameIndex, audioSegments, mocapFrameOffset) {
  for (const [audioStartTime, audioEndTime] of audioSegments) {
    // Normalize everything to mocap frames.
    const audioStartFrame = videoTimeToMocapFrame(
      audioStartTime,
      mocapFrameOffset
    );
    const audioEndFrame = videoTimeToMocapFrame(audioEndTime, mocapFrameOffset);
    if (frameIndex >= audioStartFrame && frameIndex <= audioEndFrame) {
      return true;
    }
  }
  return false;
}

export function detectEvents(scene) {
  let boneRosMap = {};
  let boneEventMap = {};

  for (const boneName of BONE_NAMES) {
    const boneData = scene.data.find((d) => d.name === boneName);
    const boneRos = calculateRateOfChange(boneData);
    let events = [];
    let segmentStart = null;
    for (let frame = scene.frameStart; frame <= scene.frameEnd; frame++) {
      const ros = boneRos[frame];
      if (
        (ros > RATE_OF_CHANGE_THRESHOLD || ros < -RATE_OF_CHANGE_THRESHOLD) &&
        frameIsInAudioSegment(
          frame,
          scene.audioSegments,
          scene.mocapFrameOffset
        )
      ) {
        if (segmentStart === null) {
          // This means we've found the start of a new segment
          segmentStart = frame;
        }
        // If it's already in a segment, do nothing, just continue
      } else {
        if (segmentStart !== null) {
          // We've found the end of a segment
          events.push([segmentStart, frame - 1]);
          segmentStart = null; // Reset for the next segment
        }
      }
    }
    boneRosMap[boneName] = boneRos;
    boneEventMap[boneName] = events;
  }
  return [boneRosMap, boneEventMap];
}

function calculateRateOfChange(boneData) {
  let movingAverageQueue = [];
  let boneRos = [];
  let n = 15; // half a second (30fps / 2)

  for (let i = 0; i < boneData.frames.length; i++) {
    let frameData = boneData.frames[i];
    let prevFrameData = boneData.frames[i - 1];
    if (!prevFrameData) {
      boneRos.push(0);
      continue;
    }
    let mag =
      frameData.rotation[0] * frameData.rotation[0] +
      frameData.rotation[1] * frameData.rotation[1] +
      frameData.rotation[2] * frameData.rotation[2];

    // Update the moving average queue
    movingAverageQueue.push(mag);
    if (movingAverageQueue.length > n) {
      movingAverageQueue.shift();
    }

    // Calculate moving average
    let movingAverage =
      movingAverageQueue.reduce((a, b) => a + b, 0) / movingAverageQueue.length;

    // Compare current magnitude with moving average
    let delta = mag - movingAverage;
    boneRos.push(delta);
  }

  return boneRos;
}
