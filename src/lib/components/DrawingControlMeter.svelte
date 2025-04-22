<script lang="ts">
  interface Props {
    active?: boolean;
    min: number;
    max: number;
    value: number;
    indicatorColor?: string;
    background?: string;
  }

  let {
    active = true,
    value,
    min,
    max,
    indicatorColor = "blue-500",
    background,
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
