<script>
  import { onMount } from "svelte";
  import { frameIndex, frameStart, frameEnd } from "./stores";
  import { mapValue } from "./math";

  export let data;
  export let bone;

  let canvasElement;
  let ctx;
  let tooltipFrame;
  let tooltipValue;
  let tooltipVisible;
  let tooltipX;
  let graphMin = Infinity,
    graphMax = -Infinity;

  onMount(() => {
    ctx = canvasElement.getContext("2d");
    let boneData = data.find((d) => d.name === bone);
    for (let i = 0; i < boneData.frames.length; i++) {
      let frameData = boneData.frames[i];
      let rx = frameData.rotation[0];
      let ry = frameData.rotation[1];
      let rz = frameData.rotation[2];
      graphMin = Math.min(graphMin, rx, ry, rz);
      graphMax = Math.max(graphMax, rx, ry, rz);
    }
    graphMin -= 10;
    graphMax += 10;
    draw($frameIndex, $frameStart, $frameEnd);
  });

  /**
   * @param {number} frameIndex
   * @param {number} frameStart
   * @param {number} frameEnd
   */
  function draw(frameIndex, frameStart, frameEnd) {
    if (!canvasElement) return;
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    drawZoomed(frameIndex, frameStart, frameEnd);
  }

  /**
   * @param {number} frameIndex
   * @param {number} frameStart
   * @param {number} frameEnd
   */
  function drawZoomed(frameIndex, frameStart, frameEnd) {
    let boneData = data.find((d) => d.name === bone);
    // Draw the zoomed in portion of the timeline
    let xValues = [];
    let yValues = [];
    let zValues = [];
    ctx.fillStyle = "black";

    // let xChannel = `${bone}_Xrotation`;
    // let yChannel = `${bone}_Yrotation`;
    // let zChannel = `${bone}_Zrotation`;

    for (let x = 0; x < canvasElement.width; x++) {
      let frame = Math.floor(
        frameStart + (frameEnd - frameStart) * (x / canvasElement.width)
      );
      let frameData = boneData.frames[frame];
      xValues.push(frameData.rotation[0]);
      yValues.push(frameData.rotation[1]);
      zValues.push(frameData.rotation[2]);
    }
    // Find the min/max of vals
    // let min = Math.min(...xValues, ...yValues, ...zValues) - 10;
    // let max = Math.max(...xValues, ...yValues, ...zValues) + 10;
    // let min = Math.min(...zValues) - 10;
    // let max = Math.max(...zValues) + 10;

    // Draw all channels
    drawChannel(xValues, graphMin, graphMax, "#FFB6C1");
    drawChannel(yValues, graphMin, graphMax, "#F0E68C");
    drawChannel(zValues, graphMin, graphMax, "#ADD8E6");

    //ctx.fillStyle = "black";
    // ctx.strokeStyle("red");
    // ctx.beginPath();
    // for (let x = 0; x < canvasElement.width; x++) {
    //   let y = mapValue(vals[x], min, max, 0, canvasElement.height);
    //   if (x === 0) {
    //     ctx.moveTo(x, y);
    //   } else {
    //     ctx.lineTo(x, y);
    //   }
    // }
    // ctx.stroke();

    // for (let x = 0; x < canvasElement.width; x++) {
    //   let frame = Math.floor(
    //     frameStart + (frameEnd - frameStart) * (x / canvasElement.width)
    //   );
    //   let y = parseFloat(data[frame][channel]);
    //   vals.push(y);
    //   y = mapValue(y, min, max, canvasElement.height, 0);
    //   ctx.fillRect(x, 20 + y, 1, 1);
    // }

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

  /**
   * @param {any[]} values
   * @param {number} min
   * @param {number} max
   * @param {string} strokeStyle
   */
  function drawChannel(values, min, max, strokeStyle) {
    // debugger;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < canvasElement.width; x++) {
      let y = mapValue(values[x], min, max, 0, canvasElement.height);
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  /**
   * @param {any} e
   */
  function onMouseMove(e) {
    showTooltip(e);
    //   let frame = Math.floor($frameStart + (windowWidth * e.offsetX) / 1000);

    //   // let frame = Math.floor(e.offsetX / );
    //   let xValue = parseFloat(data[frame][`${bone}_Xrotation`]);
    //   let yValue = parseFloat(data[frame][`${bone}_Yrotation`]);
    //   let zValue = parseFloat(data[frame][`${bone}_Zrotation`]);
    //   tooltipFrame = frame;
    //   tooltipValue = tooltipValue = `X ${xValue.toFixed(2)}, Y ${yValue.toFixed(
    //     2
    //   )}, Z ${zValue.toFixed(2)}`;
    //   tooltipX = e.offsetX;
    //   frameIndex.set(frame);
  }

  /**
   * @param {{ offsetX: number; }} e
   */
  function showTooltip(e) {
    tooltipVisible = true;
    let windowWidth = $frameEnd - $frameStart;
    let frameWidth = windowWidth / 1000;
    let frame = Math.floor($frameStart + (windowWidth * e.offsetX) / 1000);

    let boneData = data.find((d) => d.name === bone);
    let frameData = boneData.frames[frame];

    let xValue = frameData.rotation[0];
    let yValue = frameData.rotation[1];
    let zValue = frameData.rotation[2];
    tooltipFrame = frame;
    tooltipValue = `X ${xValue.toFixed(2)}, Y ${yValue.toFixed(
      2
    )}, Z ${zValue.toFixed(2)}`;
    tooltipX = e.offsetX;
    frameIndex.set(frame);
  }

  /**
   * @param {any} e
   */
  function hideTooltip(e) {
    tooltipVisible = false;
  }

  $: {
    draw($frameIndex, $frameStart, $frameEnd);
  }
</script>

<div class="graph">
  <h2>{bone}</h2>
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
    top: -30px;
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
