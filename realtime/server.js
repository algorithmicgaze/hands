const arg = require("arg");
const readline = require("readline");
const dgram = require("node:dgram");
const WebSocket = require("ws");
const fs = require("fs");
const LZ4 = require("lz4");

class LogReader {
  constructor(filename) {
    this.filename = filename;
    this.lineOffsets = [];
    this.lineCount = 0;
  }

  async prepare() {
    let position = 0;
    const stream = fs.createReadStream(this.filename, { encoding: "utf-8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      this.lineOffsets.push(position);
      // Update position: add the length of the line plus one for the newline character
      position += Buffer.byteLength(line) + 1;
    }
    rl.close();
    stream.close();
    this.lineCount = this.lineOffsets.length;
  }

  async getChunk(lineIndex, amount = 1000) {
    return new Promise((resolve, reject) => {
      if (lineIndex >= this.lineCount) {
        reject(new Error("Line index out of bounds"));
        return;
      }

      const startPosition = this.lineOffsets[lineIndex];
      const nextLineIndex = lineIndex + amount;
      let endPosition;
      if (nextLineIndex >= this.lineCount) {
        endPosition = undefined;
      } else {
        endPosition = this.lineOffsets[nextLineIndex] - 1;
      }

      const streamOptions = {
        start: startPosition,
      };
      if (endPosition) {
        streamOptions.end = endPosition;
      }
      const stream = fs.createReadStream(this.filename, streamOptions);
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      const lines = [];
      rl.on("line", (line) => lines.push(line)).on("close", () =>
        resolve(lines)
      );
    });
  }
}

let connections = [];

function startWebSocketServer(port) {
  const wss = new WebSocket.Server({ port });

  wss.on("connection", (ws) => {
    connections.push(ws);
    ws.send(JSON.stringify({ type: "status", connected: true }));
  });

  wss.on("close", (ws) => {
    const index = connections.indexOf(ws);
    connections.splice(index, 1);
  });
}

function startUDPListener(port, logFile) {
  // Listen to events from Rokoko
  const server = dgram.createSocket("udp4");

  server.on("error", (err) => {
    console.log(`server error:\n${err.stack}`);
    server.close();
  });

  server.on("message", (data, rinfo) => {
    const decodedBlock = LZ4.decode(data);
    const blockString = decodedBlock.toString("utf-8");
    const jsonData = JSON.parse(blockString);

    // Store the data as ndjson
    if (logFile) {
      fs.appendFile(logFile, JSON.stringify(jsonData) + "\n", (err) => {
        if (err) {
          console.error(`Could not write to ${logFile}:`, err);
        }
      });
    }

    console.log(jsonData.scene.actors[0].body.hip.position);

    connections.forEach((ws) => {
      ws.send(
        JSON.stringify({
          type: "position",
          ...jsonData.scene.actors[0].body,
        })
      );
    });
  });

  server.on("listening", () => {
    const address = server.address();
    console.log(`UDP listening ${address.address}:${address.port}`);
  });

  server.bind(port);
}

async function replayChunk(reader, chunkIndex) {
  console.log(`Replaying chunk ${chunkIndex}`);
  let chunk;
  try {
    chunk = await reader.getChunk(chunkIndex, 10000);
    // If the chunk is empty, it means there are no more chunks. Reset to start.
    if (chunk.length === 0) throw new Error("No more chunks");
  } catch (e) {
    console.log("Reached the end of the file. Starting over.");
    return replayChunk(reader, 0); // Reset to the first chunk
  }

  for (let i = 0; i < chunk.length; i++) {
    let jsonData;
    try {
      jsonData = JSON.parse(chunk[i]);
    } catch (e) {
      console.error("Error parsing JSON:", e);
      continue; // Skip this iteration if JSON parsing fails
    }
    // console.log(jsonData.scene.actors[0].body.hip.position);
    connections.forEach((ws) => {
      ws.send(
        JSON.stringify({
          type: "position",
          ...jsonData.scene.actors[0].body,
        })
      );
    });

    // Wait for the next tick
    // await new Promise((resolve) => setTimeout(resolve, 1000 / 30));
    await new Promise((resolve) => setTimeout(resolve, 1));

    // Check if it's time to load a new chunk
    if (i === chunk.length - 1) {
      return replayChunk(reader, chunkIndex + 1); // Recursively load the next chunk
    }
  }
}

async function startReplay(filename) {
  const reader = new LogReader(filename);
  console.log(`Loading replay file...`);
  await reader.prepare();
  console.log(`Starting replay.`);
  await replayChunk(reader, 0);
}

const pad = (d) => (String(d).length < 2 ? `0${d}` : d);

const args = arg({
  "--replay": String, // Path to a file to replay
  "--log-dir": String, // Path to logging directory. If set, will record all Rokoko data.
  "--websocket-port": Number, // Port to run the websocket server on
  "--udp-port": Number, // Port to listen to the Rokoko data on
});

startWebSocketServer(args["--websocket-port"] || 8080);

if (args["--replay"]) {
  // In replay mode, don't listen to inputs from Rokoko, instead just play the file as if it was live data
  startReplay(args["--replay"]);
} else {
  let logFile;
  if (args["--log-dir"]) {
    const now = new Date();
    logFile = args["--log-dir"];
    logFile += `/`;
    logFile += `mocap-`;
    // prettier-ignore
    logFile += `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    logFile += `_`;
    // prettier-ignore
    logFile += `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    logFile += `.ndjson`;
  }
  startUDPListener(args["--udp-port"] || 14043, logFile);
}
