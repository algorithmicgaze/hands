import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "https://esm.sh/three@0.164.1/examples/jsm/loaders/FBXLoader.js";
import { calculateRelativeBones } from "./bone_utils.js";
import GUI from "https://esm.sh/lil-gui@0.19.2";

const gui = new GUI();

const options = {
  boneScale: 150,
  posScale: 150,
};

gui.add(options, "boneScale", 0, 150, 0.01);
gui.add(options, "posScale", 0, 150, 0.01);

const BONE_MAP = {
  hip: "mixamorigHips",
  spine: "mixamorigSpine",
  chest: "mixamorigSpine1",
  neck: "mixamorigNeck",
  head: "mixamorigHead",
  leftShoulder: "mixamorigLeftShoulder",
  leftUpperArm: "mixamorigLeftArm",
  leftLowerArm: "mixamorigLeftForeArm",
  leftHand: "mixamorigLeftHand",
  rightShoulder: "mixamorigRightShoulder",
  rightUpperArm: "mixamorigRightArm",
  rightLowerArm: "mixamorigRightForeArm",
  rightHand: "mixamorigRightHand",
  leftUpLeg: "mixamorigLeftUpLeg",
  leftLeg: "mixamorigLeftLeg",
  leftFoot: "mixamorigLeftFoot",
  leftToe: "mixamorigLeftToeBase",
  leftToeEnd: "mixamorigLeftToe_End",
  rightUpLeg: "mixamorigRightUpLeg",
  rightLeg: "mixamorigRightLeg",
  rightFoot: "mixamorigRightFoot",
  rightToe: "mixamorigRightToeBase",
  rightToeEnd: "mixamorigRightToe_End",
};

const clock = new THREE.Clock();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa0a0a0);
scene.fog = new THREE.Fog(0xa0a0a0, 200, 1000);

// Create floor
const mesh = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshPhongMaterial({ color: 0x999999, depthWrite: false })
);
mesh.rotation.x = -Math.PI / 2;
mesh.receiveShadow = true;
scene.add(mesh);

const grid = new THREE.GridHelper(2000, 20, 0x000000, 0x000000);
grid.material.opacity = 0.2;
grid.material.transparent = true;
scene.add(grid);

// Create a light
const dirLight = new THREE.DirectionalLight(0xffffff, 5);
dirLight.position.set(0, 200, 100);
dirLight.castShadow = true;
dirLight.shadow.camera.top = 180;
dirLight.shadow.camera.bottom = -100;
dirLight.shadow.camera.left = -120;
dirLight.shadow.camera.right = 120;
scene.add(dirLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 5);
hemiLight.position.set(0, 200, 0);
scene.add(hemiLight);

const spotLight = new THREE.SpotLight(0xffffff, 1);
spotLight.position.set(0, 2, 3);
scene.add(spotLight);

// Create grid helper
const gridHelper = new THREE.GridHelper(200, 50);
scene.add(gridHelper);

const bodyGroup = new THREE.Group();
bodyGroup.position.set(-200, 0, 0);
scene.add(bodyGroup);
const bodyMap = {};

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(100, 200, 300);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
//set position to eye level
controls.target.set(0, 100, 0);

controls.update();

// Load FBX model
let model;
const loader = new FBXLoader();
loader.load("xbot.fbx", function (object) {
  model = object;
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  scene.add(object);
});

let count = 0;
function setupWebSocket() {
  const ws = new WebSocket("ws://localhost:8080");
  let retries = 0;
  const maxRetries = 10;
  const maxDelay = 10000;

  ws.onopen = () => {
    console.log("connected");
  };

  ws.onmessage = (event) => {
    if (!model) {
      return;
    }
    const message = JSON.parse(event.data);
    const boneScale = options.boneScale;
    const posScale = options.posScale;

    if (message.type === "position") {
      const relativeData = calculateRelativeBones(message);
      for (const [rokokoBoneName, modelBoneName] of Object.entries(BONE_MAP)) {
        const modelBone = model.getObjectByName(modelBoneName);
        // const rokokoBone = message[rokokoBoneName];
        // const modelBone = model.getObjectByName(modelBoneName);

        if (modelBone) {
          const absPos = message[rokokoBoneName].position;
          const absRot = message[rokokoBoneName].rotation;
          const relPos = relativeData[rokokoBoneName].position;
          const relRot = relativeData[rokokoBoneName].rotation;
          //   if (["hip", "spine", "chest"].includes(rokokoBoneName)) {
          //     count++;
          //     if (count < 100) {
          //       console.log(rokokoBoneName, initialPos, absPos);
          //     }
          //   }

          //   modelBone.position.set(absPos.x * boneScale, absPos.y * boneScale, absPos.z * boneScale);
          modelBone.quaternion.set(relRot.x, relRot.y, relRot.z, relRot.w);

          if (!bodyMap[rokokoBoneName]) {
            const geometry = new THREE.SphereGeometry(5, 32, 32);
            const material = new THREE.MeshStandardMaterial({
              color: 0xffff00,
            });
            const sphere = new THREE.Mesh(geometry, material);
            sphere.castShadow = true;
            sphere.receiveShadow = true;
            scene.add(sphere);
            bodyMap[rokokoBoneName] = sphere;
          }
          bodyMap[rokokoBoneName].position.set(absPos.x * posScale, absPos.y * posScale, absPos.z * posScale);
        }
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
    console.error("WebSocket encountered error: ", err.message, "Closing socket");
    ws.close();
  };
}

setupWebSocket();

function animate() {
  requestAnimationFrame(animate);

  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;

  renderer.render(scene, camera);
}

function resizeRendererToDisplaySize(renderer) {
  const canvas = renderer.domElement;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
  }
  return needResize;
}

function render() {
  if (resizeRendererToDisplaySize(renderer)) {
    const canvas = renderer.domElement;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }

  const delta = clock.getDelta();

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

render();
