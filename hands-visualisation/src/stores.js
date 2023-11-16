import { writable } from "svelte/store";

export let frameIndex = writable(0);
export let frameStart = writable(0);
export let frameEnd = writable(0);
export let frameUpdateTriggeredByUser = writable(false);
