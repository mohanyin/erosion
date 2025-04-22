<script lang="ts">
  interface Props {
    active?: boolean;
    min: number;
    max: number;
    value: number;
    indicatorColor?: string;
    background?: string;
    ticks?: number;
  }

  let {
    active = true,
    value,
    min,
    max,
    indicatorColor = "blue-500",
    background,
    ticks,
  }: Props = $props();

  const position = $derived((value - min) / (max - min));
</script>

<div
  part="root"
  role="meter"
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={value}
  class={[
    "w-full bg-gray-300 rounded-full px-1 py-px flex-none transition-all",
    { "translate-y-4": !active },
  ]}
  style={`background: ${background};`}
>
  <div class="relative h-1">
    {#if ticks}
      <!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
      {#each Array(ticks).fill(0) as _, tick (tick)}
        <div
          class="absolute w-[2px] h-[2px] rounded-full bg-gray-400 -translate-x-1/2 top-1/2 -translate-y-1/2 transition-[background-color] duration-200"
          style={`left: ${(tick * 100) / (ticks - 1)}%;`}
        ></div>
      {/each}
    {/if}
    <div
      part="indicator"
      class={[
        "absolute w-1 h-1 rounded-full -translate-x-1/2 transition-[background-color] duration-200",
        `bg-${indicatorColor}`,
      ]}
      style={`left: ${position * 100}%;`}
    ></div>
  </div>
</div>
