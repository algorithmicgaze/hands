<script>
  import { onMount } from "svelte";
  import {
    frameIndex,
    frameStart,
    frameEnd,
    frameUpdateTriggeredByUser,
  } from "./stores";
  import { mapValue } from "./math";

  export let scene;
  export let bone;
  export let drawMode;

  let canvasElement;
  let ctx;
  let tooltipTime;
  let tooltipFrame;
  let tooltipXYZ;
  let tooltipMagnitude;
  let tooltipVisible;
  let tooltipX;
  let graphMin = Infinity,
    graphMax = -Infinity;
  // Data of the graphed channels, channel-first (so [rotationIndex][frameIndex])
  let channelData;

  onMount(() => {
    ctx = canvasElement.getContext("2d");
    cacheGraphData("xyz");
    draw($frameIndex, $frameStart, $frameEnd);
  });

  function cacheGraphData(drawMode) {
    let boneData = scene.data.find((d) => d.name === bone);
    channelData = [];
    let frameData = [];
    graphMin = Infinity;
    graphMax = -Infinity;
    let n = 15; // half a second (30fps / 2)
    let movingAverageQueue = [];
    if (drawMode === "xyz") {
      const xs = boneData.frames.map((f) => f.rotation[0]);
      const ys = boneData.frames.map((f) => f.rotation[1]);
      const zs = boneData.frames.map((f) => f.rotation[2]);
      channelData = [xs, ys, zs];
      for (let i = 0; i < boneData.frames.length; i++) {
        let rx = xs[i];
        let ry = ys[i];
        let rz = zs[i];
        if (i >= scene.frameStart && i <= scene.frameEnd) {
          graphMin = Math.min(graphMin, rx, ry, rz);
          graphMax = Math.max(graphMax, rx, ry, rz);
        }
      }
      graphMin -= 10;
      graphMax += 10;
    } else if (drawMode === "magnitude") {
      let boneData = scene.data.find((d) => d.name === bone);
      let mags = [];
      channelData = [mags];
      for (let i = 0; i < boneData.frames.length; i++) {
        let frameData = boneData.frames[i];
        let mag =
          frameData.rotation[0] * frameData.rotation[0] +
          frameData.rotation[1] * frameData.rotation[1] +
          frameData.rotation[2] * frameData.rotation[2];
        mags.push(mag);
        if (i >= scene.frameStart && i <= scene.frameEnd) {
          graphMin = Math.min(graphMin, mag);
          graphMax = Math.max(graphMax, mag);
        }
      }
    } else if (drawMode === "rate-of-change") {
      let boneData = scene.data.find((d) => d.name === bone);
      let deltas = [];
      channelData = [deltas];
      for (let i = 0; i < boneData.frames.length; i++) {
        let frameData = boneData.frames[i];
        let prevFrameData = boneData.frames[i - 1];
        if (!prevFrameData) {
          deltas.push(0);
          continue;
        }
        let mag =
          frameData.rotation[0] * frameData.rotation[0] +
          frameData.rotation[1] * frameData.rotation[1] +
          frameData.rotation[2] * frameData.rotation[2];

        // Update the moving average queue
        movingAverageQueue.push(mag);
        if (movingAverageQueue.length > n) {
          movingAverageQueue.shift();
        }

        // Calculate moving average
        let movingAverage =
          movingAverageQueue.reduce((a, b) => a + b, 0) /
          movingAverageQueue.length;

        // Compare current magnitude with moving average
        let delta = mag - movingAverage;
        deltas.push(delta);
        if (i >= scene.frameStart && i <= scene.frameEnd) {
          graphMin = Math.min(graphMin, delta);
          graphMax = Math.max(graphMax, delta);
        }

        // let prevMag =
        //   prevFrameData.rotation[0] * prevFrameData.rotation[0] +
        //   prevFrameData.rotation[1] * prevFrameData.rotation[1] +
        //   prevFrameData.rotation[2] * prevFrameData.rotation[2];
        // let delta = mag - prevMag;
        // deltas.push(delta);
        // graphMin = Math.min(graphMin, delta);
        // graphMax = Math.max(graphMax, delta);
      }
    }
  }

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
    let boneData = scene.data.find((d) => d.name === bone);
    // Draw the zoomed in portion of the timeline
    ctx.fillStyle = "black";

    // Draw all channels
    if (drawMode === "xyz") {
      drawChannel(
        channelData[0],
        frameStart,
        frameEnd,
        graphMin,
        graphMax,
        "#FFB6C1"
      );
      drawChannel(
        channelData[1],
        frameStart,
        frameEnd,
        graphMin,
        graphMax,
        "#F0E68C"
      );
      drawChannel(
        channelData[2],
        frameStart,
        frameEnd,
        graphMin,
        graphMax,
        "#ADD8E6"
      );
    } else if (drawMode === "magnitude") {
      drawChannel(
        channelData[0],
        frameStart,
        frameEnd,
        graphMin,
        graphMax,
        "#FFB6C1"
      );
    } else if (drawMode === "rate-of-change") {
      drawChannel(
        channelData[0],
        frameStart,
        frameEnd,
        graphMin,
        graphMax,
        "#FFB6C1"
      );
    }

    if (scene?.eventMap) {
      drawEvents(scene.eventMap[bone], frameStart, frameEnd);
    }

    let frameIndexPixels =
      (frameIndex - frameStart) *
      (canvasElement.width / (frameEnd - frameStart));

    // Draw frame index
    ctx.strokeStyle = "#f9423f";
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
  function drawChannel(values, frameStart, frameEnd, min, max, strokeStyle) {
    // min = Math.min(...values.slice(frameStart, frameEnd));
    // max = Math.max(...values.slice(frameStart, frameEnd));
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < canvasElement.width; x++) {
      let frame = Math.floor(
        frameStart + (frameEnd - frameStart) * (x / canvasElement.width)
      );
      let y = mapValue(values[frame], min, max, 0, canvasElement.height);
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  function drawEvents(events, plotStartFrame, plotEndFrame) {
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.3;
    for (let [startFrame, endFrame] of events) {
      if (endFrame < plotStartFrame || startFrame > plotEndFrame) continue;
      let frameStart = Math.max(startFrame, plotStartFrame);
      let frameEnd = Math.min(endFrame, plotEndFrame);
      let xStart =
        ((frameStart - plotStartFrame) * canvasElement.width) /
        (plotEndFrame - plotStartFrame);
      let xEnd =
        ((frameEnd - plotStartFrame) * canvasElement.width) /
        (plotEndFrame - plotStartFrame);
      ctx.fillRect(xStart, 0, xEnd - xStart, canvasElement.height);
    }
    ctx.globalAlpha = 1;
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
   * @param {number} time
   */
  function padTime(time) {
    return time < 10 ? `0${time}` : time;
  }

  /**
   * @param {{ offsetX: number; }} e
   */
  function showTooltip(e) {
    tooltipVisible = true;
    let windowWidth = $frameEnd - $frameStart;
    let frameWidth = windowWidth / 1000;
    let frame = Math.floor($frameStart + (windowWidth * e.offsetX) / 1000);

    let boneData = scene.data.find((d) => d.name === bone);
    let frameData = boneData.frames[frame];
    let prevFrameData = boneData.frames[frame - 1];

    let xValue = frameData.rotation[0];
    let yValue = frameData.rotation[1];
    let zValue = frameData.rotation[2];
    let magnitude = xValue * xValue + yValue * yValue + zValue * zValue;

    let prevXValue = prevFrameData ? prevFrameData.rotation[0] : xValue;
    let prevYValue = prevFrameData ? prevFrameData.rotation[1] : yValue;
    let prevZValue = prevFrameData ? prevFrameData.rotation[2] : zValue;
    let prevMagnitude =
      prevXValue * prevXValue +
      prevYValue * prevYValue +
      prevZValue * prevZValue;
    let rateOfChange = scene.rosMap[bone][frame];

    let offsetFrame = frame + scene.mocapFrameOffset;
    let frameHours = padTime(Math.floor(offsetFrame / 30 / 60 / 60) + 1); // + 1 to be compatible with the Davinci Resolve timecode
    let frameMinutes = padTime(Math.floor((offsetFrame / 30 / 60) % 60));
    let frameSeconds = padTime(Math.floor((offsetFrame / 30) % 60));
    let frameFrame = padTime(Math.floor(offsetFrame % 30));

    tooltipTime = `${frameHours}:${frameMinutes}:${frameSeconds}:${frameFrame}`;
    tooltipFrame = frame;
    tooltipXYZ = `X ${xValue.toFixed(2)} Y ${yValue.toFixed(
      2
    )} Z ${zValue.toFixed(2)}`;

    tooltipMagnitude = `MAG ${magnitude.toFixed(0)} Δ${rateOfChange.toFixed(
      0
    )}`;

    tooltipX = e.offsetX;
    // frameUpdateTriggeredByUser.set(true);
    // frameIndex.set(frame);
  }

  /**
   * @param {any} e
   */
  function hideTooltip(e) {
    tooltipVisible = false;
  }

  $: {
    cacheGraphData(drawMode);
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
    <span class="tooltip__frame">{tooltipTime} {tooltipFrame}</span>
    <span class="tooltip__value">{tooltipXYZ}</span>
    <span class="tooltip__value">{tooltipMagnitude}</span>
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
    z-index: 9999;
  }

  .tooltip__value {
    white-space: nowrap;
  }

  .tooltip.visible {
    opacity: 1;
  }
</style>
