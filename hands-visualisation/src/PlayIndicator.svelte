<script>
  import { isPlaying } from "./stores";
</script>

<div class="play-indicator">
  <svg viewBox="0 0 100 100" width="40" height="40">
    {#if $isPlaying}
      <polygon points="0,0 100,50 0,100" fill="rgba(255, 255, 255, 0.5)" />
    {/if}
  </svg>
</div>

<style>
  .play-indicator {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
  }
</style>
