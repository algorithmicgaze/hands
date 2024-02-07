import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const TRAIL_SIZE = 5000;
const leftPoints = [];
const rightPoints = [];

const trackedBones = [
  "leftHand",
  "leftThumbTip",
  "leftIndexTip",
  "leftMiddleTip",
  "leftRingTip",
  "leftLittleTip",
  "rightThumbTip",
  "rightIndexTip",
  "rightMiddleTip",
  "rightRingTip",
  "rightLittleTip",
];

// const colorMap = {
//   "leftFoot": 0x333333,
//   "rightFoot": 0x333333,

// }

let leftHandPosition = new THREE.Vector3();
let rightHandPosition = new THREE.Vector3();

const bonePointMap = new Map();
const boneLineMap = new Map();

function addBonePoint(boneName, bone) {
  const rootPos = boneName.startsWith("left")
    ? leftHandPosition
    : rightHandPosition;

  const v = new THREE.Vector3(
    (bone.position.x - rootPos.x) * 10,
    (bone.position.y - rootPos.y) * 10,
    (bone.position.z - rootPos.z) * 10
  );
  const points = bonePointMap[boneName];
  points.push(v);
  if (points.length > TRAIL_SIZE) {
    points.shift();
  }
}

function createBoneLine(boneName) {
  let color = 0x333333;
  if (boneName.includes("left")) {
    color = "yellow";
  } else if (boneName.includes("right")) {
    color = "pink";
  }
  // const color = 0xffffff;
  // console.log(boneName, color);
  const material = new THREE.LineBasicMaterial({ color });
  const geometry = new THREE.BufferGeometry();
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  scene.add(line);

  return line;
}

function setupWebSocket() {
  const ws = new WebSocket("ws://localhost:8080");
  let retries = 0;
  const maxRetries = 10;
  const maxDelay = 10000;

  ws.onopen = () => {
    console.log("connected");
  };

  ws.onmessage = (event) => {
    // console.log(event.data);
    const message = JSON.parse(event.data);

    if (message.type === "position") {
      const leftPos = message["leftHand"].position;
      const rightPos = message["rightHand"].position;
      leftHandPosition.set(leftPos.x, leftPos.y, leftPos.z);
      rightHandPosition.set(rightPos.x, rightPos.y, rightPos.z);
      // console.log(message.hip);
      // Update the cube position
      for (const boneName of trackedBones) {
        const line = boneLineMap.get(boneName);
        const boneData = message[boneName];
        if (!line || !boneData) {
          debugger;
        }
        addBonePoint(boneName, boneData);
        line.geometry.setFromPoints(bonePointMap[boneName]);
      }
    }
  };

  ws.onclose = (e) => {
    console.log("WebSocket closed. Attempting to reconnect...", e.reason);
    retries++;
    if (retries <= maxRetries) {
      // Exponential backoff formula to calculate the delay before the next retry
      let delay = Math.min(maxDelay, Math.pow(2, retries) * 100);
      setTimeout(setupWebSocket, delay);
    } else {
      console.log("Maximum retries reached. Giving up.");
    }
  };

  ws.onerror = (err) => {
    console.error(
      "WebSocket encountered error: ",
      err.message,
      "Closing socket"
    );
    ws.close();
  };
}

setupWebSocket();

// Treat the trail as a circular buffer
// let trailIndex = 0;

// Initialize THREE.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const dummy = new THREE.Object3D();
dummy.scale.set(0, 0, 0);
dummy.updateMatrix();

// Create a cube
const geometry = new THREE.BoxGeometry(0.0015, 0.0015, 0.0015);

const leftHandGroup = new THREE.Group();
const rightHandGroup = new THREE.Group();
leftHandGroup.frustumCulled = false;
rightHandGroup.frustumCulled = false;
leftHandGroup.position.set(-2, 2, 0);
rightHandGroup.position.set(2, 2, 0);
scene.add(leftHandGroup);
scene.add(rightHandGroup);

for (const boneName of trackedBones) {
  const line = createBoneLine(boneName);
  boneLineMap.set(boneName, line);
  bonePointMap[boneName] = [];
  if (boneName.startsWith("left")) {
    leftHandGroup.add(line);
  } else if (boneName.startsWith("right")) {
    rightHandGroup.add(line);
  }
}

// add a grid helper
const gridHelper = new THREE.GridHelper(10, 10, 0x222222, 0x333333);
scene.add(gridHelper);
// Add OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

camera.position.z = 1;
camera.position.y = 2;
controls.target.set(0, 2, 0);

// Render loop
const animate = function () {
  requestAnimationFrame(animate);
  controls.update();
  leftHandGroup.rotation.y -= 0.001;
  rightHandGroup.rotation.y += 0.001;
  // cube.rotation.x += 0.01;
  // cube.rotation.y += 0.01;
  renderer.render(scene, camera);
};

function onWindowResize() {
  // Update camera aspect ratio and renderer size
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

const link = document.createElement("a");
link.style.display = "none";
document.body.appendChild(link); // Firefox workaround, see #6594

function save(blob, filename) {
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();

  // URL.revokeObjectURL( url ); breaks Firefox...
}

function saveString(text, filename) {
  save(new Blob([text], { type: "text/plain" }), filename);
}

function onKeyDown(e) {
  if (e.key === "e") {
    const gltfExporter = new GLTFExporter();
    const options = {};
    gltfExporter.parse(
      scene,
      (gltf) => {
        console.log(gltf);
        const output = JSON.stringify(gltf, null, 2);
        saveString(output, "out.gltf");
      },
      options
    );
  }
}

// Add the event listener
window.addEventListener("resize", onWindowResize, false);
window.addEventListener("keydown", onKeyDown);

animate();
