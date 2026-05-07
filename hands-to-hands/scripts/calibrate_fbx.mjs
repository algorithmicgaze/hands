import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Quaternion } from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDir = path.resolve(__dirname, "../../realtime/demo_data");
const dataDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultDataDir;

const FINGERS = {
  thumb: 1,
  index: 2,
  middle: 3,
  ring: 4,
  pinky: 5,
};
const JOINTS = {
  thumb: ["Metacarpal", "Proximal", "Distal"],
  index: ["Metacarpal", "Proximal", "Medial", "Distal"],
  middle: ["Metacarpal", "Proximal", "Medial", "Distal"],
  ring: ["Metacarpal", "Proximal", "Medial", "Distal"],
  pinky: ["Metacarpal", "Proximal", "Medial", "Distal"],
};

function qAt(track, index) {
  const values = track.values;
  return new Quaternion(
    values[index * 4],
    values[index * 4 + 1],
    values[index * 4 + 2],
    values[index * 4 + 3],
  ).normalize();
}

function quaternionAngle(a, b) {
  return 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));
}

function percentile(values, fraction) {
  return values[Math.min(values.length - 1, Math.floor(values.length * fraction))] || 0;
}

function round(value) {
  return Number(value.toFixed(5));
}

function movementStatsForClip(filename) {
  const buffer = fs.readFileSync(filename);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const object = new FBXLoader().parse(arrayBuffer, "");
  const tracks = object.animations[0].tracks;
  const stats = {};

  for (const hand of ["Left", "Right"]) {
    for (const [finger, number] of Object.entries(FINGERS)) {
      const qTracks = JOINTS[finger]
        .map((joint) => tracks.find((track) => track.name === `${hand}Finger${number}${joint}.quaternion`))
        .filter(Boolean);
      const frameCount = Math.min(...qTracks.map((track) => track.times.length));
      const values = [];
      for (let frame = 1; frame < frameCount; frame += 1) {
        values.push(qTracks.reduce((sum, track) => sum + quaternionAngle(qAt(track, frame - 1), qAt(track, frame)), 0));
      }
      values.sort((a, b) => a - b);
      stats[`${hand.toLowerCase()}.${finger}`] = {
        max: round(values.at(-1) || 0),
        p99: round(percentile(values, 0.99)),
        p95: round(percentile(values, 0.95)),
        p90: round(percentile(values, 0.90)),
        median: round(percentile(values, 0.50)),
      };
    }
  }
  return stats;
}

function recommendThresholds(report) {
  const thresholds = {};
  for (const channel of Object.keys(report["hands-3-playing-minimal.fbx"])) {
    const noMovement = report["hands-5-nomovement.fbx"][channel];
    const playingMinimal = report["hands-3-playing-minimal.fbx"][channel];
    const noiseFloor = noMovement.p99 * 1.75;
    const catchMinimalPlaying = playingMinimal.p90 * 0.8;
    thresholds[channel] = round(Math.max(noiseFloor, catchMinimalPlaying));
  }
  return thresholds;
}

const files = fs.readdirSync(dataDir).filter((file) => file.endsWith(".fbx")).sort();
const report = Object.fromEntries(files.map((file) => [file, movementStatsForClip(path.join(dataDir, file))]));
const thresholds = recommendThresholds(report);

console.log(JSON.stringify({ dataDir, metric: "summed per-frame finger-joint quaternion angle delta", thresholds, report }, null, 2));
