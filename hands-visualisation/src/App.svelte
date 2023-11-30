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

  const DRAW_MODE_XYZ = "xyz";
  const DRAW_MODE_MAGNITUDE = "magnitude";
  const DRAW_MODE_RATE_OF_CHANGE = "rate-of-change";

  let isLoading = true;
  let scene = null;
  let data = [];
  let drawMode = DRAW_MODE_MAGNITUDE;

  /**
   * @param {string} url URL of the scene file
   */
  async function fetchSceneFile(url) {
    const response = await fetch(url);
    scene = await response.json();
    scene.basePath = url.split("/").slice(0, -1).join("/");

    await fetchBvhFile(`${scene.basePath}/${scene.mocapFile}`);

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
    if ($frameEnd === 0) {
      frameEnd.set(bones[0].frames.length);
    }
  }

  onMount(async () => {
    const sceneId = document.location.hash
      ? document.location.hash.substring(1)
      : "2023-11-09-oboe-slomo-clap";
    const sceneUrl = `/scenes/${sceneId}.json`;

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
  {:else}
    <p>Loaded {data.length} rows</p>
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
    <HandsOut {data} frameOffset={scene.mocapFrameOffset} />

    <SegmentPlot
      segments={scene.audioSegments}
      frameOffset={scene.mocapFrameOffset}
    />

    <TimePlot
      {data}
      bone="RightFinger1Proximal"
      {drawMode}
      frameOffset={scene.mocapFrameOffset}
    />
    <TimePlot
      {data}
      bone="RightFinger2Proximal"
      {drawMode}
      frameOffset={scene.mocapFrameOffset}
    />
    <TimePlot
      {data}
      bone="RightFinger3Proximal"
      {drawMode}
      frameOffset={scene.mocapFrameOffset}
    />
    <TimePlot
      {data}
      bone="RightFinger4Proximal"
      {drawMode}
      frameOffset={scene.mocapFrameOffset}
    />
    <TimePlot
      {data}
      bone="RightFinger5Proximal"
      {drawMode}
      frameOffset={scene.mocapFrameOffset}
    />

    <TimePlot
      {data}
      bone="LeftFinger1Proximal"
      {drawMode}
      frameOffset={scene.mocapFrameOffset}
    />
    <TimePlot
      {data}
      bone="LeftFinger2Proximal"
      {drawMode}
      frameOffset={scene.mocapFrameOffset}
    />
    <TimePlot
      {data}
      bone="LeftFinger3Proximal"
      {drawMode}
      frameOffset={scene.mocapFrameOffset}
    />
    <TimePlot
      {data}
      bone="LeftFinger4Proximal"
      {drawMode}
      frameOffset={scene.mocapFrameOffset}
    />
    <TimePlot
      {data}
      bone="LeftFinger5Proximal"
      {drawMode}
      frameOffset={scene.mocapFrameOffset}
    />
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
