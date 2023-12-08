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

  let dragMode;

  let canvasElement;
  let ctx;

  let frameCount = scene.data[0].frames.length;

  onMount(() => {
    ctx = canvasElement.getContext("2d");
    draw($frameIndex, $frameStart, $frameEnd);
    // draw();
  });

  /**
   * Draw the zoom control in the canvas.
   * @param {number} frameIndex The current frame index
   * @param {number} frameStart The start of the zoom window
   * @param {number} frameEnd The end of the zoom window
   */
  function draw(frameIndex, frameStart, frameEnd) {
    if (!canvasElement) return;

    ctx.fillStyle = "#242424";
    ctx.fillRect(0, 0, canvasElement.width, 40);

    ctx.fillStyle = "#333";
    ctx.fillRect(0, 40, canvasElement.width, 40);

    drawAudioSegments(frameIndex, frameStart, frameEnd);
    drawOverview(frameStart, frameEnd);
    drawFrameIndex(frameIndex);
  }

  /**
   * Draw the overview of the timeline.
   * @param {number} frameStart The start of the zoom window
   * @param {number} frameEnd The end of the zoom window
   */
  function drawOverview(frameStart, frameEnd) {
    let frameWidth = canvasElement.width / frameCount;
    let frameStartPixels = frameStart * frameWidth;
    let frameEndPixels = frameEnd * frameWidth;
    ctx.strokeStyle = "#aaa";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      frameStartPixels - 0.5,
      40.5,
      frameEndPixels - frameStartPixels - 0.5,
      39.5
    );
    ctx.fillStyle = "#aaa";

    ctx.fillRect(frameStartPixels - 3.5, 55, 5, 10);
    ctx.fillRect(frameEndPixels - 4, 55, 5, 10);

    // ctx.beginPath();
    // ctx.moveTo($frameIndex * frameWidth, 0);
    // ctx.lineTo($frameIndex * frameWidth, 50);
    // ctx.stroke();
  }

  /**
   * Draw the frame index marker.
   * @param {number} frameIndex The current frame index
   */
  function drawFrameIndex(frameIndex) {
    ctx.strokeStyle = "#f9423f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let frameWidth = canvasElement.width / frameCount;
    let x = frameIndex * frameWidth;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasElement.height);
    ctx.stroke();
    ctx.fillStyle = "#f9423f";
    ctx.beginPath();
    ctx.moveTo(x - 10, 0);
    ctx.lineTo(x + 10, 0);
    ctx.lineTo(x + 10, 10);
    ctx.lineTo(x, 20);
    ctx.lineTo(x - 10, 10);
    ctx.fill();
  }

  /**
   * @param {number} frameIndex
   * @param {number} frameStart
   * @param {number} frameEnd
   */
  function drawAudioSegments(frameIndex, frameStart, frameEnd) {
    ctx.strokeStyle = "#888";
    ctx.lineWidth = 5;
    ctx.beginPath();

    for (let [start, end] of scene.audioSegments) {
      start = start * 30;
      end = end * 30;
      let x1 = mapValue(start, 0, frameCount, 0, canvasElement.width);
      let x2 = mapValue(end, 0, frameCount, 0, canvasElement.width);
      ctx.moveTo(x1, canvasElement.height - 6);
      ctx.lineTo(x2, canvasElement.height - 6);
    }
    ctx.stroke();
  }

  /**
   * Handle mouse move events.
   * @param {MouseEvent} e
   */
  function onMouseDown(e) {
    // Are we over the frameStart marker?
    let frameWidth = canvasElement.width / frameCount;
    let frameStartPixels = $frameStart * frameWidth;
    let frameEndPixels = $frameEnd * frameWidth;
    if (e.offsetY < 40) {
      dragMode = "frameIndex";
    } else if (
      e.offsetX > frameStartPixels - 5 &&
      e.offsetX < frameStartPixels + 5
    ) {
      dragMode = "frameStart";
    } else if (
      e.offsetX > frameEndPixels - 5 &&
      e.offsetX < frameEndPixels + 5
    ) {
      dragMode = "frameEnd";
    } else {
      dragMode = "frameWindow";
    }

    // let frameWidth = canvasElement.width / frameCount;
    // let frame = Math.floor(e.offsetX / frameWidth);
    // console.log(frame);
    // frameIndex.set(frame);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  /**
   * Handle mouse move events.
   * @param {MouseEvent} e
   */
  function onMouseMove(e) {
    e.preventDefault();

    // Find the offset in the canvasElement, regardless of the event target

    let left = canvasElement.getBoundingClientRect().left;
    let offsetX = e.clientX - left;

    if (dragMode === "frameIndex") {
      let newFrameIndex = Math.floor(
        offsetX / (canvasElement.width / frameCount)
      );
      newFrameIndex = Math.max(0, newFrameIndex);
      newFrameIndex = Math.min(frameCount - 1, newFrameIndex);
      frameUpdateTriggeredByUser.set(true);
      frameIndex.set(newFrameIndex);
    } else if (dragMode === "frameStart") {
      let newFrameStart = (offsetX / canvasElement.width) * frameCount;
      if (newFrameStart < 0) {
        newFrameStart = 0;
      }
      if (newFrameStart > $frameEnd) {
        newFrameStart = $frameEnd;
      }
      frameStart.set(newFrameStart);
    } else if (dragMode === "frameEnd") {
      let newFrameEnd = (offsetX / canvasElement.width) * frameCount;
      if (newFrameEnd > frameCount) {
        newFrameEnd = frameCount;
      }
      frameEnd.set(newFrameEnd);
    } else if (dragMode === "frameWindow") {
      let dx = e.movementX;
      let frameWidth = canvasElement.width / frameCount;
      let newFrameStart = $frameStart + dx / frameWidth;
      let newFrameEnd = $frameEnd + dx / frameWidth;
      if (newFrameStart < 0) {
        newFrameStart = 0;
        newFrameEnd = $frameEnd - $frameStart;
      }
      if (newFrameEnd > frameCount) {
        newFrameEnd = frameCount;
        newFrameStart = frameCount - ($frameEnd - $frameStart);
      }
      frameStart.set(newFrameStart);
      frameEnd.set(newFrameEnd);
    }
  }

  /**
   * Handle mouse up events.
   * @param {MouseEvent} e
   */
  function onMouseUp(e) {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }

  $: draw($frameIndex, $frameStart, $frameEnd);
</script>

<div class="zoom-control">
  <canvas
    width="1000"
    height="80"
    bind:this={canvasElement}
    on:mousedown={onMouseDown}
  />
  <div class="times">
    <div class="time">{Math.floor($frameStart)}</div>
    <div class="time">{Math.floor($frameEnd)}</div>
  </div>
</div>

<style>
  .zoom-control {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  div.times {
    width: 100%;
    display: flex;
    justify-content: space-between;
    font-size: 11px;
  }
</style>
