<script lang="ts">
  import { onMount } from "svelte";

  import Canvas from "@/lib/components/Canvas.svelte";
  import DrawingControls from "@/lib/components/DrawingControls.svelte";
  import FileControls from "@/lib/components/FileControls.svelte";
  import { Tools, type Tool } from "@/lib/services/drawing";
  import { GPU } from "@/lib/services/web-gpu";

  let gpu = $state<GPU | null>(null);

  let isPlaying = $state(false);

  let windDirection = $state(0);
  let tool = $state<Tool>(Tools.Pencil);
  let toolColor = $state<Float32Array>(new Float32Array([0, 0, 0]));
  let toolSize = $state<Float32Array>(new Float32Array([10]));
  let toolOpacity = $state<Float32Array>(new Float32Array([1]));

  onMount(async () => {
    gpu = await new GPU().init();
  });
</script>

<main>
  <FileControls
    {isPlaying}
    {windDirection}
    onPlayToggled={(play: boolean) => (isPlaying = play)}
  />
  <DrawingControls
    {tool}
    {toolColor}
    {toolSize}
    {toolOpacity}
    onToolChange={(newTool: Tool) => (tool = newTool)}
    onToolColorChange={(color: Float32Array) => (toolColor = color)}
    onToolSizeChange={(size: Float32Array) => (toolSize = size)}
    onToolOpacityChange={(opacity: Float32Array) => (toolOpacity = opacity)}
  />
  {#if gpu !== null}
    <Canvas {gpu}></Canvas>
  {/if}
</main>
