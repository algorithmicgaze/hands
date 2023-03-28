<script>
  import { csvParse } from "d3-dsv";
  import ZoomControl from "./ZoomControl.svelte";
  import TimePlot from "./TimePlot.svelte";
  import { frameIndex, frameStart, frameEnd } from "./stores";

  const CSV_URL =
    "https://enigmeta.s3.amazonaws.com/2023-hands/mocap/Flute2Slower_OnlyHands.csv";
  // const CSV_URL = "/Flute2Slower_OnlyHands.csv";
  // const CSV_URL = "/flute2_pos.csv";

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

    <TimePlot {data} bone="RightHand" />
    <TimePlot {data} bone="RightInHandMiddle" />
    <TimePlot {data} bone="RightHandMiddle1" />
    <TimePlot {data} bone="RightHandMiddle2" />
  {/if}
</main>
