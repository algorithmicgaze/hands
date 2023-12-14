<script>
  import { onMount } from "svelte";

  import ZoomControl from "./ZoomControl.svelte";
  import TimePlot from "./TimePlot.svelte";
  import {
    frameIndex,
    frameStart,
    frameEnd,
    isPlaying,
    frameUpdateTriggeredByUser,
  } from "./stores";
  import { parseBvh } from "./bvh-parser";
  import VideoPreview from "./VideoPreview.svelte";
  import SegmentPlot from "./SegmentPlot.svelte";
  import HandsOut from "./HandsOut.svelte";
  import PlayIndicator from "./PlayIndicator.svelte";
  import FootPedal from "./FootPedal.svelte";
  import { detectEvents } from "./event-detector";

  const DRAW_MODE_XYZ = "xyz";
  const DRAW_MODE_MAGNITUDE = "magnitude";
  const DRAW_MODE_RATE_OF_CHANGE = "rate-of-change";

  let isLoading = true;
  let error = null;
  let scene = null;
  let data = [];
  let drawMode = DRAW_MODE_RATE_OF_CHANGE;

  /**
   * @param {string} url URL of the scene file
   */
  async function fetchSceneFile(url) {
    const response = await fetch(url);
    if (!response.ok) {
      isLoading = false;
      error = `Failed to fetch scene file: ${response.status}`;
      return;
    }
    try {
      scene = await response.json();
    } catch (e) {
      isLoading = false;
      error = `Failed to parse scene file: ${e}`;
      return;
    }
    scene.id = url.split("/").slice(-1)[0].split(".")[0];
    scene.basePath = url.split("/").slice(0, -1).join("/");

    await fetchBvhFile(`${scene.basePath}/${scene.mocapFile}`);
    scene.frameStart = scene.startFrame || 0;
    scene.frameEnd = scene.endFrame || scene.data[0].frames.length;

    const [rosMap, eventMap] = detectEvents(scene);
    scene.rosMap = rosMap;
    scene.eventMap = eventMap;

    frameStart.set(scene.frameStart);
    frameEnd.set(scene.frameEnd);
    frameUpdateTriggeredByUser.set(true);
    frameIndex.set(scene.frameStart);

    isLoading = false;
  }

  /**
   * @param {string} bvh_url URL to BVH file
   */
  async function fetchBvhFile(bvh_url) {
    const response = await fetch(bvh_url);
    const text = await response.text();
    const bones = parseBvh(text);
    data = bones;
    scene.data = bones;
    if ($frameEnd === 0) {
      frameEnd.set(bones[0].frames.length);
    }
  }

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const sceneUrl =
      params.get("url") ||
      "https://algorithmicgaze.s3.amazonaws.com/projects/2023-hands/scenes/2023-11-16-oboe-pan.json";

    await fetchSceneFile(sceneUrl);

    window.addEventListener("keypress", (e) => {
      if (e.key === " ") {
        e.preventDefault();
        isPlaying.set(!$isPlaying);
      }
    });
  });
</script>

<main>
  {#if isLoading}
    <p>Loading...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <div class="control-header">
      <ZoomControl {scene} />
      <div class="play-controls">
        <svg
          class="play-button"
          on:click={() => isPlaying.set(!$isPlaying)}
          on:keypress={(e) => {}}
          width="24"
          height="24"
          viewBox="0 0 24 24"
        >
          {#if $isPlaying}
            <path d="M8 7h3v10H8zm5 0h3v10h-3z" fill="#aaa" />
          {:else}
            <path d="M7 6v12l10-6z" fill="#aaa" />
          {/if}
        </svg>
        <select bind:value={drawMode}>
          <option value={DRAW_MODE_XYZ}>XYZ</option>
          <option value={DRAW_MODE_MAGNITUDE}>Magnitude</option>
          <option value={DRAW_MODE_RATE_OF_CHANGE}>Rate of Change</option>
        </select>
      </div>
    </div>

    <VideoPreview
      src={`${scene.basePath}/${scene.videoFile}`}
      mocapFrameOffset={scene.mocapFrameOffset}
      videoFps={25}
      mocapFps={30}
    />
    <HandsOut {scene} />

    <TimePlot {scene} bone="LeftFinger1Proximal" {drawMode} />
    <TimePlot {scene} bone="LeftFinger2Proximal" {drawMode} />
    <TimePlot {scene} bone="LeftFinger3Proximal" {drawMode} />
    <TimePlot {scene} bone="LeftFinger4Proximal" {drawMode} />
    <TimePlot {scene} bone="LeftFinger5Proximal" {drawMode} />

    <TimePlot {scene} bone="RightFinger1Proximal" {drawMode} />
    <TimePlot {scene} bone="RightFinger2Proximal" {drawMode} />
    <TimePlot {scene} bone="RightFinger3Proximal" {drawMode} />
    <TimePlot {scene} bone="RightFinger4Proximal" {drawMode} />
    <TimePlot {scene} bone="RightFinger5Proximal" {drawMode} />

    <PlayIndicator />
    <FootPedal />
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 300px;
  }
  .play-button {
    border-radius: 50%;
    background-color: #111;
  }
  .control-header {
    position: sticky;
    top: 0;
    background-color: #242424;
    padding-bottom: 8px;
    z-index: 100;
  }
  .play-controls {
    display: flex;
    width: 100%;
    gap: 0.5rem;
    justify-content: space-between;
    font-size: 0.8rem;
  }
</style>
