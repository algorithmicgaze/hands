<script>
  import { onMount } from "svelte";
  import { frameIndex, frameStart, frameEnd } from "./stores";

  export let data;

  let dragMode;

  let canvasElement;
  let ctx;

  let frameCount = data.length;

  onMount(() => {
    ctx = canvasElement.getContext("2d");
    draw($frameIndex, $frameStart, $frameEnd);
    // draw();
  });

  function draw(frameIndex, frameStart, frameEnd) {
    if (!canvasElement) return;

    drawOverview(frameStart, frameEnd);
    drawFrameIndex(frameIndex);
  }

  function drawOverview(frameStart, frameEnd) {
    let frameWidth = canvasElement.width / frameCount;
    let frameStartPixels = frameStart * frameWidth;
    let frameEndPixels = frameEnd * frameWidth;
    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, canvasElement.width, 50);
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      frameStartPixels,
      1.5,
      frameEndPixels - frameStartPixels,
      48
    );
    ctx.fillStyle = "red";

    ctx.fillRect(frameStartPixels - 3, 20, 5, 10);
    ctx.fillRect(frameEndPixels - 3, 20, 5, 10);

    // ctx.beginPath();
    // ctx.moveTo($frameIndex * frameWidth, 0);
    // ctx.lineTo($frameIndex * frameWidth, 50);
    // ctx.stroke();
  }

  function drawFrameIndex(frameIndex) {
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let frameWidth = canvasElement.width / frameCount;
    ctx.moveTo(frameIndex * frameWidth, 0);
    ctx.lineTo(frameIndex * frameWidth, canvasElement.height);
    ctx.stroke();
  }

  function onMouseDown(e) {
    // Are we over the frameStart marker?
    let frameWidth = canvasElement.width / frameCount;
    let frameStartPixels = $frameStart * frameWidth;
    let frameEndPixels = $frameEnd * frameWidth;
    if (e.offsetX > frameStartPixels - 5 && e.offsetX < frameStartPixels + 5) {
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

  function onMouseMove(e) {
    e.preventDefault();

    // Find the offset in the canvasElement, regardless of the event target

    let left = canvasElement.getBoundingClientRect().left;
    let offsetX = e.clientX - left;

    if (dragMode === "frameStart") {
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

  function onMouseUp(e) {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }

  $: draw($frameIndex, $frameStart, $frameEnd);
</script>

<canvas
  width="1000"
  height="50"
  bind:this={canvasElement}
  on:mousedown={onMouseDown}
/>
