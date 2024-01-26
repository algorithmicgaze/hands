const dgram = require("node:dgram");
const WebSocket = require("ws");
const fs = require("fs");
const LZ4 = require("lz4");
const Buffer = require("buffer").Buffer;

const wss = new WebSocket.Server({ port: 8080 });
const connections = [];

wss.on("connection", (ws) => {
  connections.push(ws);
  ws.send(JSON.stringify({ type: "status", connected: true }));
  // generate random data every 1 second
  //   setInterval(() => {
  //     const data = Math.random() * 1000;
  //     ws.send(data);
  //   }, 1000);
});

wss.on("close", (ws) => {
  const index = connections.indexOf(ws);
  connections.splice(index, 1);
});

// Listen to events from Rokoko
const server = dgram.createSocket("udp4");

server.on("error", (err) => {
  console.log(`server error:\n${err.stack}`);
  server.close();
});

let first = true;

server.on("message", (data, rinfo) => {
  // console.log(`server got: ${data} from ${rinfo.address}:${rinfo.port}`);

  // var uncompressed = Buffer.alloc(data.length);
  // const decodedBlock = Buffer.alloc(1024 * 1024);
  const decodedBlock = LZ4.decode(data);
  // var uncompressedSize = LZ4.decodeBlock(data, decodedBlock);
  // console.log("size", uncompressedSize);
  const blockString = decodedBlock.toString("utf-8");
  // uncompressed = uncompressed.slice(0, uncompressedSize)

  const jsonData = JSON.parse(blockString);
  console.log(jsonData.scene.actors[0].body.hip.position);

  // if (first) {
  //   // console.log(blockString);
  //   console.log(Object.keys(jsonData.scene.actors[0].body));
  //   first = false;
  // }

  // fs.writeFileSync("data.json", data);
  // console.log(
  //   JSON.stringify({
  //     type: "position",
  //     hip: jsonData.scene.actors[0].body.hip,
  //   })
  // );
  // print the hip position of the first actor in the data
  // console.log(jsonData.scene.actors[0].body.hip.position);
  // send the hip position to the client
  connections.forEach((ws) => {
    ws.send(
      JSON.stringify({
        type: "position",
        ...jsonData.scene.actors[0].body,
      }),
    );
  });
});

server.on("listening", () => {
  const address = server.address();
  console.log(`server listening ${address.address}:${address.port}`);
});

server.bind(14043);
