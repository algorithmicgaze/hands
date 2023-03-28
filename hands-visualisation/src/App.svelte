<script>
  import { csvParse } from "d3-dsv";
  import ZoomControl from "./ZoomControl.svelte";
  import TimePlot from "./TimePlot.svelte";
  import { frameIndex, frameStart, frameEnd } from "./stores";

  const CSV_URL =
    "https://enigmeta.s3.amazonaws.com/2023-hands/mocap/flute2_minimal.csv";
  // const CSV_URL = "/Flute2Slower_OnlyHands.csv";
  // const CSV_URL = "/flute2.csv";

  let isLoading = true;
  let data = [];

  async function fetchCsvFile() {
    const response = await fetch(CSV_URL);
    const csv = await response.text();
    data = csvParse(csv);
    console.log(data);
    isLoading = false;
    if ($frameEnd === 0) {
      frameEnd.set(data.length);
    }
  }

  // let frameIndex = 0;

  fetchCsvFile();
</script>

<main>
  <h1>Hands Visualiser</h1>
  {#if isLoading}
    <p>Loading...</p>
  {:else}
    <p>Loaded {data.length} rows</p>
    <ZoomControl {data} />

    <TimePlot {data} bone="RightHandIndex1" />
    <TimePlot {data} bone="RightHandMiddle1" />
    <TimePlot {data} bone="RightHandRing1" />
    <TimePlot {data} bone="RightHandPinky1" />
    <TimePlot {data} bone="RightHandThumb1" />

    <TimePlot {data} bone="LeftHandIndex1" />
    <TimePlot {data} bone="LeftHandMiddle1" />
    <TimePlot {data} bone="LeftHandRing1" />
    <TimePlot {data} bone="LeftHandPinky1" />
    <TimePlot {data} bone="LeftHandThumb1" />
  {/if}
</main>
