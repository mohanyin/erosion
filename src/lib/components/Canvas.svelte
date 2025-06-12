<script lang="ts">
  import { onMount } from "svelte";

  import {
    CurveInterpolator,
    MAX_SEGMENTS,
  } from "@/lib/services/curve-intepolator";
  import { type Tool, Tools } from "@/lib/services/drawing";
  import {
    Simulation,
    TOOL_LOCATION_BUFFER_SIZE,
  } from "@/lib/services/simulation.svelte";
  import utils from "@/lib/services/utils";
  import { GPU } from "@/lib/services/web-gpu";

  type RGB = [number, number, number];

  const WIND_DIRECTION_VARIABILITY = 0.01;
  const COLOR_PARAMS_VARIABILITY = 0.01;

  interface Props {
    gpu: GPU;
    isPlaying: boolean;
    image: File | null;
    tool: Tool;
    toolColor: RGB;
    toolSize: number;
    toolOpacity: number;
    onReady: () => void;
    onWindDirectionChange: (windDirection: number) => void;
  }

  let {
    gpu,
    isPlaying,
    image,
    tool,
    toolColor,
    toolSize,
    toolOpacity,
    onReady,
    onWindDirectionChange,
  }: Props = $props();

  let canvas: HTMLCanvasElement;

  let simulation: Simulation | null = $state(null);

  $effect(() => simulation?.computeBuffers.tool.setScalar(tool));
  $effect(() => {
    simulation?.computeBuffers.toolColor.set(new Float32Array(toolColor));
  });
  $effect(() => simulation?.computeBuffers.toolSize.setScalar(toolSize));
  $effect(() => simulation?.computeBuffers.toolOpacity.setScalar(toolOpacity));
  let windDirection = $state(Math.random() * 2 * Math.PI);
  $effect(() =>
    simulation?.computeBuffers.windDirection.setScalar(windDirection),
  );

  let colorParams = $state(
    new Float32Array([
      utils.pickRandomFloat(0.5, 1.5),
      utils.pickRandomFloat(0.5, 1.5),
      utils.pickRandomFloat(0.5, 1.5),
    ]),
  );
  $effect(() => simulation?.computeBuffers.colorParams.set(colorParams));

  $effect(() => {
    if (!image || !simulation) {
      return;
    }

    const imageElement = new Image();
    imageElement.src = URL.createObjectURL(image);
    imageElement.onload = () => {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = simulation!.gridSize[0];
      tempCanvas.height = simulation!.gridSize[1];

      const ctx = tempCanvas.getContext("2d")!;
      ctx.drawImage(imageElement, 0, 0, tempCanvas.width, tempCanvas.height);
      const imageData = ctx.getImageData(
        0,
        0,
        tempCanvas.width,
        tempCanvas.height,
      ).data;
      const bufferData = new Float32Array(imageData.length);
      // Reverse pixels, since the image is flipped
      for (let i = 0; i < imageData.length; i += 4) {
        const index = i / 4;
        const x = index % tempCanvas.width;
        const y = Math.floor(index / tempCanvas.width);
        const invertedY = tempCanvas.height - y - 1;
        const invertedIndex = 4 * (invertedY * tempCanvas.width + x);
        bufferData[i] = imageData[invertedIndex];
        bufferData[i + 1] = imageData[invertedIndex + 1];
        bufferData[i + 2] = imageData[invertedIndex + 2];
        bufferData[i + 3] = imageData[invertedIndex + 3];
      }
      simulation!.computeBuffers.colorsA.set(bufferData);
      simulation!.computeBuffers.colorsB.set(bufferData);
    };
    image = null;
  });

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

    colorParams = new Float32Array([
      utils.clamp(
        utils.randomlyNudgeValue(colorParams[0], COLOR_PARAMS_VARIABILITY),
        0.5,
        1.5,
      ),
      utils.clamp(
        utils.randomlyNudgeValue(colorParams[1], COLOR_PARAMS_VARIABILITY),
        0.5,
        1.5,
      ),
      utils.clamp(
        utils.randomlyNudgeValue(colorParams[2], COLOR_PARAMS_VARIABILITY),
        0.5,
        1.5,
      ),
    ]);
    // waterSourceHeight = new Float32Array([waterSourceHeight[0] - 0.2]);
    // gpu.writeToBuffer(waterSourceHeightBuffer!, waterSourceHeight);

    simulation.computeAndRender(isPlaying);
  }

  let isDrawing = $state(false);

  let shouldPlay = $derived(isDrawing || isPlaying);
  let animationFrameId: number | null = $state(null);

  let cursorLocation = $state<[number, number] | null>(null);
  let cursorStyle = $derived(
    cursorLocation
      ? `
        left: ${cursorLocation[0]}px; 
        top: ${cursorLocation[1]}px; 
        width: ${toolSize * window.devicePixelRatio}px; 
        height: ${toolSize * window.devicePixelRatio}px;
        border-style: ${tool === Tools.WindErosion ? "dashed" : "solid"};
      `
      : "",
  );

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

  function onPointerMove(event: PointerEvent) {
    cursorLocation = [event.clientX, event.clientY];
    setToolLocation(event);
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

  function onPointerLeave() {
    cursorLocation = null;
    cancelDrawing();
  }
</script>

<div>
  <canvas
    id="canvas"
    data-export-target
    class="fixed top-0 left-0 w-full h-full cursor-none"
    width={window.innerWidth + "px"}
    height={window.innerHeight + "px"}
    bind:this={canvas}
    onpointerdown={startDrawing}
    onpointermove={onPointerMove}
    onpointerup={cancelDrawing}
    onpointerenter={onPointerEnter}
    onpointerleave={onPointerLeave}
  ></canvas>
  <div
    class="fixed rounded-full pointer-events-none border-2 border-black translate-x-[-50%] translate-y-[-50%]"
    style={cursorStyle}
  ></div>
</div>
