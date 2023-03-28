import { writable } from "svelte/store";

export let frameIndex = writable(0);
export let frameStart = writable(2600);
export let frameEnd = writable(4300);
