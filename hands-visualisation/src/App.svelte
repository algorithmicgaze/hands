<script>
  import ZoomControl from "./ZoomControl.svelte";
  import TimePlot from "./TimePlot.svelte";
  import { frameIndex, frameStart, frameEnd } from "./stores";
  import { parseBvh } from "./bvh-parser";
  import VideoPreview from "./VideoPreview.svelte";

  const BVH_URL =
    "https://algorithmicgaze.s3.amazonaws.com/projects/2023-hands/recordings/2023-11-09/oboe-slomo-clap.bvh";

  const VIDEO_URL =
    "https://algorithmicgaze.s3.amazonaws.com/projects/2023-hands/recordings/2023-11-09/oboe-slomo-clap.mp4";

  const DRAW_MODE_XYZ = "xyz";
  const DRAW_MODE_MAGNITUDE = "magnitude";
  const DRAW_MODE_RATE_OF_CHANGE = "rate-of-change";

  let isLoading = true;
  let data = [];
  let drawMode = DRAW_MODE_XYZ;

  async function fetchBvhFile() {
    const response = await fetch(BVH_URL);
    const text = await response.text();
    const bones = parseBvh(text);
    console.log(bones);
    data = bones;
    isLoading = false;
    if ($frameEnd === 0) {
      frameEnd.set(bones[0].frames.length);
    }
  }

  // let frameIndex = 0;

  fetchBvhFile();
</script>

<main>
  <h1>Hands Visualiser</h1>
  {#if isLoading}
    <p>Loading...</p>
  {:else}
    <p>Loaded {data.length} rows</p>
    <ZoomControl {data} />
    <select bind:value={drawMode}>
      <option value={DRAW_MODE_XYZ}>XYZ</option>
      <option value={DRAW_MODE_MAGNITUDE}>Magnitude</option>
      <option value={DRAW_MODE_RATE_OF_CHANGE}>Rate of Change</option>
    </select>

    <VideoPreview src={VIDEO_URL} offset={107} fps={25} />

    <TimePlot {data} bone="RightFinger1Proximal" {drawMode} />
    <TimePlot {data} bone="RightFinger2Proximal" {drawMode} />
    <TimePlot {data} bone="RightFinger3Proximal" {drawMode} />
    <TimePlot {data} bone="RightFinger4Proximal" {drawMode} />
    <TimePlot {data} bone="RightFinger5Proximal" {drawMode} />

    <TimePlot {data} bone="LeftFinger1Proximal" {drawMode} />
    <TimePlot {data} bone="LeftFinger2Proximal" {drawMode} />
    <TimePlot {data} bone="LeftFinger3Proximal" {drawMode} />
    <TimePlot {data} bone="LeftFinger4Proximal" {drawMode} />
    <TimePlot {data} bone="LeftFinger5Proximal" {drawMode} />
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
</style>
