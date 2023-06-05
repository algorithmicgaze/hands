<script>
  import ZoomControl from "./ZoomControl.svelte";
  import TimePlot from "./TimePlot.svelte";
  import { frameIndex, frameStart, frameEnd } from "./stores";
  import { parseBvh } from "./bvh-parser";

  const BVH_URL =
    "https://algorithmicgaze.s3.amazonaws.com/projects/2022-hands/mocap/2023-05-25-rec1.bvh";

  let isLoading = true;
  let data = [];

  async function fetchBvhFile() {
    const response = await fetch(BVH_URL);
    const text = await response.text();
    const bones = parseBvh(text);
    console.log(bones);
    data = bones;
    isLoading = false;
    if ($frameEnd === 0) {
      frameEnd.set(bones[0].frames.length - 1);
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

    <TimePlot {data} bone="RightFinger1Proximal" />
    <TimePlot {data} bone="RightFinger2Proximal" />
    <TimePlot {data} bone="RightFinger3Proximal" />
    <TimePlot {data} bone="RightFinger4Proximal" />
    <TimePlot {data} bone="RightFinger5Proximal" />

    <TimePlot {data} bone="LeftFinger1Proximal" />
    <TimePlot {data} bone="LeftFinger2Proximal" />
    <TimePlot {data} bone="LeftFinger3Proximal" />
    <TimePlot {data} bone="LeftFinger4Proximal" />
    <TimePlot {data} bone="LeftFinger5Proximal" />
  {/if}
</main>
