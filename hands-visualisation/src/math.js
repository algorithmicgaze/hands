export function mapValue(v, inMin, inMax, outMin, outMax) {
  return ((v - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

export function frameToVideoTime({
  frameIndex,
  mocapFrameOffset,
  mocapFps,
  videoFps,
}) {
  return frameIndex / mocapFps + mocapFrameOffset / videoFps;
}
