<script>
  import {
    frameIndex,
    frameStart,
    frameEnd,
    frameUpdateTriggeredByUser,
    isPlaying,
  } from "./stores";
  import { onMount } from "svelte";
  import { mocapFrameToVideoTime, videoTimeToMocapFrame } from "./math";
  let videoElement;
  export let src = "";
  export let mocapFrameOffset = 0;
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
    window.requestAnimationFrame(updateTime);
  });

  function updateTime() {
    // if ($isPlaying) {
    frameUpdateTriggeredByUser.set(false);

    frameIndex.set(
      videoTimeToMocapFrame(videoElement.currentTime, mocapFrameOffset)
    );
    requestAnimationFrame(updateTime);
  }
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
