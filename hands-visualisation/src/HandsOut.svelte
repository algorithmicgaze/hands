<script>
  import mqtt from "mqtt";
  import { onMount } from "svelte";
  import { frameIndex, isPlaying } from "./stores";

  export let data;

  let client;
  let connected = false;
  let handPattern = Array(10).fill(false);
  // send once per second
  let sendRate = 1000;
  let prevPacketTime = 0;

  onMount(() => {
    console.log(mqtt);
    client = mqtt.connect(
      "wss://lieme:x7iNJWfycxrdEz51@lieme.cloud.shiftr.io",
      {
        clientId: "hands_visualizer",
      }
    );
    client.on("connect", () => {
      connected = true;
    });
    requestAnimationFrame(update);
  });

  function update() {
    if ($isPlaying) {
      handPattern[0] = boneTrigger("LeftFinger5Proximal");
      handPattern[1] = boneTrigger("LeftFinger4Proximal");
      handPattern[2] = boneTrigger("LeftFinger3Proximal");
      handPattern[3] = boneTrigger("LeftFinger2Proximal");
      handPattern[4] = 0; // boneTrigger("LeftFinger1Proximal");

      handPattern[5] = 0; // boneTrigger("RightFinger1Proximal");
      handPattern[6] = boneTrigger("RightFinger2Proximal");
      handPattern[7] = boneTrigger("RightFinger3Proximal");
      handPattern[8] = boneTrigger("RightFinger4Proximal");
      handPattern[9] = boneTrigger("RightFinger5Proximal");

      if (Date.now() - prevPacketTime > sendRate) {
        prevPacketTime = Date.now();
        let handString = handPattern.map((finger) => (finger ? 1 : 0)).join("");
        if (connected) {
          client.publish("hands", handString);
        }
      }
    } else {
      handPattern = Array(10).fill(false);
      if (Date.now() - prevPacketTime > sendRate) {
        prevPacketTime = Date.now();
        if (connected) {
          client.publish("hands", "0000000000");
        }
      }
    }
    requestAnimationFrame(update);
  }

  function boneTrigger(bone) {
    let boneData = data.find((d) => d.name === bone);

    // Calculate the average magnitude of the past 10 frames
    const n = 15;
    let magSum = 0;
    let samples = 0;
    for (let i = 0; i < n; i++) {
      let frameData = boneData.frames[$frameIndex - i];
      if (frameData) {
        magSum +=
          frameData.rotation[0] ** 2 +
          frameData.rotation[1] ** 2 +
          frameData.rotation[2] ** 2;
        samples += 1;
      }
    }
    let magAvg = magSum / samples;

    let frameData = boneData.frames[$frameIndex];
    let mag =
      frameData.rotation[0] ** 2 +
      frameData.rotation[1] ** 2 +
      frameData.rotation[2] ** 2;

    let delta = Math.abs(mag - magAvg);
    if (bone === "RightFinger2Proximal") {
      console.log(bone, delta);
    }

    return delta > 50;
  }
</script>

<div class="hands-out">
  {#each handPattern as finger}
    <div class="finger" style="background-color: {finger ? 'red' : 'black'}" />
  {/each}
</div>

<style>
  .hands-out {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100px;
    height: 30px;
    background-color: black;
    display: flex;
    justify-content: space-between;
    gap: 4px;
  }
  .finger {
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 2px;
    background-color: black;
    border: 1px solid #222;
  }
  .finger:nth-child(5) {
    margin-right: 4px;
  }
</style>
