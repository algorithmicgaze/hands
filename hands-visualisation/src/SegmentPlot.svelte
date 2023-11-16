<script>
  import { onMount } from "svelte";
  import { frameIndex, frameStart, frameEnd } from "./stores";
  import { mapValue } from "./math";

  export let segments;

  let canvasElement;
  let ctx;

  onMount(() => {
    ctx = canvasElement.getContext("2d");
    draw($frameIndex, $frameStart, $frameEnd);
  });

  function draw(frameIndex, frameStart, frameEnd) {
    if (!canvasElement) return;
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    drawZoomed(frameIndex, frameStart, frameEnd);
  }

  function drawZoomed(frameIndex, frameStart, frameEnd) {
    ctx.strokeStyle = "red";
    ctx.lineWidth = 5;
    ctx.beginPath();

    for (let [start, end] of segments) {
      start = start * 30;
      end = end * 30;
      let x1 = mapValue(start, frameStart, frameEnd, 0, canvasElement.width);
      let x2 = mapValue(end, frameStart, frameEnd, 0, canvasElement.width);
      ctx.moveTo(x1, canvasElement.height / 2);
      ctx.lineTo(x2, canvasElement.height / 2);
    }
    ctx.stroke();
  }

  $: {
    draw($frameIndex, $frameStart, $frameEnd);
  }
</script>

<div class="graph">
  <canvas width="1000" height="100" bind:this={canvasElement} />
</div>

<style>
  div.graph {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
</style>
