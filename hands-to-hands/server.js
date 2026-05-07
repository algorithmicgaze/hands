const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const dgram = require("node:dgram");
const arg = require("arg");
const lz4js = require("lz4js");
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
    "left.thumb": 0.01314,
    "left.index": 0.03848,
    "left.middle": 0.08381,
    "left.ring": 0.09359,
    "left.pinky": 0.05753,
    "right.thumb": 0.06367,
    "right.index": 0.07214,
    "right.middle": 0.09818,
    "right.ring": 0.10555,
    "right.pinky": 0.08695,
  },
  thresholdScale: 1,
  inputScales: {
    osc: 1,
    fbxReplay: 1,
    rokoko: 1,
  },
  smoothing: 0.25,
  releaseRatio: 0.65,
  releaseMs: 120,
  minPublishIntervalMs: 20,
  oscFingerRegex: "^/(?:hands|rokoko)/(left|right)/(thumb|index|middle|ring|pinky)(?:/.*)?$",
};

const args = arg({
  "--http-port": Number,
  "--websocket-port": Number,
  "--osc-port": Number,
  "--osc-address": String,
  "--rokoko-port": Number,
  "--rokoko-address": String,
  "--no-rokoko": Boolean,
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
    inputScales: { ...config.inputScales },
    smoothing: config.smoothing,
    releaseRatio: config.releaseRatio,
    releaseMs: config.releaseMs,
  },
  rawVectors: Object.fromEntries(ORDERED_CHANNELS.map((channel) => [channel, null])),
  values: Object.fromEntries(ORDERED_CHANNELS.map((channel) => [channel, 0])),
  smoothed: Object.fromEntries(ORDERED_CHANNELS.map((channel) => [channel, 0])),
  active: Object.fromEntries(ORDERED_CHANNELS.map((channel) => [channel, false])),
  activeUntil: Object.fromEntries(ORDERED_CHANNELS.map((channel) => [channel, 0])),
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
const releaseTimers = Object.fromEntries(ORDERED_CHANNELS.map((channel) => [channel, null]));

// Rokoko JSON v3 (LZ4) state. We re-derive the same per-finger summed
// quaternion-angle delta the FBX calibration uses, so the existing thresholds
// in DEFAULT_CONFIG.thresholds carry over with no retuning.
// Joints used: Proximal, Medial, Distal — Rokoko provides Medial for the thumb
// too, so we keep the joint list uniform across fingers. The Tip joint is
// skipped because its rotation is downstream of the curl that drives the
// haptic pattern.
const ROKOKO_FINGER_NAMES = { thumb: "Thumb", index: "Index", middle: "Middle", ring: "Ring", pinky: "Little" };
const ROKOKO_JOINTS = ["Proximal", "Medial", "Distal"];
const rokokoLastQuats = Object.fromEntries(ORDERED_CHANNELS.map((channel) => [channel, null]));
let rokokoPacketsReceived = 0;

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

function looksLikeQuaternion(values) {
  if (!values || values.length !== 4) return false;
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return magnitude > 0.8 && magnitude < 1.2;
}

function quaternionFromArray(values) {
  return {
    x: values[0] || 0,
    y: values[1] || 0,
    z: values[2] || 0,
    w: values[3] ?? 1,
  };
}

function movementAmount(previous, current) {
  if (!previous) return 0;
  if (looksLikeQuaternion(previous) && looksLikeQuaternion(current)) {
    return quaternionAngle(quaternionFromArray(previous), quaternionFromArray(current));
  }
  const length = Math.max(previous.length, current.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    const delta = (current[i] || 0) - (previous[i] || 0);
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function quaternionAngle(a, b) {
  const dot = Math.abs((a.x || 0) * (b.x || 0) + (a.y || 0) * (b.y || 0) + (a.z || 0) * (b.z || 0) + (a.w || 0) * (b.w || 0));
  return 2 * Math.acos(Math.min(1, dot));
}

function normalizeMovement(value, source) {
  const key = source === "fbx-replay" ? "fbxReplay" : source;
  const scale = Number(state.controls.inputScales[key] ?? 1);
  return value * scale;
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

function scheduleReleaseCheck(channel, delayMs) {
  clearTimeout(releaseTimers[channel]);
  releaseTimers[channel] = setTimeout(() => {
    if (Date.now() < state.activeUntil[channel]) {
      scheduleReleaseCheck(channel, state.activeUntil[channel] - Date.now());
      return;
    }
    const thresholdScale = Math.max(0.01, Number(state.controls.thresholdScale) || 1);
    const threshold = Number(state.controls.thresholds[channel] ?? 0) * thresholdScale;
    const releaseThreshold = threshold * Number(state.controls.releaseRatio);
    if (state.active[channel] && state.smoothed[channel] < releaseThreshold) {
      state.active[channel] = false;
      publishPattern();
      broadcast({ type: "pattern", pattern: state.publishedPattern, active: state.active, lastPublishedAt: state.lastPublishedAt });
    }
  }, Math.max(1, delayMs));
}

function applyFingerValue(channel, rawValue) {
  const smoothing = Math.max(0, Math.min(0.95, Number(state.controls.smoothing)));
  const previous = state.smoothed[channel] || 0;
  const smoothed = previous + (rawValue - previous) * (1 - smoothing);
  const thresholdScale = Math.max(0.01, Number(state.controls.thresholdScale) || 1);
  const threshold = Number(state.controls.thresholds[channel] ?? 0) * thresholdScale;
  const releaseThreshold = threshold * Number(state.controls.releaseRatio);
  const releaseMs = Math.max(0, Number(state.controls.releaseMs) || 0);
  const now = Date.now();
  const triggered = smoothed >= threshold;
  const heldByHysteresis = state.active[channel] && smoothed >= releaseThreshold;

  state.values[channel] = rawValue;
  state.smoothed[channel] = smoothed;
  if (triggered) {
    state.activeUntil[channel] = now + releaseMs;
    if (releaseMs > 0) scheduleReleaseCheck(channel, releaseMs);
  }
  state.active[channel] = triggered || heldByHysteresis || now < state.activeUntil[channel];
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
  const value = normalizeMovement(movementAmount(state.rawVectors[channel], rawVector), "osc");
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
  const normalizedValue = normalizeMovement(value, source);
  applyFingerValue(channel, normalizedValue);
  publishPattern();
  broadcast({
    type: "frame",
    source,
    channel,
    rawValue: normalizedValue,
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
    applyFingerValue(channel, normalizeMovement(value, "fbx-replay"));
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

function resetTransientFingerState() {
  for (const channel of ORDERED_CHANNELS) {
    state.rawVectors[channel] = null;
    state.values[channel] = 0;
    state.smoothed[channel] = 0;
    state.active[channel] = false;
    state.activeUntil[channel] = 0;
    rokokoLastQuats[channel] = null;
    clearTimeout(releaseTimers[channel]);
  }
  state.publishedPattern = "0000000000";
  publishPattern(true);
}

function handleRokokoPacket(data) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(lz4js.decompress(data)).toString("utf-8"));
  } catch (error) {
    console.error("Rokoko packet decode error:", error.message);
    return;
  }
  const body = payload?.scene?.actors?.[0]?.body;
  if (!body) return;

  if (rokokoPacketsReceived === 0) {
    console.log("Rokoko JSON v3 stream live (gloves: " + (payload.scene.actors[0].meta?.hasGloves ? "yes" : "no") + ")");
  }
  rokokoPacketsReceived += 1;

  for (const hand of HANDS) {
    const handPrefix = hand === "left" ? "left" : "right";
    for (const finger of FINGERS) {
      const channel = `${hand}.${finger}`;
      const fingerPrefix = ROKOKO_FINGER_NAMES[finger];
      const currentQuats = ROKOKO_JOINTS
        .map((joint) => body[`${handPrefix}${fingerPrefix}${joint}`]?.rotation)
        .filter(Boolean);
      if (currentQuats.length === 0) continue;
      const previousQuats = rokokoLastQuats[channel];
      if (previousQuats && previousQuats.length === currentQuats.length) {
        const value = currentQuats.reduce(
          (sum, current, index) => sum + quaternionAngle(previousQuats[index], current),
          0,
        );
        handleFingerMovement(channel, value, "rokoko");
      }
      rokokoLastQuats[channel] = currentQuats;
    }
  }
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
    if (message.inputScales) {
      for (const source of Object.keys(state.controls.inputScales)) {
        if (message.inputScales[source] !== undefined) {
          state.controls.inputScales[source] = Number(message.inputScales[source]);
        }
      }
    }
    if (message.releaseRatio !== undefined) state.controls.releaseRatio = Number(message.releaseRatio);
    if (message.releaseMs !== undefined) state.controls.releaseMs = Number(message.releaseMs);
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
        const jointQuaternions = [];
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
          jointQuaternions.push([current.x, current.y, current.z, current.w]);
          return sum + quaternionAngle(previous, current);
        }, 0);
        replayFrame.movements[channel] = value;
        replayFrame.pose[channel] = {
          angles: jointAngles,
          quaternions: jointQuaternions,
        };
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
  let loop = 0;
  setInterval(() => {
    const frame = replayFrames[index];
    handleReplayFrame(frame);
    index += 1;
    if (index >= replayFrames.length) {
      index = 0;
      loop += 1;
      resetTransientFingerState();
      console.log(`FBX replay restarted loop ${loop}`);
      broadcast({ type: "replay-loop", loop });
    }
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

if (!args["--no-rokoko"]) {
  const rokokoAddress = args["--rokoko-address"] || "0.0.0.0";
  const rokokoPort = args["--rokoko-port"] || 14043;
  const rokokoSocket = dgram.createSocket("udp4");
  rokokoSocket.on("message", handleRokokoPacket);
  rokokoSocket.on("error", (error) => console.error("Rokoko UDP error:", error.message));
  rokokoSocket.bind(rokokoPort, rokokoAddress, () => {
    console.log(`Rokoko JSON v3 (LZ4) listening ${rokokoAddress}:${rokokoPort}`);
  });
}

if (args["--replay-fbx"]) {
  startFbxReplay(args["--replay-fbx"], args["--replay-fps"] || 30).catch((error) => {
    console.error("FBX replay error:", error);
    process.exitCode = 1;
  });
}
