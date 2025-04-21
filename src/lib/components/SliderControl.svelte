<script lang="ts">
  import { Slider } from "melt/builders";
  import type { SliderProps } from "melt/builders";
  import type { Snippet } from "svelte";

  interface Props {
    prepend?: Snippet;
    append?: Snippet;
    thumbColor?: string;
    trackLine?: boolean;
    trackBackground?: string;
  }

  let {
    prepend,
    append,
    thumbColor = "blue-500",
    trackLine = false,
    trackBackground = "",
    ...sliderProps
  }: Props & SliderProps = $props();

  const slider = new Slider(sliderProps);
</script>

<div class="w-full h-full bg-white flex gap-3 px-3 py-2 items-center">
  {#if prepend}
    <div part="prepend" class="flex-none">{@render prepend?.()}</div>
  {/if}
  <div
    {...slider.root}
    part="track"
    class="relative flex-1 h-full rounded-sm"
    style={`${slider.root.style}; background: ${trackBackground};`}
  >
    {#if trackLine}
      <div
        part="track-line"
        class="absolute w-full border border-gray-300 top-1/2 -translate-y-1/2"
      ></div>
    {/if}
    <div
      part="thumb"
      {...slider.thumb}
      class={[
        "shadow-sm w-3 h-3 rounded-full absolute left-[var(--percentage)] top-1/2 -translate-y-1/2 -translate-x-1/2",
        `bg-${thumbColor}`,
      ]}
    ></div>
  </div>
  {#if append}
    <div part="append" class="flex-none">{@render append?.()}</div>
  {/if}
</div>
