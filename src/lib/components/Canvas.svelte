<script lang="ts">
  import { onMount } from "svelte";

  import {
    CurveInterpolator,
    MAX_SEGMENTS,
  } from "@/lib/services/curve-intepolator";
  import { type Tool } from "@/lib/services/drawing";
  import {
    Simulation,
    TOOL_LOCATION_BUFFER_SIZE,
  } from "@/lib/services/simulation.svelte";
  import utils from "@/lib/services/utils";
  import { GPU } from "@/lib/services/web-gpu";

  type RGB = [number, number, number];

  const WIND_DIRECTION_VARIABILITY = 0.1;

  interface Props {
    gpu: GPU;
    isPlaying: boolean;
    tool: Tool;
    toolColor: RGB;
    toolSize: number;
    toolOpacity: number;
    onReady: () => void;
    onWindDirectionChange: (windDirection: number) => void;
  }

  const {
    gpu,
    isPlaying,
    tool: rawTool,
    toolColor: rawToolColor,
    toolSize: rawToolSize,
    toolOpacity: rawToolOpacity,
    onReady,
    onWindDirectionChange,
  }: Props = $props();

  let canvas: HTMLCanvasElement;

  let simulation: Simulation | null = $state(null);

  $effect(() => simulation?.computeBuffers.tool.setScalar(rawTool));
  $effect(() => {
    simulation?.computeBuffers.toolColor.set(new Float32Array(rawToolColor));
  });
  $effect(() => simulation?.computeBuffers.toolSize.setScalar(rawToolSize));
  $effect(() =>
    simulation?.computeBuffers.toolOpacity.setScalar(rawToolOpacity),
  );
  let windDirection = $state(Math.random() * 2 * Math.PI);
  $effect(() =>
    simulation?.computeBuffers.windDirection.setScalar(windDirection),
  );

  onMount(() => {
    gpu.setupGPUCanvasRendering(canvas);
    simulation = new Simulation(gpu);
    onReady();
  });

  function updateGrid() {
    if (!simulation) {
      return;
    }

    windDirection =
      utils.randomlyNudgeValue(windDirection, WIND_DIRECTION_VARIABILITY) %
      (2 * Math.PI);
    onWindDirectionChange(windDirection);

    // waterSourceHeight = new Float32Array([waterSourceHeight[0] - 0.2]);
    // gpu.writeToBuffer(waterSourceHeightBuffer!, waterSourceHeight);

    simulation.computeAndRender(isPlaying);
  }

  let isDrawing = $state(false);

  let shouldPlay = $derived(isDrawing || isPlaying);
  let animationFrameId: number | null = $state(null);

  function play() {
    animationFrameId = requestAnimationFrame(() => {
      updateGrid();
      play();
    });
  }

  $effect(() => {
    if (shouldPlay) {
      if (!animationFrameId) {
        play();
      }
    } else {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    }
  });

  const curveInterpolator = new CurveInterpolator();

  function startDrawing(event: PointerEvent) {
    isDrawing = true;
    setToolLocation(event);
  }

  function onPointerEnter(event: PointerEvent) {
    // "1" means primary button (left mouse button)
    if (event.buttons === 1) {
      startDrawing(event);
    }
  }

  function setToolLocation(event: MouseEvent) {
    if (!canvas || !isDrawing || !simulation) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const remappedLocation = [
      (x / canvas!.clientWidth) * simulation!.gridSize[0],
      simulation!.gridSize[1] -
        (y / canvas!.clientHeight) * simulation!.gridSize[1],
    ];

    curveInterpolator.addControlPoint(remappedLocation);
    const newPoints = curveInterpolator.getNewestPoints();
    const locations = [
      ...newPoints.flat(),
      ...new Array(4 * (MAX_SEGMENTS + 1 - newPoints.length)).fill(-1.0),
    ];
    simulation.computeBuffers.toolLocation.set(new Float32Array(locations));
  }

  function cancelDrawing() {
    isDrawing = false;
    curveInterpolator.reset();
    simulation?.computeBuffers.toolLocation.set(
      new Float32Array(TOOL_LOCATION_BUFFER_SIZE).fill(-1.0),
    );
  }
</script>

<canvas
  id="canvas"
  class="canvas"
  bind:this={canvas}
  onpointerdown={startDrawing}
  onpointermove={setToolLocation}
  onpointerup={cancelDrawing}
  onpointerenter={onPointerEnter}
  onpointerleave={cancelDrawing}
></canvas>

<style lang="scss">
  .canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
  }
</style>
