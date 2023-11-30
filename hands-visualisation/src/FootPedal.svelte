<script>
  import { frameIndex, isPlaying, frameUpdateTriggeredByUser } from "./stores";

  const MIDI_CHANNEL = 1;
  const STATE_OFF = "off";
  const STATE_CONNECTED = "connected";
  const STATE_ERROR = "error";
  const CC_MESSAGE = 0xb;
  const PC_MESSAGE = 0xc;
  let state = STATE_OFF;
  let error = null;

  /**
   * @param err {any}
   */
  function reportError(err) {
    console.error(err);
    state = STATE_ERROR;
    error = err;
  }

  async function connect() {
    if (!navigator.requestMIDIAccess) {
      console.error("WebMIDI not supported");
      error = "WebMIDI not supported";
      return;
    }

    let midiAccess;
    try {
      midiAccess = await navigator.requestMIDIAccess();
    } catch (e) {
      reportError(e);
      return;
    }

    midiAccess.onstatechange = (e) => {
      console.log(e);
    };

    let inputOpened = false;
    for (const input of midiAccess.inputs.values()) {
      console.log(input.manufacturer);
      await input.open();
      input.addEventListener("midimessage", handleMessage);
      inputOpened = true;
    }

    if (!inputOpened) {
      reportError("No MIDI input devices found");
      return;
    }

    state = STATE_CONNECTED;
  }

  /**
   * @param {{ data: MIDIMessageEvent }} message
   */
  function handleMessage(message) {
    const statusByte = message.data[0];
    const messageType = statusByte >> 4;
    const midiChannel = (statusByte & 0xf) + 1;
    if (midiChannel !== MIDI_CHANNEL) {
      return;
    }

    if (messageType === CC_MESSAGE) {
      const cc = message.data[1];
      const value = message.data[2];
      console.log(cc, value);
      if (cc === 64) {
        // CC 64 = play/pause
        isPlaying.set(!$isPlaying);
      } else if (cc === 65) {
        // CC 65 = reset
        frameUpdateTriggeredByUser.set(true);
        frameIndex.set(0);
        isPlaying.set(false);
      }
    }
  }
</script>

<div class="foot-pedal">
  <header>Foot Pedal</header>
  {#if state === STATE_OFF}
    <button on:click={connect}>Connect</button>
  {:else if state === STATE_ERROR}
    <p class="error">{error}</p>
  {:else if state === STATE_CONNECTED}
    Connected
  {/if}
</div>

<style>
  .foot-pedal {
    position: fixed;
    top: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    background: #1a1a1a;
    font-size: 0.8rem;
    gap: 0.5rem;
    padding: 0.5rem;
    width: 100px;
    overflow: hidden;
  }
  button {
    border: 1px solid #666;
    font-size: 0.8rem;
    font: inherit;
    padding: 0;
    margin: 0;
    border-radius: 4px;
  }
  .error {
    font-size: 0.8rem;
    color: red;
  }
</style>
