const trackedBones = [
  "hip",
  "leftFoot",
  "rightFoot",
  "leftShoulder",
  "rightShoulder",
  "leftUpperArm",
  "rightUpperArm",
  "leftLowerArm",
  "rightLowerArm",
  "leftShoulder",
  "rightShoulder",
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

const boneMeshMap = new Map();

function addCubeToMesh(bone, mesh) {
  dummy.scale.set(1, 1, 1);
  dummy.position.x = bone.position.x * 3;
  dummy.position.y = bone.position.y * 3;
  dummy.position.z = bone.position.z * 3;
  dummy.quaternion.set(
    bone.rotation.x,
    bone.rotation.y,
    bone.rotation.z,
    bone.rotation.w,
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
    color = "green";
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

const ws = new WebSocket("ws://localhost:8080");
ws.onopen = () => {
  console.log("connected");
};
ws.onmessage = (event) => {
  // console.log(event.data);
  const message = JSON.parse(event.data);
  if (message.type === "position") {
    // console.log(message.hip);
    // Update the cube position
    for (const boneName of trackedBones) {
      const mesh = boneMeshMap.get(boneName);
      const boneData = message[boneName];
      if (!mesh || !boneData) {
        debugger;
      }
      addCubeToMesh(boneData, mesh);
    }
  }
};

const TRAIL_SIZE = 50_000;
// Treat the trail as a circular buffer
// let trailIndex = 0;

// Initialize THREE.js scene
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const dummy = new THREE.Object3D();
dummy.scale.set(0, 0, 0);
dummy.updateMatrix();

// Create a cube
const geometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);

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
const gridHelper = new THREE.GridHelper(10, 10);
scene.add(gridHelper);
// Add OrbitControls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

camera.position.z = 2;
camera.position.y = 3;
controls.target.set(0, 3, 0);

// Render loop
const animate = function () {
  requestAnimationFrame(animate);
  controls.update();
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

// Add the event listener
window.addEventListener("resize", onWindowResize, false);

animate();
