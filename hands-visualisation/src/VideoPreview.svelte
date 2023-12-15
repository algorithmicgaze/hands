<script>
  import {
    frameIndex,
    frameStart,
    frameEnd,
    frameUpdateTriggeredByUser,
    isPlaying,
  } from "./stores";
  import { onMount } from "svelte";
  import { mocapFrameToVideoTime } from "./math";
  let videoElement;
  export let src = "";
  export let mocapFrameOffset = 0;
  export let videoFps = 25;
  export let mocapFps = 30;
  let prevPlaying = undefined;

  $: {
    if (videoElement) {
      if ($frameUpdateTriggeredByUser) {
        videoElement.currentTime = mocapFrameToVideoTime(
          $frameIndex,
          mocapFrameOffset
        );
      }

      if ($isPlaying && prevPlaying !== $isPlaying) {
        videoElement.play();
        prevPlaying = $isPlaying;
      } else if (!$isPlaying && prevPlaying !== $isPlaying) {
        videoElement.pause();
        prevPlaying = $isPlaying;
      }
    }

    // cacheGraphData(drawMode);
    // draw($frameIndex, $frameStart, $frameEnd);
  }

  onMount(() => {
    videoElement.addEventListener("timeupdate", () => {
      frameUpdateTriggeredByUser.set(false);
      frameIndex.set(
        Math.floor(
          (videoElement.currentTime - mocapFrameOffset / videoFps) * mocapFps
        )
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
