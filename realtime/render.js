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

function createBoneMesh(color) {
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
    addCubeToMesh(message.hip, hipCubes);
    addCubeToMesh(message.spine, spineCubes);
    addCubeToMesh(message.chest, chestCubes);
    addCubeToMesh(message.neck, neckCubes);
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
const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);

const hipCubes = createBoneMesh(0x00ff00);
const spineCubes = createBoneMesh(0xffff00);
const chestCubes = createBoneMesh(0xffffff);
const neckCubes = createBoneMesh(0x0000ff);

// for (let i = 0; i < TRAIL_SIZE; i++) {
//   hipCubes.setMatrixAt(i, dummy.matrix);
//   spineCubes.setMatrixAt(i, dummy.matrix);
//   chestCubes.setMatrixAt(i, dummy.matrix);
// }
// hipCubes.instanceMatrix.needsUpdate = true;
// chestCubes.instanceMatrix.needsUpdate = true;
scene.add(hipCubes);
scene.add(spineCubes);
scene.add(chestCubes);
scene.add(neckCubes);

camera.position.z = 5;
camera.position.y = 3;

// add a grid helper
const gridHelper = new THREE.GridHelper(10, 10);
scene.add(gridHelper);
// Add OrbitControls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
// Render loop
const animate = function () {
  requestAnimationFrame(animate);
  controls.update();
  // cube.rotation.x += 0.01;
  // cube.rotation.y += 0.01;
  renderer.render(scene, camera);
};
animate();
