<script>
  import { onMount } from "svelte";

  import ZoomControl from "./ZoomControl.svelte";
  import TimePlot from "./TimePlot.svelte";
  import { frameIndex, frameStart, frameEnd, isPlaying } from "./stores";
  import { parseBvh } from "./bvh-parser";
  import VideoPreview from "./VideoPreview.svelte";
  import SegmentPlot from "./SegmentPlot.svelte";
  import HandsOut from "./HandsOut.svelte";
  import PlayIndicator from "./PlayIndicator.svelte";
  import FootPedal from "./FootPedal.svelte";

  const DRAW_MODE_XYZ = "xyz";
  const DRAW_MODE_MAGNITUDE = "magnitude";
  const DRAW_MODE_RATE_OF_CHANGE = "rate-of-change";

  let isLoading = true;
  let error = null;
  let scene = null;
  let data = [];
  let drawMode = DRAW_MODE_MAGNITUDE;

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
    scene.basePath = url.split("/").slice(0, -1).join("/");

    await fetchBvhFile(`${scene.basePath}/${scene.mocapFile}`);
    scene.frameStart = scene.startFrame || 0;
    scene.frameEnd = scene.endFrame || scene.data[0].frames.length;
    console.log(scene.frameStart, scene.frameEnd);
    frameStart.set(scene.frameStart);
    frameEnd.set(scene.frameEnd);

    console.log(scene);

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
  <h1>Hands Visualiser</h1>
  {#if isLoading}
    <p>Loading...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <ZoomControl {data} />
    <select bind:value={drawMode}>
      <option value={DRAW_MODE_XYZ}>XYZ</option>
      <option value={DRAW_MODE_MAGNITUDE}>Magnitude</option>
      <option value={DRAW_MODE_RATE_OF_CHANGE}>Rate of Change</option>
    </select>

    <VideoPreview
      src={`${scene.basePath}/${scene.videoFile}`}
      mocapFrameOffset={scene.mocapFrameOffset}
      videoFps={25}
      mocapFps={30}
    />
    <HandsOut
      {data}
      segments={scene.audioSegments}
      frameOffset={scene.mocapFrameOffset}
    />

    <SegmentPlot
      segments={scene.audioSegments}
      frameOffset={scene.mocapFrameOffset}
    />

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
</style>
