import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const TRAIL_SIZE = 2000;

const trackedBones = [
  "hip",
  "spine",
  "chest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpLeg",
  "leftLeg",
  "leftFoot",
  "leftToe",
  "leftToeEnd",
  "rightUpLeg",
  "rightLeg",
  "rightFoot",
  "rightToe",
  "rightToeEnd",
  //   "leftThumbProximal",
  //   "leftThumbMedial",
  //   "leftThumbDistal",
  //   "leftThumbTip",
  //   "leftIndexProximal",
  //   "leftIndexMedial",
  //   "leftIndexDistal",
  //   "leftIndexTip",
  //   "leftMiddleProximal",
  //   "leftMiddleMedial",
  //   "leftMiddleDistal",
  //   "leftMiddleTip",
  //   "leftRingProximal",
  //   "leftRingMedial",
  //   "leftRingDistal",
  //   "leftRingTip",
  //   "leftLittleProximal",
  //   "leftLittleMedial",
  //   "leftLittleDistal",
  //   "leftLittleTip",
  //   "rightThumbProximal",
  //   "rightThumbMedial",
  //   "rightThumbDistal",
  //   "rightThumbTip",
  //   "rightIndexProximal",
  //   "rightIndexMedial",
  //   "rightIndexDistal",
  //   "rightIndexTip",
  //   "rightMiddleProximal",
  //   "rightMiddleMedial",
  //   "rightMiddleDistal",
  //   "rightMiddleTip",
  //   "rightRingProximal",
  //   "rightRingMedial",
  //   "rightRingDistal",
  //   "rightRingTip",
  //   "rightLittleProximal",
  //   "rightLittleMedial",
  //   "rightLittleDistal",
  //   "rightLittleTip",
];

// const colorMap = {
//   "leftFoot": 0x333333,
//   "rightFoot": 0x333333,

// }

let leftHandPosition = new THREE.Vector3();
let rightHandPosition = new THREE.Vector3();

const boneMeshMap = new Map();

function addCubeToMesh(boneName, bone, mesh) {
  dummy.scale.set(1, 1, 1);
  dummy.position.x = bone.position.x * 3;
  dummy.position.y = bone.position.y * 3;
  dummy.position.z = bone.position.z * 3;
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
  let color = "pink";
  const material = new THREE.MeshBasicMaterial({ color });
  const mesh = new THREE.InstancedMesh(geometry, material, TRAIL_SIZE);
  mesh.frustumCulled = false;
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

function setupWebSocket() {
  const ws = new WebSocket("ws://localhost:8080");
  let retries = 0;
  const maxRetries = 10;
  const maxDelay = 10000;

  ws.onopen = () => {
    console.log("connected");
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "position") {
      // Update the cube position
      for (const boneName of trackedBones) {
        const mesh = boneMeshMap.get(boneName);
        const boneData = message[boneName];
        if (!mesh || !boneData) {
          debugger;
        }
        addCubeToMesh(boneName, boneData, mesh);
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
const geometry = new THREE.BoxGeometry(0.003, 0.003, 0.003);

for (const boneName of trackedBones) {
  const mesh = createBoneMesh(boneName);
  boneMeshMap.set(boneName, mesh);
  scene.add(mesh);
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

camera.position.z = 4;
camera.position.y = 2;
controls.target.set(0, 2, 0);

// Render loop
const animate = function () {
  requestAnimationFrame(animate);
  controls.update();
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
