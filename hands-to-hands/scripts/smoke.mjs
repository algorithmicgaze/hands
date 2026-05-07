import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const httpPort = 3199;
const oscPort = 18999;
const replayFile = path.resolve(root, "../realtime/demo_data/hands-3-playing-minimal.fbx");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server did not start")), 8000);
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      if (text.includes(`UI http://localhost:${httpPort}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on("exit", (code) => reject(new Error(`server exited before smoke test, code ${code}`)));
  });
}

async function expectContentType(url, expected) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes(expected)) {
    throw new Error(`${url} expected ${expected}, got ${contentType || "<empty>"}`);
  }
}

function expectFbxReplayFrame() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${httpPort}`);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("no FBX replay frame received"));
    }, 8000);
    ws.on("message", (data) => {
      const message = JSON.parse(data);
      if (message.type === "frame" && message.source === "fbx-replay" && message.pose) {
        clearTimeout(timeout);
        ws.close();
        resolve(message);
      }
    });
    ws.on("error", reject);
  });
}

const child = spawn(
  process.execPath,
  [
    "server.js",
    "--http-port",
    String(httpPort),
    "--osc-port",
    String(oscPort),
    "--mqtt-url",
    "mqtt://127.0.0.1:9",
    "--replay-fbx",
    replayFile,
    "--replay-fps",
    "120",
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);

try {
  await waitForServer(child);
  await wait(250);
  await expectContentType(`http://127.0.0.1:${httpPort}/`, "text/html");
  await expectContentType(`http://127.0.0.1:${httpPort}/render_absolute.js`, "text/javascript");
  await expectContentType(
    `http://127.0.0.1:${httpPort}/third_party/three-0.161.0/build/three.module.js`,
    "text/javascript",
  );
  const frame = await expectFbxReplayFrame();
  console.log(`smoke ok: ${frame.source} pose=${Object.keys(frame.pose).length} pattern=${frame.pattern}`);
} finally {
  child.kill("SIGTERM");
}
