<script>
  import ZoomControl from "./ZoomControl.svelte";
  import TimePlot from "./TimePlot.svelte";
  import { frameIndex, frameStart, frameEnd, isPlaying } from "./stores";
  import { parseBvh } from "./bvh-parser";
  import VideoPreview from "./VideoPreview.svelte";
  import SegmentPlot from "./SegmentPlot.svelte";
  import HandsOut from "./HandsOut.svelte";
  import PlayIndicator from "./PlayIndicator.svelte";

  const BVH_URL =
    "https://algorithmicgaze.s3.amazonaws.com/projects/2023-hands/recordings/2023-11-09/oboe-slomo-clap.bvh";

  const VIDEO_URL =
    "https://algorithmicgaze.s3.amazonaws.com/projects/2023-hands/recordings/2023-11-09/oboe-slomo-clap.mp4";

  const SEGMENTS_URL =
    "https://algorithmicgaze.s3.amazonaws.com/projects/2023-hands/recordings/2023-11-09/oboe-slomo-clap.json";

  const DRAW_MODE_XYZ = "xyz";
  const DRAW_MODE_MAGNITUDE = "magnitude";
  const DRAW_MODE_RATE_OF_CHANGE = "rate-of-change";

  let isLoading = true;
  let data = [];
  let segments = [];
  let drawMode = DRAW_MODE_XYZ;
  let frameOffset = 107;

  async function fetchBvhFile() {
    const response = await fetch(BVH_URL);
    const text = await response.text();
    const bones = parseBvh(text);
    // console.log(bones);
    data = bones;
    isLoading = false;
    if ($frameEnd === 0) {
      frameEnd.set(bones[0].frames.length);
    }
  }

  async function fetchSegmentsFile() {
    const response = await fetch(SEGMENTS_URL);
    const json = await response.json();
    console.log(json);
    segments = json.segments;
  }

  fetchBvhFile();
  fetchSegmentsFile();
  window.addEventListener("keypress", (e) => {
    if (e.key === " ") {
      e.preventDefault();
      isPlaying.set(!$isPlaying);
    }
  });
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

    <VideoPreview src={VIDEO_URL} offset={frameOffset} fps={25} />
    <HandsOut {data} />

    <SegmentPlot {segments} />

    <TimePlot {data} bone="RightFinger1Proximal" {drawMode} {frameOffset} />
    <TimePlot {data} bone="RightFinger2Proximal" {drawMode} {frameOffset} />
    <TimePlot {data} bone="RightFinger3Proximal" {drawMode} {frameOffset} />
    <TimePlot {data} bone="RightFinger4Proximal" {drawMode} {frameOffset} />
    <TimePlot {data} bone="RightFinger5Proximal" {drawMode} {frameOffset} />

    <TimePlot {data} bone="LeftFinger1Proximal" {drawMode} {frameOffset} />
    <TimePlot {data} bone="LeftFinger2Proximal" {drawMode} {frameOffset} />
    <TimePlot {data} bone="LeftFinger3Proximal" {drawMode} {frameOffset} />
    <TimePlot {data} bone="LeftFinger4Proximal" {drawMode} {frameOffset} />
    <TimePlot {data} bone="LeftFinger5Proximal" {drawMode} {frameOffset} />
    <PlayIndicator />
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
