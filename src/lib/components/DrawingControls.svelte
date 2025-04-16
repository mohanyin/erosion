<script lang="ts">
  import Button from "@/lib/components/Button.svelte";
  import ButtonWithPopover from "@/lib/components/ButtonWithPopover.svelte";
  import Panel from "@/lib/components/Panel.svelte";
  import StrokeWidth from "@/assets/icons/StrokeWidth.svelte";
  import Opacity from "@/assets/icons/Opacity.svelte";
  import { derived } from "svelte/store";
  import convert from "color-convert";

  interface Props {
    toolColor: Float32Array;
    toolSize: Float32Array;
    toolOpacity: Float32Array;
    onToolColorChange: (color: Float32Array) => void;
    onToolSizeChange: (size: Float32Array) => void;
    onToolOpacityChange: (opacity: Float32Array) => void;
  }

  let {
    toolColor,
    toolSize,
    toolOpacity,
    onToolColorChange,
    onToolSizeChange,
    onToolOpacityChange,
  }: Props = $props();
  const hsl = $derived.by(() => {
    const [r, g, b] = toolColor;
    return convert.rgb.hsl([r, g, b]);
  });

  function onColorChange(updates: (number | undefined)[]) {
    const rgb = convert.hsl.rgb(
      updates[0] || hsl[0],
      updates[1] || hsl[1],
      updates[2] || hsl[2],
    );
    onToolColorChange(new Float32Array(rgb));
  }
</script>

{#snippet hueButtonContent()}
  H
{/snippet}

{#snippet saturationButtonContent()}
  S
{/snippet}

{#snippet lightnessButtonContent()}
  L
{/snippet}

{#snippet strokeWidthButtonContent()}
  <StrokeWidth />
{/snippet}

{#snippet opacityButtonContent()}
  <Opacity />
{/snippet}

<Panel
  tag="footer"
  class="bottom-0 left-[50%] translate-x-[-50%] rounded-se-lg rounded-ss-lg"
>
  <Button icon={"stylus_pencil"} ariaLabel={"Pencil"} />
  <Button icon={"water"} ariaLabel={"Paint with water"} />
  <Button icon={"air"} ariaLabel={"Erode with air"} />

  <div class="w-[1px] h-fill bg-gray-300"></div>

  <ButtonWithPopover
    ariaLabel={"Stroke width"}
    button={strokeWidthButtonContent}
  >
    <input
      type="range"
      min="0"
      max="50"
      value={toolSize[0]}
      onchange={(event) =>
        onToolSizeChange(new Float32Array([Number(event.target!.value)]))}
    />
  </ButtonWithPopover>
  <ButtonWithPopover ariaLabel={"Opacity"} button={opacityButtonContent}>
    <input
      type="range"
      min="0"
      max="100"
      value={toolOpacity[0] * 100}
      onchange={(event) =>
        onToolOpacityChange(
          new Float32Array([Number(event.target!.value) / 100]),
        )}
    />
  </ButtonWithPopover>

  <div class="w-[1px] h-fill bg-gray-300"></div>

  <ButtonWithPopover ariaLabel={"Hue"} button={hueButtonContent}>
    <input
      type="range"
      min="0"
      max="360"
      value={hsl[0]}
      onchange={(event) => onColorChange([Number(event.target!.value)])}
    />
  </ButtonWithPopover>
  <ButtonWithPopover ariaLabel={"Saturation"} button={saturationButtonContent}>
    <input
      type="range"
      min="0"
      max="100"
      value={hsl[1]}
      onchange={(event) =>
        onColorChange([undefined, Number(event.target!.value)])}
    />
  </ButtonWithPopover>
  <ButtonWithPopover ariaLabel={"Lightness"} button={lightnessButtonContent}>
    <input
      type="range"
      min="0"
      max="100"
      value={hsl[2]}
      onchange={(event) =>
        onColorChange([undefined, undefined, Number(event.target!.value)])}
    />
  </ButtonWithPopover>
  <div
    class="rounded-full w-8 h-8 bg-gray-300"
    style={`background-color: rgb(${toolColor[0]}, ${toolColor[1]}, ${toolColor[2]})`}
  >
    <span class="sr-only">
      Current color is red: {toolColor[0]}, green: {toolColor[1]}, blue: {toolColor[2]}`
    </span>
  </div>
</Panel>
