const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const arg = require("arg");
const mqtt = require("mqtt");
const osc = require("osc");
const WebSocket = require("ws");

const FINGERS = ["thumb", "index", "middle", "ring", "pinky"];
const HANDS = ["left", "right"];
const ORDERED_CHANNELS = HANDS.flatMap((hand) => FINGERS.map((finger) => `${hand}.${finger}`));
const FINGER_NUMBERS = {
  thumb: 1,
  index: 2,
  middle: 3,
  ring: 4,
  pinky: 5,
};
const FINGER_JOINTS = {
  thumb: ["Metacarpal", "Proximal", "Distal"],
  index: ["Metacarpal", "Proximal", "Medial", "Distal"],
  middle: ["Metacarpal", "Proximal", "Medial", "Distal"],
  ring: ["Metacarpal", "Proximal", "Medial", "Distal"],
  pinky: ["Metacarpal", "Proximal", "Medial", "Distal"],
};

const DEFAULT_CONFIG = {
  enabled: false,
  mqttUrl: "ws://192.168.1.121:9001",
  // mqttUrl: "wss://algorithmicgaze:a5U1U292uh62c8uh@algorithmicgaze.cloud.shiftr.io",
  mqttTopic: "hands",
  clientId: "hands-to-hands",
  thresholds: {
    "left.thumb": 0.0025,
    "left.index": 0.007,
    "left.middle": 0.016,
    "left.ring": 0.023,
    "left.pinky": 0.012,
    "right.thumb": 0.006,
    "right.index": 0.015,
    "right.middle": 0.014,
    "right.ring": 0.013,
    "right.pinky": 0.012,
  },
  thresholdScale: 1,
  smoothing: 0.25,
  releaseRatio: 0.65,
  minPublishIntervalMs: 20,
  oscFingerRegex: "^/(?:hands|rokoko)/(left|right)/(thumb|index|middle|ring|pinky)(?:/.*)?$",
};

const args = arg({
  "--http-port": Number,
  "--websocket-port": Number,
  "--osc-port": Number,
  "--osc-address": String,
  "--mqtt-url": String,
  "--mqtt-topic": String,
  "--replay-fbx": String,
  "--replay-fps": Number,
  "--enabled": Boolean,
  "--config": String,
});

function loadConfig() {
  const config = structuredClone(DEFAULT_CONFIG);
  if (args["--config"]) {
    Object.assign(config, JSON.parse(fs.readFileSync(args["--config"], "utf8")));
  }
  if (args["--mqtt-url"]) config.mqttUrl = args["--mqtt-url"];
  if (args["--mqtt-topic"]) config.mqttTopic = args["--mqtt-topic"];
  if (args["--enabled"]) config.enabled = true;
  return config;
}

const config = loadConfig();
const state = {
  controls: {
    enabled: config.enabled,
    thresholds: { ...config.thresholds },
    thresholdScale: config.thresholdScale,
    smoothing: config.smoothing,
    releaseRatio: config.releaseRatio,
  },
  rawVectors: Object.fromEntries(ORDERED_CHANNELS.map((channel) => [channel, null])),
  values: Object.fromEntries(ORDERED_CHANNELS.map((channel) => [channel, 0])),
  smoothed: Object.fromEntries(ORDERED_CHANNELS.map((channel) => [channel, 0])),
  active: Object.fromEntries(ORDERED_CHANNELS.map((channel) => [channel, false])),
  pose: {},
  lastOscAt: null,
  lastPublishedAt: null,
  mqttConnected: false,
  oscMessages: 0,
  publishedPattern: "0000000000",
};

const clients = new Set();
const fingerRegex = new RegExp(config.oscFingerRegex, "i");
let lastPublishMs = 0;

function patternFromActive(active) {
  return ORDERED_CHANNELS.map((channel) => (active[channel] ? "1" : "0")).join("");
}

function parseNumberArgs(args) {
  return (args || [])
    .map((arg) => (typeof arg === "object" && arg !== null && "value" in arg ? arg.value : arg))
    .filter((value) => typeof value === "number" && Number.isFinite(value));
}

function vectorFromOscArgs(args) {
  const values = parseNumberArgs(args);
  if (values.length === 0) return null;
  return values.slice(0, 4);
}

function movementAmount(previous, current) {
  if (!previous) return 0;
  const length = Math.max(previous.length, current.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    const delta = (current[i] || 0) - (previous[i] || 0);
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function quaternionAngle(a, b) {
  return 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));
}

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
}

function publishPattern(force = false) {
  const pattern = state.controls.enabled ? patternFromActive(state.active) : "0000000000";
  const now = Date.now();
  if (!force && pattern === state.publishedPattern) return;
  if (!force && now - lastPublishMs < config.minPublishIntervalMs) return;

  mqttClient.publish(config.mqttTopic, pattern);
  state.publishedPattern = pattern;
  state.lastPublishedAt = new Date(now).toISOString();
  lastPublishMs = now;
  broadcast({ type: "pattern", pattern, active: state.active, lastPublishedAt: state.lastPublishedAt });
}

function applyFingerValue(channel, rawValue) {
  const smoothing = Math.max(0, Math.min(0.95, Number(state.controls.smoothing)));
  const previous = state.smoothed[channel] || 0;
  const smoothed = previous + (rawValue - previous) * (1 - smoothing);
  const thresholdScale = Math.max(0.01, Number(state.controls.thresholdScale) || 1);
  const threshold = Number(state.controls.thresholds[channel] ?? 0) * thresholdScale;
  const releaseThreshold = threshold * Number(state.controls.releaseRatio);

  state.values[channel] = rawValue;
  state.smoothed[channel] = smoothed;
  state.active[channel] = state.active[channel] ? smoothed >= releaseThreshold : smoothed >= threshold;
}

function handleOscMessage(message) {
  const match = message.address.match(fingerRegex);
  if (!match) {
    broadcast({ type: "osc-unmapped", address: message.address });
    return;
  }

  const hand = match[1].toLowerCase();
  const finger = match[2].toLowerCase();
  const channel = `${hand}.${finger}`;
  const rawVector = vectorFromOscArgs(message.args);
  if (rawVector === null) return;
  const value = movementAmount(state.rawVectors[channel], rawVector);
  state.rawVectors[channel] = rawVector;

  state.oscMessages += 1;
  state.lastOscAt = new Date().toISOString();
  applyFingerValue(channel, value);
  publishPattern();
  broadcast({
    type: "frame",
    channel,
    rawValue: value,
    values: state.values,
    smoothed: state.smoothed,
    active: state.active,
    pattern: state.publishedPattern,
    lastOscAt: state.lastOscAt,
    oscMessages: state.oscMessages,
  });
}

function handleFingerMovement(channel, value, source = "replay") {
  state.oscMessages += 1;
  state.lastOscAt = new Date().toISOString();
  applyFingerValue(channel, value);
  publishPattern();
  broadcast({
    type: "frame",
    source,
    channel,
    rawValue: value,
    values: state.values,
    smoothed: state.smoothed,
    active: state.active,
    pattern: state.publishedPattern,
    lastOscAt: state.lastOscAt,
    oscMessages: state.oscMessages,
  });
}

function handleReplayFrame(frame) {
  state.oscMessages += 1;
  state.lastOscAt = new Date().toISOString();
  state.pose = frame.pose;
  for (const [channel, value] of Object.entries(frame.movements)) {
    applyFingerValue(channel, value);
  }
  publishPattern();
  broadcast({
    type: "frame",
    source: "fbx-replay",
    pose: frame.pose,
    values: state.values,
    smoothed: state.smoothed,
    active: state.active,
    pattern: state.publishedPattern,
    lastOscAt: state.lastOscAt,
    oscMessages: state.oscMessages,
  });
}

function handleControlMessage(message) {
  if (message.type === "set-enabled") {
    state.controls.enabled = Boolean(message.enabled);
    publishPattern(true);
  }
  if (message.type === "set-controls") {
    if (message.thresholds) {
      for (const channel of ORDERED_CHANNELS) {
        if (message.thresholds[channel] !== undefined) {
          state.controls.thresholds[channel] = Number(message.thresholds[channel]);
        }
      }
    }
    if (message.smoothing !== undefined) state.controls.smoothing = Number(message.smoothing);
    if (message.thresholdScale !== undefined) state.controls.thresholdScale = Number(message.thresholdScale);
    if (message.releaseRatio !== undefined) state.controls.releaseRatio = Number(message.releaseRatio);
    publishPattern(true);
  }
  broadcast({ type: "controls", controls: state.controls });
}

function serveStatic(req, res) {
  const requested = req.url === "/" ? "/index_absolute.html" : req.url;
  const filePath = path.join(__dirname, path.normalize(decodeURIComponent(requested)));
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".fbx": "application/octet-stream",
  };
  const stream = fs.createReadStream(filePath);
  stream
    .on("error", () => {
      res.writeHead(404);
      res.end("Not found");
    })
    .on("open", () => {
      res.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    })
    .pipe(res);
}

async function loadFbxReplay(filename) {
  const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
  const { Quaternion } = await import("three");
  const buffer = fs.readFileSync(filename);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const object = new FBXLoader().parse(arrayBuffer, "");
  const clip = object.animations[0];
  if (!clip) throw new Error(`No animation found in ${filename}`);

  const replayByFrame = new Map();
  for (const hand of ["left", "right"]) {
    const fbxHand = hand[0].toUpperCase() + hand.slice(1);
    for (const finger of FINGERS) {
      const qTracks = FINGER_JOINTS[finger]
        .map((joint) => clip.tracks.find((track) => track.name === `${fbxHand}Finger${FINGER_NUMBERS[finger]}${joint}.quaternion`))
        .filter(Boolean);
      if (qTracks.length === 0) continue;
      const frameCount = Math.min(...qTracks.map((track) => track.times.length));
      const restPose = qTracks.map((track) => {
        const values = track.values;
        return new Quaternion(values[0], values[1], values[2], values[3]).normalize();
      });
      for (let frame = 1; frame < frameCount; frame += 1) {
        const time = qTracks[0].times[frame];
        const channel = `${hand}.${finger}`;
        const key = String(frame);
        const replayFrame = replayByFrame.get(key) || { time, movements: {}, pose: {} };
        const jointAngles = [];
        const value = qTracks.reduce((sum, track, index) => {
          const values = track.values;
          const previous = new Quaternion(
            values[(frame - 1) * 4],
            values[(frame - 1) * 4 + 1],
            values[(frame - 1) * 4 + 2],
            values[(frame - 1) * 4 + 3],
          ).normalize();
          const current = new Quaternion(
            values[frame * 4],
            values[frame * 4 + 1],
            values[frame * 4 + 2],
            values[frame * 4 + 3],
          ).normalize();
          jointAngles.push(quaternionAngle(restPose[index], current));
          return sum + quaternionAngle(previous, current);
        }, 0);
        replayFrame.movements[channel] = value;
        replayFrame.pose[channel] = jointAngles;
        replayByFrame.set(key, replayFrame);
      }
    }
  }

  const replayFrames = [...replayByFrame.values()];
  replayFrames.sort((a, b) => a.time - b.time);
  return replayFrames;
}

async function startFbxReplay(filename, fps = 30) {
  const replayFrames = await loadFbxReplay(path.resolve(filename));
  const frameDelayMs = 1000 / fps;
  console.log(`Replaying ${replayFrames.length} FBX pose frames from ${filename} at ${fps} fps`);
  let index = 0;
  setInterval(() => {
    const frame = replayFrames[index];
    handleReplayFrame(frame);
    index = (index + 1) % replayFrames.length;
  }, frameDelayMs);
}

const mqttClient = mqtt.connect(config.mqttUrl, { clientId: config.clientId });
mqttClient.on("connect", () => {
  state.mqttConnected = true;
  console.log(`MQTT connected ${config.mqttUrl} -> ${config.mqttTopic}`);
  publishPattern(true);
  broadcast({ type: "status", mqttConnected: true });
});
mqttClient.on("close", () => {
  state.mqttConnected = false;
  broadcast({ type: "status", mqttConnected: false });
});
mqttClient.on("error", (error) => console.error("MQTT error:", error.message));

const httpPort = args["--http-port"] || 3000;
const server = http.createServer(serveStatic);
const wss = new WebSocket.Server({ server });
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "hello", channels: ORDERED_CHANNELS, config, state }));
  ws.on("message", (data) => handleControlMessage(JSON.parse(data)));
  ws.on("close", () => clients.delete(ws));
});
server.listen(httpPort, () => console.log(`UI http://localhost:${httpPort}`));

const oscPort = new osc.UDPPort({
  localAddress: args["--osc-address"] || "0.0.0.0",
  localPort: args["--osc-port"] || 8000,
  metadata: true,
});
oscPort.on("message", handleOscMessage);
oscPort.on("error", (error) => console.error("OSC error:", error.message));
oscPort.open();
oscPort.on("ready", () => {
  console.log(`OSC listening ${oscPort.options.localAddress}:${oscPort.options.localPort}`);
});

if (args["--replay-fbx"]) {
  startFbxReplay(args["--replay-fbx"], args["--replay-fps"] || 30).catch((error) => {
    console.error("FBX replay error:", error);
    process.exitCode = 1;
  });
}
