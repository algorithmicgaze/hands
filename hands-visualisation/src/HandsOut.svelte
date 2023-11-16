<script>
  import mqtt from "mqtt";
  import { onMount } from "svelte";
  import {
    frameIndex,
    frameStart,
    frameEnd,
    frameUpdateTriggeredByUser,
    isPlaying,
  } from "./stores";

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
        clientId: "hands_data_web",
      }
    );
    client.on("connect", () => {
      connected = true;
    });
    requestAnimationFrame(update);
  });

  function update() {
    if (connected && $isPlaying) {
      handPattern[0] = boneTrigger("LeftFinger5Proximal");
      handPattern[1] = boneTrigger("LeftFinger4Proximal");
      handPattern[2] = boneTrigger("LeftFinger3Proximal");
      handPattern[3] = boneTrigger("LeftFinger2Proximal");
      handPattern[4] = boneTrigger("LeftFinger1Proximal");

      handPattern[5] = boneTrigger("RightFinger1Proximal");
      handPattern[6] = boneTrigger("RightFinger2Proximal");
      handPattern[7] = boneTrigger("RightFinger3Proximal");
      handPattern[8] = boneTrigger("RightFinger4Proximal");
      handPattern[9] = boneTrigger("RightFinger5Proximal");

      if (Date.now() - prevPacketTime > sendRate) {
        prevPacketTime = Date.now();
        let handString = handPattern.map((finger) => (finger ? 1 : 0)).join("");
        client.publish("hands", handString);
      }
    } else if (connected) {
      if (Date.now() - prevPacketTime > sendRate) {
        prevPacketTime = Date.now();
        client.publish("hands", "0000000000");
      }
    }
    requestAnimationFrame(update);
  }

  function boneTrigger(bone) {
    let boneData = data.find((d) => d.name === bone);
    let frameData = boneData.frames[$frameIndex];
    let mag =
      frameData.rotation[0] ** 2 +
      frameData.rotation[1] ** 2 +
      frameData.rotation[2] ** 2;
    console.log(bone, mag);
    return mag > 1000;
  }

  //   $: {
  //     if (connected) {
  //       let handString = handPattern.map((finger) => (finger ? 1 : 0)).join("");
  //       client.publish("hands", handString);
  //     }
  //     if (!isPlaying) {
  //       client.publish("hands", "0000000000");
  //     }
  //   }
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
</style>
