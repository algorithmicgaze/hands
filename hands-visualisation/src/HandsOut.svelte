<script>
  import mqtt from "mqtt";
  import { onMount } from "svelte";
  import { frameIndex, isPlaying } from "./stores";

  export let scene;

  let client;
  let connected = false;
  let handPattern = Array(10).fill(false);
  // send once per second
  let sendRate = 1000;
  let prevPacketTime = 0;
  let prevPacket = "";

  onMount(() => {
    client = mqtt.connect(
      "wss://algorithmicgaze:a5U1U292uh62c8uh@algorithmicgaze.cloud.shiftr.io",
      {
        clientId: "hands-web",
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
    } else {
      handPattern = Array(10).fill(false);
    }

    let handString = handPattern.map((finger) => (finger ? 1 : 0)).join("");
    if (handString !== prevPacket) {
      if (connected) {
        client.publish("hands", handString);
      }
      prevPacket = handString;
    }

    requestAnimationFrame(update);
  }

  function boneTrigger(bone) {
    // The bone needs to be triggered when we're at the start of an event.
    const events = scene.eventMap[bone];
    const thisFrameIsInEvent = frameIsInEvent(events, $frameIndex);
    const prevFrameIsInEvent = frameIsInEvent(events, $frameIndex - 5);
    if (thisFrameIsInEvent && !prevFrameIsInEvent) {
      return 1;
    } else {
      return 0;
    }
  }

  function frameIsInEvent(events, frameIndex) {
    for (let [start, end] of events) {
      if (frameIndex >= start && frameIndex <= end) {
        return true;
      }
    }
    return false;
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
