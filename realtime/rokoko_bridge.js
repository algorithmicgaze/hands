const dgram = require("node:dgram");
const lz4js = require("lz4js");
const osc = require("osc");

// Configuration
const OSC_ADDRESS = "localhost";
const OSC_PORT = 8000;
const UDP_PORT = 14043;

// OSC Client setup
const oscPort = new osc.UDPPort({
  localAddress: "0.0.0.0",
  localPort: 57121,
  remoteAddress: OSC_ADDRESS,
  remotePort: OSC_PORT,
  metadata: true,
});

function startUDPListener(port) {
  const server = dgram.createSocket("udp4");

  server.on("error", (err) => {
    console.log(`server error:\n${err.stack}`);
    server.close();
  });

  server.on("message", (data, rinfo) => {
    try {
      const decodedBlock = Buffer.from(lz4js.decompress(data));
      const blockString = decodedBlock.toString("utf-8");
      const jsonData = JSON.parse(blockString);

      // Filter for finger tips of the first actor
      if (jsonData.scene && jsonData.scene.actors && jsonData.scene.actors.length > 0) {
        const firstActor = jsonData.scene.actors[0];

        if (firstActor.body && firstActor.body.leftHand && firstActor.body.rightHand) {
          const fingerTips = {
            timestamp: jsonData.timestamp || Date.now(),
            leftHand: {
              thumb: firstActor.body.leftHand.thumbTip,
              index: firstActor.body.leftHand.indexTip,
              middle: firstActor.body.leftHand.middleTip,
              ring: firstActor.body.leftHand.ringTip,
              pinky: firstActor.body.leftHand.pinkyTip,
            },
            rightHand: {
              thumb: firstActor.body.rightHand.thumbTip,
              index: firstActor.body.rightHand.indexTip,
              middle: firstActor.body.rightHand.middleTip,
              ring: firstActor.body.rightHand.ringTip,
              pinky: firstActor.body.rightHand.pinkyTip,
            },
          };

          // Send OSC messages for each finger tip
          Object.keys(fingerTips.leftHand).forEach((finger) => {
            const pos = fingerTips.leftHand[finger]?.position;
            if (pos) {
              oscPort.send({
                address: `/hands/left/${finger}`,
                args: [
                  { type: "f", value: pos.x || 0 },
                  { type: "f", value: pos.y || 0 },
                  { type: "f", value: pos.z || 0 },
                ],
              });
            }
          });

          Object.keys(fingerTips.rightHand).forEach((finger) => {
            const pos = fingerTips.rightHand[finger]?.position;
            if (pos) {
              oscPort.send({
                address: `/hands/right/${finger}`,
                args: [
                  { type: "f", value: pos.x || 0 },
                  { type: "f", value: pos.y || 0 },
                  { type: "f", value: pos.z || 0 },
                ],
              });
            }
          });
        }
      }
    } catch (error) {
      console.error("Error processing Rokoko data:", error);
    }
  });

  server.on("listening", () => {
    const address = server.address();
    console.log(`UDP listening ${address.address}:${address.port}`);
    console.log(`OSC output: ${OSC_ADDRESS}:${OSC_PORT}`);
  });

  server.bind(port);
}

// Open the OSC port
oscPort.open();

console.log("Rokoko to OSC Bridge starting...");
startUDPListener(UDP_PORT);
