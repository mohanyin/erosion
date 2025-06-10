<script lang="ts">
  import { onMount } from "svelte";

  import {
    CurveInterpolator,
    MAX_SEGMENTS,
  } from "@/lib/services/curve-intepolator";
  import { type Tool } from "@/lib/services/drawing";
  import GPUMemory from "@/lib/services/gpu-memory";
  import ShaderAnalyzer from "@/lib/services/shader-analyzer";
  import { ShaderModuleBuilder } from "@/lib/services/shader-module";
  import { Simulation, WORKGROUP_SIZE } from "@/lib/services/simulation.svelte";
  import utils from "@/lib/services/utils";
  import { Bindings, GPU } from "@/lib/services/web-gpu";
  import drawingShader from "@/lib/shaders/compute/drawing.wgsl?raw";
  import preSimulationShader from "@/lib/shaders/compute/pre-simulation.wgsl?raw";
  import simulationShader from "@/lib/shaders/compute/simulation.wgsl?raw";
  import shaderUtils from "@/lib/shaders/compute/utils.wgsl?raw";
  import waterSimulationShader from "@/lib/shaders/compute/water-simulation.wgsl?raw";
  import drawShader from "@/lib/shaders/draw.wgsl?raw";

  type RGB = [number, number, number];

  const WIND_DIRECTION_VARIABILITY = 0.1;
  const TOOL_LOCATION_BUFFER_SIZE = 4 * (MAX_SEGMENTS + 1);

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

  const simulation = new Simulation(gpu);
  let renderPipeline: GPURenderPipeline | null = $state(null);
  let computePipelines: Record<string, GPUComputePipeline> | null =
    $state(null);

  const shaderModuleBuilder = new ShaderModuleBuilder(shaderUtils, {
    WORKGROUP_SIZE,
    ...Bindings,
  });
  const preSimulationShaderModule =
    shaderModuleBuilder.build(preSimulationShader);
  const simulationShaderModule = shaderModuleBuilder.build(simulationShader);
  const waterSimulationShaderModule = shaderModuleBuilder.build(
    waterSimulationShader,
  );
  const drawingShaderModule = shaderModuleBuilder.build(drawingShader);
  const drawShaderModule = shaderModuleBuilder.build(drawShader);

  const shaderAnalyzer = new ShaderAnalyzer({
    preSimulation: preSimulationShaderModule,
    simulation: simulationShaderModule,
    waterSimulation: waterSimulationShaderModule,
    drawing: drawingShaderModule,
    draw: drawShaderModule,
  });
  const gpuMemory = new GPUMemory(shaderAnalyzer, gpu.device);

  let step = 0;

  const windDirection = gpuMemory.createBuffer<number>(
    Bindings.WindDirection,
    new Float32Array([Math.random() * 2 * Math.PI]),
  );

  let waterSourceHeight = $state(new Float32Array([0.01]));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let waterSourceHeightBuffer: GPUBuffer | null = null;
  let waterSourceLocation = $state(new Int32Array([-1, -1]));
  const vertices = utils.getVerticesForSquare();

  /**
   * BUFFERS
   */
  const vertexBuffer: GPUBuffer = gpuMemory.createVertexBuffer({
    data: vertices,
    label: "Cell vertices",
  });

  const tool = gpuMemory.createBuffer<number>(
    Bindings.Tool,
    new Int32Array([rawTool]),
  );
  $effect(() => tool.setScalar(rawTool));

  const toolLocation = gpuMemory.createBuffer<Float32Array>(
    Bindings.ToolLocation,
    new Float32Array(TOOL_LOCATION_BUFFER_SIZE).fill(-1.0),
  );

  const toolColor = gpuMemory.createBuffer<Float32Array>(
    Bindings.ToolColor,
    new Float32Array(rawToolColor),
  );
  $effect(() => toolColor.set(new Float32Array(rawToolColor)));

  const toolSize = gpuMemory.createBuffer<Float32Array>(
    Bindings.ToolSize,
    new Float32Array([rawToolSize]),
  );
  $effect(() => toolSize.setScalar(rawToolSize));

  const toolOpacity = gpuMemory.createBuffer<Float32Array>(
    Bindings.ToolOpacity,
    new Float32Array([rawToolOpacity]),
  );
  $effect(() => toolOpacity.setScalar(rawToolOpacity));

  gpuMemory.createBuffer(
    Bindings.GridSize,
    new Float32Array(simulation.gridSize),
  );

  gpuMemory.createBuffer(Bindings.WaterSourceLocation, waterSourceLocation);
  gpuMemory.createBuffer(Bindings.WaterSourceHeight, waterSourceHeight);

  const waterSourceIndex =
    waterSourceLocation[0] + waterSourceLocation[1] * simulation.gridSize[0];
  const waterStateArray = new Int32Array(simulation.gridCellCount);
  waterStateArray[waterSourceIndex] = 1;
  gpuMemory.createBuffer(
    () => (step % 2 === 0 ? Bindings.WaterStateA : Bindings.WaterStateB),
    waterStateArray,
  );
  gpuMemory.createBuffer(
    () => (step % 2 === 0 ? Bindings.WaterStateB : Bindings.WaterStateA),
    waterStateArray,
  );
  gpuMemory.createBuffer(
    () => (step % 2 === 0 ? Bindings.ColorsA : Bindings.ColorsB),
    new Float32Array(simulation.gridCellCount * 4).fill(255.0),
  );
  gpuMemory.createBuffer(
    () => (step % 2 === 0 ? Bindings.ColorsB : Bindings.ColorsA),
    new Float32Array(simulation.gridCellCount * 4).fill(255.0),
  );
  gpuMemory.createBuffer(
    Bindings.MovedMaterial,
    new Float32Array(simulation.gridCellCount * 4).fill(-1.0),
  );

  onMount(() => {
    setupSimulation();
    onReady();
  });

  function setupSimulation() {
    gpu.setupGPUCanvasRendering(canvas);

    const { render, compute } = simulation.finalizePipelines({
      label: "Simulation",
      compute: {
        preSimulation: {
          module: preSimulationShaderModule.finalize(gpu.device),
          entryPoint: "computeMain",
        },
        simulation: {
          module: simulationShaderModule.finalize(gpu.device),
          entryPoint: "computeMain",
        },
        waterSimulation: {
          module: waterSimulationShaderModule.finalize(gpu.device),
          entryPoint: "computeMain",
        },
        drawing: {
          module: drawingShaderModule.finalize(gpu.device),
          entryPoint: "computeMain",
        },
      },
      vertex: {
        module: drawShaderModule.finalize(gpu.device),
        entryPoint: "vertexMain",
        buffers: gpuMemory.getVertexBufferLayout(),
      },
      fragment: {
        module: drawShaderModule.finalize(gpu.device),
        entryPoint: "fragmentMain",
        targets: [{ format: gpu.format! }],
      },
      bindGroupLayout: gpuMemory.createBindGroupLayout(
        gpu.device,
        "Simulation Bind Group",
      ),
    });
    renderPipeline = render;
    computePipelines = compute;

    return gpu;
  }

  function updateGrid() {
    if (!renderPipeline) {
      throw new Error("GPU not initialized");
    }

    const updatedWindDirection =
      utils.randomlyNudgeValue(
        windDirection.scalar!,
        WIND_DIRECTION_VARIABILITY,
      ) %
      (2 * Math.PI);
    windDirection.setScalar(updatedWindDirection);
    onWindDirectionChange(updatedWindDirection);

    // waterSourceHeight = new Float32Array([waterSourceHeight[0] - 0.2]);
    // gpu.writeToBuffer(waterSourceHeightBuffer!, waterSourceHeight);

    const encoder = gpu.device.createCommandEncoder();
    const bindGroup = gpuMemory.createBindGroup(
      gpu.device,
      "Simulation Bind Group",
    );

    if (isPlaying) {
      const simulationBindGroup = bindGroup;
      simulation.dispatchComputePass(
        computePipelines!["preSimulation"],
        encoder,
        simulationBindGroup,
      );
      simulation.dispatchComputePass(
        computePipelines!["waterSimulation"],
        encoder,
        simulationBindGroup,
      );
      simulation.dispatchComputePass(
        computePipelines!["simulation"],
        encoder,
        simulationBindGroup,
      );
    }

    // TODO: DON'T OVERWRITE EROSION
    const currentBindGroup = bindGroup;
    simulation.dispatchComputePass(
      computePipelines!["drawing"],
      encoder,
      currentBindGroup,
    );

    step++;

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpu.context!.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0.0, a: 1.0 },
          storeOp: "store",
        },
      ],
    });

    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(vertices.length / 2, simulation!.gridCellCount);

    pass.end();
    gpu.device.queue.submit([encoder.finish()]);
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
    if (!canvas || !isDrawing) {
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
    toolLocation.set(new Float32Array(locations));
  }

  function cancelDrawing() {
    isDrawing = false;
    curveInterpolator.reset();
    toolLocation.set(new Float32Array(TOOL_LOCATION_BUFFER_SIZE).fill(-1.0));
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
