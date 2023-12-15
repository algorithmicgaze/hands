export function mapValue(v, inMin, inMax, outMin, outMax) {
  return ((v - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

export function mocapFrameToVideoTime(
  frameIndex,
  mocapFrameOffset,
  mocapFps = 30
) {
  return (frameIndex + mocapFrameOffset) / mocapFps;
}

export function videoTimeToMocapFrame(
  videoTime,
  mocapFrameOffset,
  mocapFps = 30
) {
  return videoTime * mocapFps - mocapFrameOffset;
}
