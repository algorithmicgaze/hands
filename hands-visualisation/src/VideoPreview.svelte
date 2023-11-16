<script>
  import {
    frameIndex,
    frameStart,
    frameEnd,
    frameUpdateTriggeredByUser,
  } from "./stores";
  import { onMount } from "svelte";
  let videoElement;
  export let src = "";
  export let offset = 0;
  export let fps = 25;
  export let isPlaying = false;
  let prevPlaying = undefined;

  $: {
    if (videoElement) {
      if ($frameUpdateTriggeredByUser) {
        videoElement.currentTime = $frameIndex / 30 + offset / fps;
      }

      //   videoElement.currentTime = $frameIndex / 30 + offset / fps;

      if (isPlaying && prevPlaying !== isPlaying) {
        videoElement.play();
        prevPlaying = isPlaying;
      } else if (!isPlaying && prevPlaying !== isPlaying) {
        videoElement.pause();
        prevPlaying = isPlaying;
      }
    }

    // cacheGraphData(drawMode);
    // draw($frameIndex, $frameStart, $frameEnd);
  }

  onMount(() => {
    videoElement.addEventListener("timeupdate", () => {
      frameUpdateTriggeredByUser.set(false);
      frameIndex.set(
        Math.floor((videoElement.currentTime - offset / fps) * 30)
      );
    });
    // ctx = canvasElement.getContext("2d");
    // cacheGraphData("xyz");
    // draw($frameIndex, $frameStart, $frameEnd);
  });
</script>

<div class="wrapper">
  <video {src} bind:this={videoElement} />
</div>

<style>
  .wrapper {
    position: fixed;
    bottom: 0;
    right: 0;
    z-index: 1000;
  }

  video {
    width: auto;
    height: 300px;
  }
</style>
