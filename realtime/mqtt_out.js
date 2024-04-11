class MqttOut {
  constructor() {
    this.connected = false;
    this.client = mqtt.connect(
      "wss://algorithmicgaze:a5U1U292uh62c8uh@algorithmicgaze.cloud.shiftr.io",
      //   "ws://localhost:9001/mqtt",
      {
        clientId: "hands-realtime",
      }
    );
    this.handPattern = Array(10).fill(false);
    this.prevPacket = "";

    this.client.on("connect", () => {
      this.connected = true;
    });
  }

  sendPattern(handPattern) {
    let handString = handPattern.map((finger) => (finger ? 1 : 0)).join("");
    if (this.connected && handString !== this.prevPacket) {
      console.log(handString);
      this.client.publish("hands", handString);
      this.prevPacket = handString;
    }
  }
}

window.MqttOut = MqttOut;
