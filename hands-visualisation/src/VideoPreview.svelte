<script>
  import { frameIndex, frameStart, frameEnd } from "./stores";
  import { mapValue } from "./math";
  let videoElement;
  export let src = "";
  export let offset = 0;
  export let fps = 25;

  $: {
    if (videoElement) {
      videoElement.currentTime = $frameIndex / 30 + offset / fps;
    }
    // cacheGraphData(drawMode);
    // draw($frameIndex, $frameStart, $frameEnd);
  }
</script>

<div class="wrapper">
  <video {src} bind:this={videoElement} />
</div>

<style>
  .wrapper {
    position: fixed;
    top: 0;
    right: 0;
  }

  video {
    width: auto;
    height: 200px;
  }
</style>
