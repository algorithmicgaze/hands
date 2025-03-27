import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const ACTIVE_TRAIL_SIZE = 120;
const PASSIVE_TRAIL_SIZE = 5000;
const ACTIVE_EVERY_NTH = 1;
const PASSIVE_EVERY_NTH = 10;

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
];

const sendingBones = [
  "leftFoot",
  "leftUpLeg",
  "leftUpperArm",
  "leftLowerArm",
  "leftLowerArm",
  "rightLowerArm",
  "rightLowerArm",
  "rightUpperArm",
  "rightUpLeg",
  "rightFoot",
];

let isSendingVibrations = false;
let isDrawingSkeleton = false;
document.title = "ACP [MUTED]";

const boneMeshMap = new Map();

function addCubeToMesh(boneName, bone, mesh) {
  dummy.scale.set(1, 1, 1);
  dummy.position.x = bone.position.x * 3;
  dummy.position.y = bone.position.y * 3;
  dummy.position.z = bone.position.z * 3;
  dummy.quaternion.set(bone.rotation.x, bone.rotation.y, bone.rotation.z, bone.rotation.w);
  dummy.updateMatrix();

  mesh.setMatrixAt(mesh.index, dummy.matrix);
  mesh.index = (mesh.index + 1) % mesh.count;
  mesh.instanceMatrix.needsUpdate = true;
}

function createBoneMesh(boneName, geometry, materialProps, trailSize) {
  const material = new THREE.MeshBasicMaterial(materialProps);
  const mesh = new THREE.InstancedMesh(geometry, material, trailSize);
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.index = 0;

  const dummy = new THREE.Object3D();
  dummy.scale.set(0, 0, 0);
  dummy.updateMatrix();
  for (let i = 0; i < mesh.count; i++) {
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  return mesh;
}

const prevBoneValuesMap = new Map();
function boneToBit(message, boneName, update = true) {
  const bone = message[boneName];
  const { x, y, z } = bone.position;

  const mag = Math.sqrt(x * x + y * y + z * z);
  let prevMag = 0;
  if (update) {
    const prevMags = prevBoneValuesMap.get(boneName) || [];
    prevMag = prevMags.length === 0 ? 0 : prevMags.reduce((sum, value) => sum + value, 0) / prevMags.length;
    prevMags.push(mag);
    if (prevMags.length > 5) {
      prevMags.shift();
    }
    prevBoneValuesMap.set(boneName, prevMags);
  } else {
    const prevMags = prevBoneValuesMap.get(boneName) || [];
    prevMag = prevMags.reduce((sum, value) => sum + value, 0) / prevMags.length;
  }
  const oboeSensitivity = 0.001;
  const normalSensitivity = 0.005;
  const lowSensitivity = 0.01;
  const sensitivity = normalSensitivity;
  if (Math.abs(mag - prevMag) > sensitivity) {
    return true;
  } else {
    return false;
  }
}

function clearSkeletonHistory() {
  const invisibleMatrix = new THREE.Matrix4().scale(new THREE.Vector3(0, 0, 0));
  for (const mesh of boneMeshMap.values()) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.setMatrixAt(i, invisibleMatrix);
    }
    mesh.index = 0;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

function sendMuteSignal() {
  const pattern = Array(10).fill(false);
  mqttOut.sendPattern(pattern);
}

function setupWebSocket() {
  const ws = new WebSocket("ws://localhost:8080");
  let retries = 0;
  const maxRetries = 10;
  const maxDelay = 10000;
  let messageIndex = 0;

  ws.onopen = () => {
    console.log("connected");
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    // console.log(message);

    if (message.type === "position") {
      // Calculate the on/off state of each bone
      const boneBits = {};
      for (const boneName of trackedBones) {
        boneBits[boneName] = boneToBit(message, boneName);
      }

      // Update the cube position
      for (const boneName of trackedBones) {
        const isActive = sendingBones.includes(boneName);
        let addCube = false;
        if (isActive) {
          if (messageIndex % ACTIVE_EVERY_NTH === 0) {
            addCube = true;
          }
        } else {
          if (messageIndex % PASSIVE_EVERY_NTH === 0) {
            console.log(messageIndex, PASSIVE_EVERY_NTH);
            addCube = true;
          }
        }
        const mesh = boneMeshMap.get(boneName);
        const boneData = message[boneName];
        if (!mesh || !boneData) {
          debugger;
        }
        if (addCube) {
          addCubeToMesh(boneName, boneData, mesh);
        }
      }
      const pattern = sendingBones.map((boneName) => boneBits[boneName]);
      if (isSendingVibrations) {
        mqttOut.sendPattern(pattern);
      }
      messageIndex++;
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
    console.error("WebSocket encountered error: ", err.message, "Closing socket");
    ws.close();
  };
}

setupWebSocket();
const mqttOut = new MqttOut();

// Treat the trail as a circular buffer
// let trailIndex = 0;

// Initialize THREE.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
const skeletonGroup = new THREE.Group();
scene.add(skeletonGroup);
skeletonGroup.visible = isDrawingSkeleton;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const dummy = new THREE.Object3D();
dummy.scale.set(0, 0, 0);
dummy.updateMatrix();

// Create a cube
const passiveGeometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
const activeGeometry = new THREE.BoxGeometry(0.1, 0.01, 0.01);

for (const boneName of trackedBones) {
  if (sendingBones.includes(boneName)) {
    const activeMesh = createBoneMesh(boneName, activeGeometry, { color: 0xffffff }, ACTIVE_TRAIL_SIZE);
    boneMeshMap.set(boneName, activeMesh);
    skeletonGroup.add(activeMesh);
  } else {
    const passiveMesh = createBoneMesh(boneName, passiveGeometry, { color: 0x555555 }, PASSIVE_TRAIL_SIZE);
    boneMeshMap.set(boneName, passiveMesh);
    skeletonGroup.add(passiveMesh);
  }
  //   const activeMesh = createBoneMesh(
  //     boneName,
  //     sendingBones.includes(boneName) ? activeGeometry : passiveGeometry,
  //     { color: sendingBones.includes(boneName) ? 0xffffff : 0x888888 },
  //     ACTIVE_TRAIL_SIZE
  //   );
  //   activeBoneMeshMap.set(boneName, activeMesh);
  //   skeletonGroup.add(activeMesh);
}

// const hipCubes = createBoneMesh(0x00ff00); scene.add(hipCubes);
// const leftFootCubes = createBoneMesh(0xff0000); scene.add(leftFootCubes);
// const rightFootCubes = createBoneMesh(0x0000ff); scene.add(rightFootCubes);
// const leftShoulderCubes = createBoneMesh(0xff6666); scene.add(leftShoulderCubes);
// const rightShoulderCubes = createBoneMesh(0x6666ff); scene.add(rightShoulderCubes);
// const rightShoulderCubes = createBoneMesh(0x6666ff); scene.add(rightShoulderCubes);

// add a grid helper
const gridHelper = new THREE.GridHelper(10, 10, 0x333333, 0x333333);
gridHelper.rotation.y = Math.PI / 4;
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
      options,
    );
  } else if (e.key === "m") {
    isSendingVibrations = !isSendingVibrations;
    if (isSendingVibrations) {
      document.title = "ACP [SENDING]";
    } else {
      sendMuteSignal();
      document.title = "ACP [MUTED]";
    }
  } else if (e.key === "v") {
    isDrawingSkeleton = !isDrawingSkeleton;
    skeletonGroup.visible = isDrawingSkeleton;
    if (isDrawingSkeleton) {
      clearSkeletonHistory();
    }
  } else if (e.key === "f") {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      document.documentElement.style.cursor = "auto";
    } else {
      document.documentElement.requestFullscreen();
      document.documentElement.style.cursor = "none";
    }
  }
}

// Add the event listener
window.addEventListener("resize", onWindowResize, false);
window.addEventListener("keydown", onKeyDown);

animate();
