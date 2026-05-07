import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const FINGERS = ["thumb", "index", "middle", "ring", "pinky"];
const HANDS = ["left", "right"];
const CHANNELS = HANDS.flatMap((hand) => FINGERS.map((finger) => `${hand}.${finger}`));
const MIN_SENSITIVITY = 0.025;
const MAX_SENSITIVITY = 8;

const state = {
  connected: false,
  mqttConnected: false,
  enabled: false,
  pattern: "0000000000",
  values: Object.fromEntries(CHANNELS.map((channel) => [channel, 0])),
  smoothed: Object.fromEntries(CHANNELS.map((channel) => [channel, 0])),
  active: Object.fromEntries(CHANNELS.map((channel) => [channel, false])),
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
  },
  smoothing: 0.25,
  releaseRatio: 0.65,
  releaseMs: 120,
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
const inactiveMaterial = new THREE.MeshStandardMaterial({ color: 0x7d8178, roughness: 0.68, metalness: 0.02 });
const activeMaterial = new THREE.MeshStandardMaterial({
  color: 0x41f28e,
  emissive: 0x16884d,
  emissiveIntensity: 0.55,
  roughness: 0.38,
  metalness: 0.04,
});
const jointMaterial = new THREE.MeshStandardMaterial({ color: 0x222725, roughness: 0.7, metalness: 0.02 });
const palmMaterial = new THREE.MeshStandardMaterial({ color: 0x303630, roughness: 0.72, metalness: 0.04 });

function makeCapsule(length, radius, material) {
  const group = new THREE.Group();
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 18), material);
  cylinder.position.y = length / 2;
  group.add(cylinder);

  const capGeometry = new THREE.SphereGeometry(radius, 18, 10);
  const baseCap = new THREE.Mesh(capGeometry, material);
  baseCap.position.y = 0;
  group.add(baseCap);

  const tipCap = new THREE.Mesh(capGeometry, material);
  tipCap.position.y = length;
  group.add(tipCap);
  group.userData.parts = [cylinder, baseCap, tipCap];
  return group;
}

function makePalm(hand) {
  const group = new THREE.Group();
  group.position.set(hand === "left" ? -1.05 : 1.05, -0.85, 0);
  group.rotation.z = hand === "left" ? -0.1 : 0.1;

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.56, 0.22), palmMaterial);
  palm.position.y = -0.1;
  group.add(palm);

  const knuckleGeometry = new THREE.SphereGeometry(0.045, 16, 8);
  for (let i = 0; i < 4; i += 1) {
    const knuckle = new THREE.Mesh(knuckleGeometry, jointMaterial);
    knuckle.position.set((i - 1.5) * 0.16, 0.18, 0.025);
    knuckle.scale.set(1.25, 0.45, 0.8);
    group.add(knuckle);
  }

  const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.26, 0.18), palmMaterial);
  wrist.position.y = -0.48;
  group.add(wrist);

  scene.add(group);
  return group;
}

const palms = Object.fromEntries(HANDS.map((hand) => [hand, makePalm(hand)]));

function makeFinger(hand, finger, index) {
  const thumbSign = hand === "left" ? 1 : -1;
  const root = new THREE.Group();
  const spread = (index - 2) * 0.09;
  const isThumb = finger === "thumb";
  const x = isThumb ? thumbSign * 0.43 : (index - 2) * 0.16;
  root.position.set(x, isThumb ? -0.08 : 0.22, isThumb ? 0.16 : 0.02);
  root.rotation.z = isThumb ? -thumbSign * 0.95 : -spread;
  root.rotation.y = isThumb ? -thumbSign * 0.45 : 0;
  root.rotation.x = isThumb ? -0.1 : 0;

  const lengths = isThumb ? [0.22, 0.18, 0.14] : [0.34, 0.25, 0.19];
  const radius = isThumb ? 0.055 : 0.05;
  const segments = [];
  const joints = [];
  let parent = root;
  for (let i = 0; i < lengths.length; i += 1) {
    const joint = new THREE.Group();
    joint.position.y = i === 0 ? 0 : lengths[i - 1];
    parent.add(joint);
    joints.push(joint);

    const jointMarker = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.18, 16, 10), jointMaterial);
    joint.add(jointMarker);

    const segment = makeCapsule(lengths[i], radius, inactiveMaterial);
    joint.add(segment);
    segments.push(segment);
    parent = joint;
  }

  palms[hand].add(root);
  fingerRigs.set(`${hand}.${finger}`, { hand, finger, root, restRotation: root.rotation.clone(), joints, segments });
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
      <label for="sensitivity">Sensitivity</label>
      <input id="sensitivity" type="range" min="0" max="100" step="0.1">
      <input id="sensitivityNumber" type="number" min="0.025" max="8" step="0.001">
    </div>
    <div class="control-row">
      <label for="oscScale">OSC gain</label>
      <input id="oscScale" type="range" min="0.05" max="20" step="0.05">
      <input id="oscScaleNumber" type="number" min="0.05" max="20" step="0.05">
    </div>
    <div class="control-row">
      <label for="fbxScale">FBX gain</label>
      <input id="fbxScale" type="range" min="0.05" max="20" step="0.05">
      <input id="fbxScaleNumber" type="number" min="0.05" max="20" step="0.05">
    </div>
    <div class="control-row">
      <label for="smoothing">Smoothing</label>
      <input id="smoothing" type="range" min="0" max="0.95" step="0.01">
      <input id="smoothingNumber" type="number" min="0" max="0.95" step="0.01">
    </div>
    <div class="control-row">
      <label for="releaseMs">Release</label>
      <input id="releaseMs" type="range" min="0" max="2000" step="10">
      <input id="releaseMsNumber" type="number" min="0" max="2000" step="10">
    </div>
    <div class="control-row">
      <label for="releaseRatio">Hysteresis</label>
      <input id="releaseRatio" type="range" min="0.1" max="0.95" step="0.01">
      <input id="releaseRatioNumber" type="number" min="0.1" max="0.95" step="0.01">
    </div>
    <div id="fingerControls"></div>
    <div class="copy-row">
      <span id="copyStatus" class="copy-status">Calibration JSON ready</span>
      <button id="copyJson" class="copy-button" type="button">Copy</button>
    </div>
  `;
  document.body.appendChild(panel);

  const fingerControls = panel.querySelector("#fingerControls");
  for (const hand of HANDS) {
    const section = document.createElement("details");
    section.className = "hand";
    section.innerHTML = `
      <summary>
        <span class="hand-title">${hand} hand</span>
        <span class="dot-row" aria-label="${hand} hand bit state">
          ${FINGERS.map((finger) => `<span class="summary-dot" data-summary-bit="${hand}.${finger}">0</span>`).join("")}
        </span>
      </summary>
      <div class="finger-settings"></div>
    `;
    const settings = section.querySelector(".finger-settings");
    for (const finger of FINGERS) {
      const channel = `${hand}.${finger}`;
      const row = document.createElement("div");
      row.className = "finger-row";
      row.innerHTML = `
        <div class="finger-name">${finger}<span class="bit" data-bit="${channel}">0</span></div>
        <input data-threshold="${channel}" type="range" min="0" max="0.5" step="0.0005">
        <input data-threshold-number="${channel}" type="number" min="0" max="0.5" step="0.0005">
      `;
      settings.appendChild(row);
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
    inputScales: state.inputScales,
    smoothing: state.smoothing,
    releaseRatio: state.releaseRatio,
    releaseMs: state.releaseMs,
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sensitivityFromThresholdScale(thresholdScale) {
  return clamp(1 / Math.max(0.001, Number(thresholdScale) || 1), MIN_SENSITIVITY, MAX_SENSITIVITY);
}

function thresholdScaleFromSensitivity(sensitivity) {
  return 1 / clamp(Number(sensitivity) || 1, MIN_SENSITIVITY, MAX_SENSITIVITY);
}

function sliderValueFromSensitivity(sensitivity) {
  const minLog = Math.log10(MIN_SENSITIVITY);
  const maxLog = Math.log10(MAX_SENSITIVITY);
  const valueLog = Math.log10(clamp(sensitivity, MIN_SENSITIVITY, MAX_SENSITIVITY));
  return ((valueLog - minLog) / (maxLog - minLog)) * 100;
}

function sensitivityFromSliderValue(value) {
  const minLog = Math.log10(MIN_SENSITIVITY);
  const maxLog = Math.log10(MAX_SENSITIVITY);
  return 10 ** (minLog + (Number(value) / 100) * (maxLog - minLog));
}

function updateSensitivityControls() {
  const sensitivity = sensitivityFromThresholdScale(state.thresholdScale);
  panel.querySelector("#sensitivity").value = sliderValueFromSensitivity(sensitivity);
  panel.querySelector("#sensitivityNumber").value = sensitivity.toFixed(3);
}

function bindSensitivityControls() {
  const range = panel.querySelector("#sensitivity");
  const number = panel.querySelector("#sensitivityNumber");
  const update = (sensitivity) => {
    state.thresholdScale = thresholdScaleFromSensitivity(sensitivity);
    updateSensitivityControls();
    scheduleSendControls();
    updateUi();
  };
  range.addEventListener("input", () => update(sensitivityFromSliderValue(range.value)));
  number.addEventListener("input", () => update(number.value));
}

bindSensitivityControls();
bindRangePair(
  panel.querySelector("#oscScale"),
  panel.querySelector("#oscScaleNumber"),
  () => state.inputScales.osc,
  (value) => { state.inputScales.osc = value; },
);
bindRangePair(
  panel.querySelector("#fbxScale"),
  panel.querySelector("#fbxScaleNumber"),
  () => state.inputScales.fbxReplay,
  (value) => { state.inputScales.fbxReplay = value; },
);
bindRangePair(
  panel.querySelector("#smoothing"),
  panel.querySelector("#smoothingNumber"),
  () => state.smoothing,
  (value) => { state.smoothing = value; },
);
bindRangePair(
  panel.querySelector("#releaseMs"),
  panel.querySelector("#releaseMsNumber"),
  () => state.releaseMs,
  (value) => { state.releaseMs = value; },
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

function calibrationJson() {
  const sensitivity = sensitivityFromThresholdScale(state.thresholdScale);
  return JSON.stringify({
    thresholds: state.thresholds,
    sensitivity: Number(sensitivity.toFixed(5)),
    thresholdScale: state.thresholdScale,
    inputScales: state.inputScales,
    effectiveThresholds: Object.fromEntries(CHANNELS.map((channel) => [
      channel,
      Number((state.thresholds[channel] * state.thresholdScale).toFixed(5)),
    ])),
    smoothing: state.smoothing,
    releaseRatio: state.releaseRatio,
    releaseMs: state.releaseMs,
  }, null, 2);
}

async function copyCalibrationJson() {
  await navigator.clipboard.writeText(calibrationJson());
  const status = panel.querySelector("#copyStatus");
  status.textContent = "Copied calibration JSON";
  setTimeout(() => {
    status.textContent = "Calibration JSON ready";
  }, 1400);
}

panel.querySelector("#copyJson").addEventListener("click", () => {
  copyCalibrationJson().catch((error) => {
    panel.querySelector("#copyStatus").textContent = `Copy failed: ${error.message}`;
  });
});

function updatePatternDisplay(pattern) {
  const patternEl = panel.querySelector("#pattern");
  patternEl.replaceChildren(
    ...pattern.split("").map((bit) => {
      const span = document.createElement("span");
      span.className = "pattern-bit";
      span.dataset.bit = bit;
      span.textContent = bit;
      return span;
    }),
  );
  patternEl.setAttribute("aria-label", pattern);
}

function updateUi() {
  panel.querySelector("#oscStatus").textContent = state.lastOscAt ? `${state.oscMessages} msgs` : "waiting";
  panel.querySelector("#mqttStatus").textContent = state.mqttConnected ? "connected" : "offline";
  updatePatternDisplay(state.pattern);
  const enabledButton = panel.querySelector("#enabled");
  enabledButton.textContent = state.enabled ? "Sending" : "Muted";
  enabledButton.setAttribute("aria-pressed", String(state.enabled));

  panel.querySelector("#smoothing").value = state.smoothing;
  panel.querySelector("#smoothingNumber").value = Number(state.smoothing).toFixed(3);
  updateSensitivityControls();
  panel.querySelector("#oscScale").value = state.inputScales.osc;
  panel.querySelector("#oscScaleNumber").value = Number(state.inputScales.osc).toFixed(3);
  panel.querySelector("#fbxScale").value = state.inputScales.fbxReplay;
  panel.querySelector("#fbxScaleNumber").value = Number(state.inputScales.fbxReplay).toFixed(3);
  panel.querySelector("#releaseMs").value = state.releaseMs;
  panel.querySelector("#releaseMsNumber").value = Number(state.releaseMs).toFixed(0);
  panel.querySelector("#releaseRatio").value = state.releaseRatio;
  panel.querySelector("#releaseRatioNumber").value = Number(state.releaseRatio).toFixed(3);

  for (const channel of CHANNELS) {
    panel.querySelector(`[data-threshold="${channel}"]`).value = state.thresholds[channel];
    panel.querySelector(`[data-threshold-number="${channel}"]`).value = Number(state.thresholds[channel]).toFixed(3);
    const bit = panel.querySelector(`[data-bit="${channel}"]`);
    bit.textContent = state.active[channel] ? "1" : "0";
    bit.classList.toggle("on", Boolean(state.active[channel]));
    const summaryBit = panel.querySelector(`[data-summary-bit="${channel}"]`);
    summaryBit.textContent = state.active[channel] ? "1" : "0";
    summaryBit.classList.toggle("on", Boolean(state.active[channel]));
  }

  panel.querySelector("#copyStatus").textContent = "Calibration JSON ready";
}

function updateScene() {
  for (const channel of CHANNELS) {
    const rig = fingerRigs.get(channel);
    const effectiveThreshold = state.thresholds[channel] * state.thresholdScale;
    const amount = Math.min(1, state.smoothed[channel] / Math.max(0.001, effectiveThreshold));
    const pose = state.pose[channel];
    const poseAngles = Array.isArray(pose) ? pose : pose?.angles;
    const poseQuaternions = pose?.quaternions;
    rig.segments.forEach((segment) => {
      const material = state.active[channel] ? activeMaterial : inactiveMaterial;
      for (const part of segment.userData.parts || [segment]) {
        part.material = material;
      }
    });
    rig.joints.forEach((joint, index) => {
      const quat = poseQuaternions?.[index];
      if (rig.finger === "thumb") {
        const poseAngle = Array.isArray(poseAngles) ? poseAngles[index] || 0 : amount * (0.6 - index * 0.12);
        const curl = Math.min(0.85, poseAngle * 0.45 + amount * 0.2);
        const opposition = index === 0 ? (rig.hand === "left" ? -0.2 : 0.2) : 0;
        joint.rotation.set(-curl, opposition, 0);
      } else if (quat) {
        joint.quaternion.set(quat[0], quat[1], quat[2], quat[3]).normalize();
      } else {
        const poseAngle = Array.isArray(poseAngles) ? poseAngles[index] || 0 : amount * (0.65 - index * 0.12);
        joint.rotation.set(-Math.min(1.35, poseAngle * 0.9), 0, 0);
      }
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
        inputScales: message.state.controls.inputScales,
        smoothing: message.state.controls.smoothing,
        releaseRatio: message.state.controls.releaseRatio,
        releaseMs: message.state.controls.releaseMs,
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
      state.inputScales = message.controls.inputScales;
      state.smoothing = message.controls.smoothing;
      state.releaseRatio = message.controls.releaseRatio;
      state.releaseMs = message.controls.releaseMs ?? state.releaseMs;
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
