<script lang="ts">
  import convert from "color-convert";

  import Opacity from "@/assets/icons/Opacity.svelte";
  import StrokeWidth from "@/assets/icons/StrokeWidth.svelte";
  import Button from "@/lib/components/Button.svelte";
  import DrawingControlMeter from "@/lib/components/DrawingControlMeter.svelte";
  import ExpandingButton from "@/lib/components/ExpandingButton.svelte";
  import Panel from "@/lib/components/Panel.svelte";
  import SliderControl from "@/lib/components/SliderControl.svelte";
  import { Tools, type Tool } from "@/lib/services/drawing";

  interface Props {
    tool: Tool;
    // TODO: make these normal arrays
    toolColor: Float32Array;
    toolSize: Float32Array;
    toolOpacity: Float32Array;
    onToolChange: (tool: Tool) => void;
    onToolColorChange: (color: Float32Array) => void;
    onToolSizeChange: (size: Float32Array) => void;
    onToolOpacityChange: (opacity: Float32Array) => void;
  }

  let {
    tool,
    toolColor,
    toolSize,
    toolOpacity,
    onToolChange,
    onToolColorChange,
    onToolSizeChange,
    onToolOpacityChange,
  }: Props = $props();

  let activeMenu = $state<
    "tool" | "size" | "opacity" | "hue" | "saturation" | "lightness" | null
  >(null);

  const hsl = $derived.by(() => {
    const [r, g, b] = toolColor;
    return convert.rgb.hsl([r, g, b]);
  });

  const isColorDark = $derived(hsl[2] < 50);
  const thumbColor = $derived(isColorDark ? "white" : "black");

  function onColorChange(updates: (number | undefined)[]) {
    const rgb = convert.hsl.rgb(
      updates[0] || hsl[0],
      updates[1] || hsl[1],
      updates[2] || hsl[2],
    );
    onToolColorChange(new Float32Array(rgb));
  }

  const hueGradient = $derived.by(() => {
    const stops = Array.from({ length: 7 }, (_, i) => {
      const hue = i * 60;
      return `hsl(${hue}, ${hsl[1]}%, ${hsl[2]}%)`;
    });
    return `linear-gradient(to right, ${stops.join(", ")})`;
  });

  const saturationGradient = $derived.by(() => {
    const stops = Array.from({ length: 5 }, (_, i) => {
      const saturation = i * 25;
      return `hsl(${hsl[0]}, ${saturation}%, ${hsl[2]}%)`;
    });
    return `linear-gradient(to right, ${stops.join(", ")})`;
  });

  const lightnessGradient = $derived.by(() => {
    const stops = Array.from({ length: 5 }, (_, i) => {
      const lightness = 100 - i * 25;
      return `hsl(${hsl[0]}, ${hsl[1]}%, ${lightness}%)`;
    });
    return `linear-gradient(to right, ${stops.join(", ")})`;
  });

  let lastDrawingTool = $state<Tool>(tool);

  function mapToolToIcon(tool: Tool) {
    switch (tool) {
      case Tools.Pencil:
        return "stylus_pencil";
      case Tools.Pen:
        return "stylus_pen";
      case Tools.Marker:
        return "stylus_highlighter";
      case Tools.Brush:
      default:
        return "stylus_brush";
    }
  }

  function isDrawingTool(tool: Tool) {
    return !([Tools.Water, Tools.WindErosion] as Tool[]).includes(tool);
  }

  function updateTool(newTool: Tool) {
    if (isDrawingTool(newTool)) {
      lastDrawingTool = newTool;
    }
    onToolChange(newTool);
  }
</script>

<Panel
  tag="footer"
  class="bottom-0 left-[50%] translate-x-[-50%] rounded-se-lg rounded-ss-lg"
>
  <ExpandingButton
    icon={mapToolToIcon(lastDrawingTool)}
    ariaLabel="Pencil"
    highlight={isDrawingTool(tool)}
    disableExpansion={!isDrawingTool(tool)}
    activeWidth="w-50"
    onClick={() => updateTool(lastDrawingTool)}
    onChange={(active) => (activeMenu = active ? "tool" : null)}
  >
    {#snippet meter()}
      <DrawingControlMeter
        active={activeMenu !== "tool"}
        value={lastDrawingTool}
        min={0}
        max={3}
        indicatorColor="blue-500"
        ticks={4}
      />
    {/snippet}

    <div
      class="flex w-full justify-between bg-gray-200 px-1 h-full items-center"
    >
      <Button
        icon="stylus_pencil"
        highlight={tool === Tools.Pencil}
        onclick={() => updateTool(Tools.Pencil)}
      />
      <Button
        icon="stylus_pen"
        highlight={tool === Tools.Pen}
        onclick={() => updateTool(Tools.Pen)}
      />
      <Button
        icon="stylus_highlighter"
        highlight={tool === Tools.Marker}
        onclick={() => updateTool(Tools.Marker)}
      />
      <Button
        icon="stylus_brush"
        highlight={tool === Tools.Brush}
        onclick={() => updateTool(Tools.Brush)}
      />
    </div>
  </ExpandingButton>
  <div class="flex gap-2 items-end self-stretch">
    <Button
      icon="water"
      ariaLabel="Paint with water"
      highlight={tool === Tools.Water}
      onclick={() => updateTool(Tools.Water)}
    />
    <Button
      icon="air"
      ariaLabel="Erode with air"
      highlight={tool === Tools.WindErosion}
      onclick={() => updateTool(Tools.WindErosion)}
    />
  </div>

  <div class="w-[1px] h-fill bg-gray-300"></div>

  <ExpandingButton
    ariaLabel="Stroke width"
    onChange={(active) => (activeMenu = active ? "size" : null)}
  >
    {#snippet meter()}
      <DrawingControlMeter
        active={activeMenu !== "size"}
        value={toolSize[0]}
        min={4}
        max={50}
        indicatorColor="blue-500"
      />
    {/snippet}
    {#snippet button()}<StrokeWidth />{/snippet}

    <SliderControl
      trackLine={true}
      min={4}
      max={50}
      step={1}
      value={toolSize[0]}
      onValueChange={(value) => {
        onToolSizeChange(new Float32Array([value]));
      }}
    >
      {#snippet prepend()}
        <div class="w-1 h-1 rounded-full bg-black"></div>
      {/snippet}
      {#snippet append()}
        <div class="w-4 h-4 rounded-full bg-black"></div>
      {/snippet}
    </SliderControl>
  </ExpandingButton>
  <ExpandingButton
    ariaLabel="Opacity"
    onChange={(active) => (activeMenu = active ? "opacity" : null)}
  >
    {#snippet meter()}
      <DrawingControlMeter
        active={activeMenu !== "opacity"}
        value={toolOpacity[0]}
        min={0}
        max={1}
        indicatorColor="blue-500"
      />
    {/snippet}
    {#snippet button()}<Opacity />{/snippet}

    <SliderControl
      trackLine={true}
      min={0}
      max={1}
      step={0.01}
      value={toolOpacity[0]}
      onValueChange={(value) => {
        onToolOpacityChange(new Float32Array([value]));
      }}
    >
      {#snippet prepend()}
        <div class="w-3 h-3 rounded-full border border-black"></div>
      {/snippet}
      {#snippet append()}
        <div class="w-3 h-3 rounded-full bg-black"></div>
      {/snippet}
    </SliderControl>
  </ExpandingButton>

  <div class="w-[1px] h-fill bg-gray-300"></div>

  <ExpandingButton
    ariaLabel="Hue"
    onChange={(active) => (activeMenu = active ? "hue" : null)}
  >
    {#snippet meter()}
      <DrawingControlMeter
        active={activeMenu !== "hue"}
        value={hsl[0]}
        min={0}
        max={360}
        indicatorColor={thumbColor}
        background={hueGradient}
      />
    {/snippet}
    {#snippet button()}H{/snippet}

    <SliderControl
      min={1}
      max={360}
      step={1}
      trackBackground={hueGradient}
      {thumbColor}
      value={() => hsl[0]}
      onValueChange={(value) => onColorChange([value])}
    ></SliderControl>
  </ExpandingButton>
  <ExpandingButton
    ariaLabel="Saturation"
    onChange={(active) => (activeMenu = active ? "saturation" : null)}
  >
    {#snippet meter()}
      <DrawingControlMeter
        active={activeMenu !== "saturation"}
        value={hsl[1]}
        min={0}
        max={100}
        indicatorColor={thumbColor}
        background={saturationGradient}
      />
    {/snippet}
    {#snippet button()}S{/snippet}

    <SliderControl
      min={0}
      max={100}
      step={1}
      trackBackground={saturationGradient}
      {thumbColor}
      value={() => hsl[1]}
      onValueChange={(value) => onColorChange([hsl[0], value])}
    ></SliderControl>
  </ExpandingButton>
  <ExpandingButton
    ariaLabel="Lightness"
    onChange={(active) => (activeMenu = active ? "lightness" : null)}
  >
    {#snippet meter()}
      <DrawingControlMeter
        active={activeMenu !== "lightness"}
        value={100 - hsl[2]}
        min={0}
        max={100}
        indicatorColor={thumbColor}
        background={lightnessGradient}
      />
    {/snippet}
    {#snippet button()}L{/snippet}

    <SliderControl
      min={0}
      max={100}
      step={1}
      trackBackground={lightnessGradient}
      {thumbColor}
      value={() => 100 - hsl[2]}
      onValueChange={(value) => onColorChange([hsl[0], hsl[1], 100 - value])}
    ></SliderControl>
  </ExpandingButton>

  <div
    class="rounded-full w-8 h-8 bg-gray-300"
    style={`background-color: rgb(${toolColor[0]}, ${toolColor[1]}, ${toolColor[2]})`}
  >
    <span class="sr-only">
      Current color is red: {toolColor[0]}, green: {toolColor[1]}, blue: {toolColor[2]}`
    </span>
  </div>
</Panel>
