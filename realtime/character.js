import * as THREE from "https://esm.sh/three@0.164.1";
import { OrbitControls } from "https://esm.sh/three@0.164.1/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "https://esm.sh/three@0.164.1/examples/jsm/loaders/FBXLoader.js";

const BONE_MAP = {
    "hip": "mixamorigHips",
    "spine": "mixamorigSpine",
    "chest": "mixamorigSpine1",
    "neck": "mixamorigNeck",
    "head": "mixamorigHead",
    "leftShoulder": "mixamorigLeftShoulder",
    "leftUpperArm": "mixamorigLeftArm",
    "leftLowerArm": "mixamorigLeftForeArm",
    "leftHand": "mixamorigLeftHand",
    "rightShoulder": "mixamorigRightShoulder",
    "rightUpperArm": "mixamorigRightArm",
    "rightLowerArm": "mixamorigRightForeArm",
    "rightHand": "mixamorigRightHand",
    "leftUpLeg": "mixamorigLeftUpLeg",
    "leftLeg": "mixamorigLeftLeg",
    "leftFoot": "mixamorigLeftFoot",
    "leftToe": "mixamorigLeftToeBase",
    "leftToeEnd": "mixamorigLeftToe_End",
    "rightUpLeg": "mixamorigRightUpLeg",
    "rightLeg": "mixamorigRightLeg",
    "rightFoot": "mixamorigRightFoot",
    "rightToe": "mixamorigRightToeBase",
    "rightToeEnd": "mixamorigRightToe_End",
}



const clock = new THREE.Clock();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa0a0a0);
scene.fog = new THREE.Fog(0xa0a0a0, 200, 1000);
// Create cube
const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
cube.position.set(2.0, 0.5, 0.0);
scene.add(cube);

// Create floor
const mesh = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshPhongMaterial({ color: 0x999999, depthWrite: false }),
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

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
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
let model, mixer;
const loader = new FBXLoader();
loader.load(
  "https://threejs.org/examples/models/fbx/Samba Dancing.fbx",
  function (object) {
    model = object;
    // mixer = new THREE.AnimationMixer(object);
    // const action = mixer.clipAction(object.animations[0]);
    // action.play();
    object.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // object.scale.set(0.01, 0.01, 0.01);
    scene.add(object);
  },
);

function setupWebSocket() {
    const ws = new WebSocket("ws://localhost:8080");
    let retries = 0;
    const maxRetries = 10;
    const maxDelay = 10000;
  
    ws.onopen = () => {
      console.log("connected");
    };
  
    const scale = 10;
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log(message);
  
      if (message.type === "position") {
        for (const [rokokoBoneName, modelBoneName] of Object.entries(BONE_MAP)) {
            const rokokoBone = message[rokokoBoneName];
            const modelBone = model.getObjectByName(modelBoneName);
            if (modelBone) {
                modelBone.position.set(rokokoBone.position.x * scale, rokokoBone.position.y * scale, rokokoBone.position.z * scale);
                modelBone.quaternion.set(rokokoBone.rotation.x, rokokoBone.rotation.y, rokokoBone.rotation.z, rokokoBone.rotation.w);
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
      console.error(
        "WebSocket encountered error: ",
        err.message,
        "Closing socket"
      );
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
  if (mixer) mixer.update(delta);

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

render();
