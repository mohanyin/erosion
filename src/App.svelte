<script lang="ts">
  import { onMount } from "svelte";

  import Canvas from "@/lib/components/Canvas.svelte";
  import DrawingControls from "@/lib/components/DrawingControls.svelte";
  import FileControls from "@/lib/components/FileControls.svelte";
  import { Tools, type Tool } from "@/lib/services/drawing";
  import { GPU } from "@/lib/services/web-gpu";

  type RGB = [number, number, number];

  let gpu = $state<GPU | null>(null);

  let isPlaying = $state(false);

  let windDirection = $state(0);
  let tool = $state<Tool>(Tools.Pencil);
  let toolColor = $state<RGB>([50, 20, 30]);
  let toolSize = $state(10);
  let toolOpacity = $state(1);

  onMount(async () => {
    gpu = await new GPU().init();
  });
</script>

<main>
  <FileControls
    {isPlaying}
    {windDirection}
    onPlayToggled={(play) => (isPlaying = play)}
  />
  <DrawingControls
    {tool}
    {toolColor}
    {toolSize}
    {toolOpacity}
    onToolChange={(newTool) => (tool = newTool)}
    onToolColorChange={(color) => (toolColor = color)}
    onToolSizeChange={(size) => (toolSize = size)}
    onToolOpacityChange={(opacity) => (toolOpacity = opacity)}
  />
  {#if gpu !== null}
    <Canvas
      {gpu}
      {isPlaying}
      {tool}
      {toolColor}
      {toolSize}
      {toolOpacity}
      onReady={() => (isPlaying = true)}
      onWindDirectionChange={(updated) => (windDirection = updated)}
    />
  {/if}
</main>
