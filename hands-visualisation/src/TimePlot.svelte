<script>
  import { onMount } from "svelte";
  import { frameIndex, frameStart, frameEnd } from "./stores";
  import { mapValue } from "./math";

  export let data;
  export let min;
  export let max;

  export let channel;
  let canvasElement;
  let ctx;
  let tooltipFrame;
  let tooltipValue;
  let tooltipVisible;
  let tooltipX;

  onMount(() => {
    ctx = canvasElement.getContext("2d");
    draw($frameIndex, $frameStart, $frameEnd);
  });

  function draw(frameIndex, frameStart, frameEnd) {
    if (!canvasElement) return;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    drawZoomed(frameIndex, frameStart, frameEnd);
  }

  function drawZoomed(frameIndex, frameStart, frameEnd) {
    // Draw the zoomed in portion of the timeline
    let vals = [];
    ctx.fillStyle = "black";

    for (let x = 0; x < canvasElement.width; x++) {
      let frame = Math.floor(
        frameStart + (frameEnd - frameStart) * (x / canvasElement.width)
      );
      let y = parseFloat(data[frame][channel]);
      vals.push(y);
      y = mapValue(y, min, max, 0, canvasElement.height);
      ctx.fillRect(x, 20 + y, 1, 1);
    }

    // Find the min/max of vals
    // let min = Math.min(...vals) - 20;
    // let max = Math.max(...vals) + 20;
    // for (let x = 0; x < canvasElement.width; x++) {
    //   let y = mapValue(vals[x], min, max, 0, canvasElement.height);
    //   ctx.fillStyle = "black";
    //   ctx.fillRect(x, 20 + y, 1, 1);
    // }

    let frameIndexPixels =
      (frameIndex - frameStart) *
      (canvasElement.width / (frameEnd - frameStart));

    // Draw frame index
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(frameIndexPixels, 0);
    ctx.lineTo(frameIndexPixels, canvasElement.height);
    ctx.stroke();
  }

  function onMouseMove(e) {
    let windowWidth = $frameEnd - $frameStart;
    let frameWidth = windowWidth / 1000;
    let frame = Math.floor($frameStart + (windowWidth * e.offsetX) / 1000);

    // let frame = Math.floor(e.offsetX / );
    let value = parseFloat(data[frame][channel]);
    tooltipFrame = frame;
    tooltipValue = value;
    tooltipX = e.offsetX;
    frameIndex.set(frame);
  }

  function showTooltip(e) {
    tooltipVisible = true;
    let frameWidth = canvasElement.width / data.length;
    let frame = Math.floor(e.offsetX / frameWidth);
    let value = parseFloat(data[frame][channel]);
    tooltipFrame = frame;
    tooltipValue = value;
  }

  function hideTooltip(e) {
    tooltipVisible = false;
  }

  $: {
    draw($frameIndex, $frameStart, $frameEnd);
  }
</script>

<div class="graph">
  <h2>{channel}</h2>
  <canvas
    width="1000"
    height="100"
    bind:this={canvasElement}
    on:mousemove={onMouseMove}
    on:mouseenter={showTooltip}
    on:mouseleave={hideTooltip}
  />
  <div
    class="tooltip"
    class:visible={tooltipVisible}
    style={`left: ${tooltipX}px`}
  >
    <span class="tooltip__frame">{tooltipFrame}</span><span
      class="tooltip__value">{tooltipValue}</span
    >
  </div>
  <div class="times">
    <div class="time">{Math.floor($frameStart)}</div>
    <div class="time">{Math.floor($frameEnd)}</div>
  </div>
</div>

<style>
  div.graph {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  h2 {
    margin: 0;
    padding: 0;
    color: #ccc;
    font-size: 11px;
  }

  div.times {
    width: 100%;
    display: flex;
    justify-content: space-between;
  }

  .tooltip {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #333;
    color: #ccc;
    font-size: 11px;
    padding: 5px;
    border-radius: 5px;
    opacity: 0;
    transition: opacity 0.2s;
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
    transform: translateX(-50%);
  }

  .tooltip.visible {
    opacity: 1;
  }
</style>
