import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const TRAIL_SIZE = 3000;

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

const boneMeshMap = new Map();

function addCubeToMesh(boneName, bone, mesh) {
  const rootPos = boneName.startsWith("left")
    ? leftHandPosition
    : rightHandPosition;
  dummy.scale.set(1, 1, 1);
  dummy.position.x = (bone.position.x - rootPos.x) * 3;
  dummy.position.y = (bone.position.y - rootPos.y) * 3;
  dummy.position.z = (bone.position.z - rootPos.z) * 3;
  dummy.quaternion.set(
    bone.rotation.x,
    bone.rotation.y,
    bone.rotation.z,
    bone.rotation.w
  );
  dummy.updateMatrix();

  mesh.setMatrixAt(mesh.index, dummy.matrix);
  mesh.index = (mesh.index + 1) % TRAIL_SIZE;
  mesh.instanceMatrix.needsUpdate = true;
}

function createBoneMesh(boneName) {
  let color = 0x333333;
  if (boneName.includes("left")) {
    color = "yellow";
  } else if (boneName.includes("right")) {
    color = "pink";
  }
  // const color = 0xffffff;
  // console.log(boneName, color);
  const material = new THREE.MeshBasicMaterial({ color: color });
  const mesh = new THREE.InstancedMesh(geometry, material, TRAIL_SIZE);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.index = 0;

  const dummy = new THREE.Object3D();
  dummy.scale.set(0, 0, 0);
  dummy.updateMatrix();
  for (let i = 0; i < TRAIL_SIZE; i++) {
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  return mesh;
}

const prevBoneValuesMap = new Map();

function boneToBit(message, boneName) {
  const bone = message[boneName];
  //const { w, x, y, z } = bone.rotation;
  const { x, y, z } = bone.position;
  const rootPos = boneName.startsWith("left")
    ? leftHandPosition
    : rightHandPosition;
  //   const mag = Math.sqrt(w * w + x * x + y * y + z * z);
  const dx = x - rootPos.x;
  const dy = y - rootPos.y;
  const dz = z - rootPos.z;

  const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const prevMags = prevBoneValuesMap.get(boneName) || [];
  const prevMag =
    prevMags.length === 0
      ? 0
      : prevMags.reduce((sum, value) => sum + value, 0) / prevMags.length;
  prevMags.push(mag);
  if (prevMags.length > 5) {
    prevMags.shift();
  }
  prevBoneValuesMap.set(boneName, prevMags);
  //   if (boneName === "leftIndexTip") {
  //     console.log(
  //       mag.toFixed(5),
  //       prevMag.toFixed(5),
  //       Math.abs(mag - prevMag).toFixed(5)
  //     );
  //   }
  const oboeSensitivity = 0.0003;
  const normalSensitivity = 0.005;
  const sensitivity = normalSensitivity;
  if (Math.abs(mag - prevMag) > sensitivity) {
    return true;
  } else {
    return false;
  }
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
        const mesh = boneMeshMap.get(boneName);
        const boneData = message[boneName];
        if (!mesh || !boneData) {
          debugger;
        }
        addCubeToMesh(boneName, boneData, mesh);
      }

      mqttOut.sendPattern([
        boneToBit(message, "leftLittleTip"),
        boneToBit(message, "leftRingTip"),
        boneToBit(message, "leftMiddleTip"),
        boneToBit(message, "leftIndexTip"),
        boneToBit(message, "leftThumbTip"),
        boneToBit(message, "rightThumbTip"),
        boneToBit(message, "rightIndexTip"),
        boneToBit(message, "rightMiddleTip"),
        boneToBit(message, "rightRingTip"),
        boneToBit(message, "rightLittleTip"),
      ]);
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
const mqttOut = new MqttOut();

// Treat the trail as a circular buffer
// let trailIndex = 0;

// Initialize THREE.js scene
const scene = new THREE.Scene();
window.scene = scene;
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
const geometry = new THREE.BoxGeometry(0.003, 0.003, 0.003);

const leftHandGroup = new THREE.Group();
const rightHandGroup = new THREE.Group();
leftHandGroup.position.set(-0.5, 2, 0);
rightHandGroup.position.set(0.5, 2, 0);
scene.add(leftHandGroup);
scene.add(rightHandGroup);

for (const boneName of trackedBones) {
  const mesh = createBoneMesh(boneName);
  boneMeshMap.set(boneName, mesh);
  if (boneName.startsWith("left")) {
    leftHandGroup.add(mesh);
  } else if (boneName.startsWith("right")) {
    rightHandGroup.add(mesh);
  }
}

// const hipCubes = createBoneMesh(0x00ff00); scene.add(hipCubes);
// const leftFootCubes = createBoneMesh(0xff0000); scene.add(leftFootCubes);
// const rightFootCubes = createBoneMesh(0x0000ff); scene.add(rightFootCubes);
// const leftShoulderCubes = createBoneMesh(0xff6666); scene.add(leftShoulderCubes);
// const rightShoulderCubes = createBoneMesh(0x6666ff); scene.add(rightShoulderCubes);
// const rightShoulderCubes = createBoneMesh(0x6666ff); scene.add(rightShoulderCubes);

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

// Add the event listener
window.addEventListener("resize", onWindowResize, false);

animate();
