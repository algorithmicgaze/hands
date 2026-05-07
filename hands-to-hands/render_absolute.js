import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const FINGERS = ["thumb", "index", "middle", "ring", "pinky"];
const HANDS = ["left", "right"];
const CHANNELS = HANDS.flatMap((hand) => FINGERS.map((finger) => `${hand}.${finger}`));

const state = {
  connected: false,
  mqttConnected: false,
  enabled: false,
  pattern: "0000000000",
  values: Object.fromEntries(CHANNELS.map((channel) => [channel, 0])),
  smoothed: Object.fromEntries(CHANNELS.map((channel) => [channel, 0])),
  active: Object.fromEntries(CHANNELS.map((channel) => [channel, false])),
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
  oscMessages: 0,
  lastOscAt: null,
  pose: {},
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101112);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 5.8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x27302c, 2.4));
const keyLight = new THREE.DirectionalLight(0xfff3c2, 2);
keyLight.position.set(3, 6, 5);
scene.add(keyLight);

const grid = new THREE.GridHelper(8, 16, 0x4f5353, 0x282b2b);
grid.position.y = -1.3;
scene.add(grid);

const fingerRigs = new Map();
const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3d3b, roughness: 0.62, metalness: 0.08 });
const activeMaterial = new THREE.MeshStandardMaterial({ color: 0x48d597, roughness: 0.42, metalness: 0.18 });
const palmMaterial = new THREE.MeshStandardMaterial({ color: 0x2f3331, roughness: 0.7, metalness: 0.04 });

function makePalm(hand) {
  const group = new THREE.Group();
  group.position.set(hand === "left" ? -1.25 : 1.25, -0.9, 0);
  group.rotation.z = hand === "left" ? -0.13 : 0.13;

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.52, 0.18), palmMaterial);
  palm.position.y = -0.08;
  group.add(palm);

  const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.16), palmMaterial);
  wrist.position.y = -0.44;
  group.add(wrist);

  scene.add(group);
  return group;
}

const palms = Object.fromEntries(HANDS.map((hand) => [hand, makePalm(hand)]));

function makeFinger(hand, finger, index) {
  const xSign = hand === "left" ? -1 : 1;
  const root = new THREE.Group();
  const spread = (index - 2) * 0.12;
  const x = (index - 2) * 0.16;
  const isThumb = finger === "thumb";
  root.position.set(isThumb ? xSign * 0.43 : x, isThumb ? -0.22 : 0.2, isThumb ? 0.06 : 0);
  root.rotation.z = isThumb ? xSign * 0.95 : -spread;
  root.rotation.y = isThumb ? xSign * 0.35 : 0;

  const lengths = isThumb ? [0.24, 0.22, 0.18] : [0.34, 0.27, 0.2];
  const segments = [];
  const joints = [];
  let parent = root;
  for (let i = 0; i < lengths.length; i += 1) {
    const joint = new THREE.Group();
    joint.position.y = i === 0 ? 0 : lengths[i - 1];
    parent.add(joint);
    joints.push(joint);

    const segment = new THREE.Mesh(new THREE.BoxGeometry(0.1, lengths[i], 0.1), baseMaterial);
    segment.position.y = lengths[i] / 2;
    joint.add(segment);
    segments.push(segment);
    parent = joint;
  }

  palms[hand].add(root);
  fingerRigs.set(`${hand}.${finger}`, { root, joints, segments });
}

for (const hand of HANDS) {
  FINGERS.forEach((finger, index) => makeFinger(hand, finger, index));
}

function createPanel() {
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.innerHTML = `
    <header>
      <h1>Hands to Hands</h1>
      <button id="enabled" type="button" aria-pressed="false">Muted</button>
    </header>
    <div class="status">
      <div class="metric"><span>OSC</span><strong id="oscStatus">offline</strong></div>
      <div class="metric"><span>MQTT</span><strong id="mqttStatus">offline</strong></div>
      <div class="metric"><span>Pattern</span><strong id="pattern">0000000000</strong></div>
    </div>
    <div class="control-row">
      <label for="thresholdScale">Scale</label>
      <input id="thresholdScale" type="range" min="0.25" max="4" step="0.01">
      <input id="thresholdScaleNumber" type="number" min="0.25" max="4" step="0.01">
    </div>
    <div class="control-row">
      <label for="smoothing">Smoothing</label>
      <input id="smoothing" type="range" min="0" max="0.95" step="0.01">
      <input id="smoothingNumber" type="number" min="0" max="0.95" step="0.01">
    </div>
    <div class="control-row">
      <label for="releaseRatio">Release</label>
      <input id="releaseRatio" type="range" min="0.1" max="0.95" step="0.01">
      <input id="releaseRatioNumber" type="number" min="0.1" max="0.95" step="0.01">
    </div>
    <div id="fingerControls"></div>
    <pre id="exactValues"></pre>
  `;
  document.body.appendChild(panel);

  const fingerControls = panel.querySelector("#fingerControls");
  for (const hand of HANDS) {
    const section = document.createElement("section");
    section.className = "hand";
    section.innerHTML = `<h2>${hand} hand</h2>`;
    for (const finger of FINGERS) {
      const channel = `${hand}.${finger}`;
      const row = document.createElement("div");
      row.className = "finger-row";
      row.innerHTML = `
        <div class="finger-name">${finger}<span class="bit" data-bit="${channel}">0</span></div>
        <input data-threshold="${channel}" type="range" min="0" max="0.08" step="0.0005">
        <input data-threshold-number="${channel}" type="number" min="0" max="0.08" step="0.0005">
      `;
      section.appendChild(row);
    }
    fingerControls.appendChild(section);
  }
  return panel;
}

const panel = createPanel();
let ws;
let sendControlsTimer;

function sendControls() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    type: "set-controls",
    thresholds: state.thresholds,
    thresholdScale: state.thresholdScale,
    smoothing: state.smoothing,
    releaseRatio: state.releaseRatio,
  }));
}

function scheduleSendControls() {
  clearTimeout(sendControlsTimer);
  sendControlsTimer = setTimeout(sendControls, 80);
}

function bindRangePair(range, number, getter, setter) {
  const update = (value) => {
    setter(Number(value));
    range.value = getter();
    number.value = Number(getter()).toFixed(3);
    scheduleSendControls();
    updateUi();
  };
  range.addEventListener("input", () => update(range.value));
  number.addEventListener("input", () => update(number.value));
}

bindRangePair(
  panel.querySelector("#thresholdScale"),
  panel.querySelector("#thresholdScaleNumber"),
  () => state.thresholdScale,
  (value) => { state.thresholdScale = value; },
);
bindRangePair(
  panel.querySelector("#smoothing"),
  panel.querySelector("#smoothingNumber"),
  () => state.smoothing,
  (value) => { state.smoothing = value; },
);
bindRangePair(
  panel.querySelector("#releaseRatio"),
  panel.querySelector("#releaseRatioNumber"),
  () => state.releaseRatio,
  (value) => { state.releaseRatio = value; },
);

for (const channel of CHANNELS) {
  bindRangePair(
    panel.querySelector(`[data-threshold="${channel}"]`),
    panel.querySelector(`[data-threshold-number="${channel}"]`),
    () => state.thresholds[channel],
    (value) => { state.thresholds[channel] = value; },
  );
}

panel.querySelector("#enabled").addEventListener("click", () => {
  state.enabled = !state.enabled;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "set-enabled", enabled: state.enabled }));
  }
  updateUi();
});

function updateUi() {
  panel.querySelector("#oscStatus").textContent = state.lastOscAt ? `${state.oscMessages} msgs` : "waiting";
  panel.querySelector("#mqttStatus").textContent = state.mqttConnected ? "connected" : "offline";
  panel.querySelector("#pattern").textContent = state.pattern;
  const enabledButton = panel.querySelector("#enabled");
  enabledButton.textContent = state.enabled ? "Sending" : "Muted";
  enabledButton.setAttribute("aria-pressed", String(state.enabled));

  panel.querySelector("#smoothing").value = state.smoothing;
  panel.querySelector("#smoothingNumber").value = Number(state.smoothing).toFixed(3);
  panel.querySelector("#thresholdScale").value = state.thresholdScale;
  panel.querySelector("#thresholdScaleNumber").value = Number(state.thresholdScale).toFixed(3);
  panel.querySelector("#releaseRatio").value = state.releaseRatio;
  panel.querySelector("#releaseRatioNumber").value = Number(state.releaseRatio).toFixed(3);

  for (const channel of CHANNELS) {
    panel.querySelector(`[data-threshold="${channel}"]`).value = state.thresholds[channel];
    panel.querySelector(`[data-threshold-number="${channel}"]`).value = Number(state.thresholds[channel]).toFixed(3);
    const bit = panel.querySelector(`[data-bit="${channel}"]`);
    bit.textContent = state.active[channel] ? "1" : "0";
    bit.classList.toggle("on", Boolean(state.active[channel]));
  }

  panel.querySelector("#exactValues").textContent = JSON.stringify({
    thresholds: state.thresholds,
    thresholdScale: state.thresholdScale,
    effectiveThresholds: Object.fromEntries(CHANNELS.map((channel) => [
      channel,
      Number((state.thresholds[channel] * state.thresholdScale).toFixed(5)),
    ])),
    smoothing: state.smoothing,
    releaseRatio: state.releaseRatio,
  }, null, 2);
}

function updateScene() {
  for (const channel of CHANNELS) {
    const rig = fingerRigs.get(channel);
    const effectiveThreshold = state.thresholds[channel] * state.thresholdScale;
    const amount = Math.min(1, state.smoothed[channel] / Math.max(0.001, effectiveThreshold));
    const poseAngles = state.pose[channel];
    rig.segments.forEach((segment) => {
      segment.material = state.active[channel] ? activeMaterial : baseMaterial;
    });
    rig.joints.forEach((joint, index) => {
      const poseAngle = Array.isArray(poseAngles) ? poseAngles[index] || 0 : amount * (0.65 - index * 0.12);
      joint.rotation.x = -Math.min(1.35, poseAngle * 0.9);
      joint.rotation.z = index === 0 ? joint.rotation.z : 0;
    });
  }
}

function connectWebSocket() {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`);
  ws.addEventListener("open", () => {
    state.connected = true;
    updateUi();
  });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "hello") {
      Object.assign(state, {
        mqttConnected: message.state.mqttConnected,
        enabled: message.state.controls.enabled,
        thresholds: message.state.controls.thresholds,
        thresholdScale: message.state.controls.thresholdScale,
        smoothing: message.state.controls.smoothing,
        releaseRatio: message.state.controls.releaseRatio,
        pattern: message.state.publishedPattern,
        values: message.state.values,
        smoothed: message.state.smoothed,
        active: message.state.active,
        oscMessages: message.state.oscMessages,
        lastOscAt: message.state.lastOscAt,
        pose: message.state.pose || {},
      });
    }
    if (message.type === "frame") {
      state.pattern = message.pattern;
      state.values = message.values;
      state.smoothed = message.smoothed;
      state.active = message.active;
      state.oscMessages = message.oscMessages;
      state.lastOscAt = message.lastOscAt;
      if (message.pose) state.pose = message.pose;
    }
    if (message.type === "pattern") {
      state.pattern = message.pattern;
      state.active = message.active;
    }
    if (message.type === "controls") {
      state.enabled = message.controls.enabled;
      state.thresholds = message.controls.thresholds;
      state.thresholdScale = message.controls.thresholdScale;
      state.smoothing = message.controls.smoothing;
      state.releaseRatio = message.controls.releaseRatio;
    }
    if (message.type === "status") {
      if (message.mqttConnected !== undefined) state.mqttConnected = message.mqttConnected;
    }
    updateUi();
  });
  ws.addEventListener("close", () => {
    state.connected = false;
    setTimeout(connectWebSocket, 1000);
    updateUi();
  });
}

function animate() {
  requestAnimationFrame(animate);
  updateScene();
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

connectWebSocket();
updateUi();
animate();
