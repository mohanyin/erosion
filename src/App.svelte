<script lang="ts">
  import { onMount } from "svelte";
  import { SimulationGPU, Bindings } from "@/lib/services/web-gpu";
  import Utils from "@/lib/services/utils";
  import simulationShader from "@/lib/shaders/compute/simulation.wgsl?raw";
  import cellShader from "@/lib/shaders/cell.wgsl?raw";
  import { Simulation } from "@/lib/services/simulation.svelte";
  import { Drawing, Tools } from "@/lib/services/drawing";
  import Canvas from "@/lib/components/Canvas.svelte";
  import FileControls from "@/lib/components/FileControls.svelte";
  import DrawingControls from "@/lib/components/DrawingControls.svelte";

  const UPDATE_INTERVAL = 50;
  const WORKGROUP_SIZE = 8;
  const WIND_DIRECTION_VARIABILITY = 0.1;

  let canvas: HTMLCanvasElement | null = $state(null);
  let gpu: SimulationGPU | null = $state(null);
  let simulation: Simulation | null = $state(null);
  let drawing: Drawing | null = $state(null);

  let step = $state(0);
  let windDirectionRad = $state(Utils.pickRandomDirection());
  let windDirectionBuffer: GPUBuffer | null = null;
  let waterSourceHeight = $state(new Float32Array([0.01]));
  let waterSourceHeightBuffer: GPUBuffer | null = null;
  let waterSourceLocation = $state(new Int32Array([-1, -1]));
  let vertices = Utils.getVerticesForSquare();
  let vertexBuffer: GPUBuffer | null = null;

  let tool = $state(Tools.Pencil);
  let toolBuffer: GPUBuffer | null = null;
  let toolLocation: Float32Array = $state(new Float32Array([-1, -1]));
  let toolLocationBuffer: GPUBuffer | null = null;
  let toolColor: Float32Array = $state(new Float32Array([35, 25, 100]));
  let toolColorBuffer: GPUBuffer | null = null;
  let toolSize: Float32Array = $state(new Float32Array([24]));
  let toolSizeBuffer: GPUBuffer | null = null;
  let toolOpacity: Float32Array = $state(new Float32Array([0.6]));
  let toolOpacityBuffer: GPUBuffer | null = null;

  onMount(async () => {
    await setupSimulation();
    isPlaying = true;
  });

  async function setupSimulation(): Promise<SimulationGPU> {
    gpu = new SimulationGPU();
    await gpu.init();
    gpu.setupGPUCanvasRendering(canvas!);

    simulation = new Simulation(gpu);
    simulation.createGridSizeBuffer();

    const windDirection = new Float32Array([0.0, 1.0]);
    windDirectionBuffer = simulation.createWindDirectionBuffer(windDirection);

    simulation.createWaterSourceLocationBuffer(waterSourceLocation);

    vertexBuffer = gpu.createVertexBuffer({
      data: vertices,
      label: "Cell vertices",
      attributes: [
        {
          format: "float32x2" as GPUVertexFormat,
          offset: 0,
          shaderLocation: 0,
        },
      ],
    });

    const cellStateArray = new Float32Array(simulation.gridCellCount * 3).fill(
      255,
    );
    simulation.createColorBuffers(cellStateArray);

    waterSourceHeightBuffer =
      simulation.createWaterSourceHeightBuffer(waterSourceHeight);
    const waterSourceIndex =
      waterSourceLocation[0] + waterSourceLocation[1] * simulation.gridSize[0];
    const waterStateArray = new Int32Array(simulation.gridCellCount);
    waterStateArray[waterSourceIndex] = 1;
    simulation.createWaterStateBuffers(waterStateArray);

    drawing = new Drawing(gpu);
    toolBuffer = drawing.createToolBuffer(new Int32Array([tool]));
    toolLocationBuffer = drawing.createToolLocationBuffer(toolLocation);
    toolColorBuffer = drawing.createToolColorBuffer(toolColor);
    toolSizeBuffer = drawing.createToolSizeBuffer(toolSize);
    toolOpacityBuffer = drawing.createToolOpacityBuffer(toolOpacity);

    const simulationShaderModule = gpu.createShaderModule(
      { code: simulationShader },
      { WORKGROUP_SIZE: WORKGROUP_SIZE.toString(), ...Bindings },
    );

    const cellShaderModule = gpu.createShaderModule(
      { code: cellShader },
      { ...Bindings },
    );

    gpu.finalizePipelines({
      label: "Simulation",
      compute: {
        module: simulationShaderModule,
        entryPoint: "computeMain",
      },
      vertex: {
        module: cellShaderModule,
        entryPoint: "vertexMain",
        buffers: gpu.getVertexBufferLayout(),
      },
      fragment: {
        module: cellShaderModule,
        entryPoint: "fragmentMain",
        targets: [{ format: gpu.format! }],
      },
    });

    return gpu;
  }

  const bindGroups = $derived.by(() => {
    if (!gpu) {
      return [];
    }

    const bindGroupLayout = gpu.device.createBindGroupLayout({
      label: "Simulation Bind Group Layout",
      entries: gpu.getBindGroupLayout(),
    });

    return [
      gpu.device.createBindGroup({
        label: "Simulation render bind group A",
        layout: bindGroupLayout,
        entries: gpu.getBindGroupEntries(0),
      }),
      gpu.device.createBindGroup({
        label: "Simulation render bind group B",
        layout: bindGroupLayout,
        entries: gpu.getBindGroupEntries(1),
      }),
    ];
  });

  function updateGrid() {
    if (!gpu || !gpu.computePipeline || !gpu.renderPipeline) {
      console.log("GPU not initialized");
      return;
    }

    windDirectionRad = Utils.randomlyNudgeValue(
      windDirectionRad,
      WIND_DIRECTION_VARIABILITY,
    );
    const windDirection = Utils.convertRadiansToVector(windDirectionRad);
    gpu.writeToBuffer(windDirectionBuffer!, windDirection);

    // waterSourceHeight = new Float32Array([waterSourceHeight[0] - 0.2]);
    // gpu.writeToBuffer(waterSourceHeightBuffer!, waterSourceHeight);

    const encoder = gpu.device.createCommandEncoder();
    const computePass = encoder.beginComputePass();

    computePass.setPipeline(gpu.computePipeline!);
    computePass.setBindGroup(0, bindGroups[step % 2]);
    computePass.dispatchWorkgroups(
      Math.ceil(simulation!.gridSize[0] / WORKGROUP_SIZE),
      Math.ceil(simulation!.gridSize[1] / WORKGROUP_SIZE),
    );
    computePass.end();

    step++; // Increment the step count

    // Start a render pass
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: gpu.context!.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 },
          storeOp: "store",
        },
      ],
    });

    // Draw the grid.
    pass.setPipeline(gpu.renderPipeline!);
    pass.setBindGroup(0, bindGroups[step % 2]);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(vertices.length / 2, simulation!.gridCellCount);

    // End the render pass and submit the command buffer
    pass.end();
    gpu.device.queue.submit([encoder.finish()]);
  }

  let isDrawing = $state(false);
  let isPlaying = $state(false);

  let shouldPlay = $derived(isDrawing || isPlaying);
  let updateInterval: number | null = $state(null);

  $effect(() => {
    if (shouldPlay) {
      if (!updateInterval) {
        updateInterval = setInterval(updateGrid, UPDATE_INTERVAL);
      }
    } else {
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
    }
  });

  function onToolMove(location: Float32Array | null) {
    if (location) {
      const remappedLocation = new Float32Array([
        (location[0] / canvas!.clientWidth) * simulation!.gridSize[0],
        simulation!.gridSize[1] -
          (location[1] / canvas!.clientHeight) * simulation!.gridSize[1],
      ]);
      toolLocation = remappedLocation;
      isDrawing = true;
    } else {
      toolLocation = new Float32Array([-1, -1]);
      isDrawing = false;
    }
    if (gpu && toolLocationBuffer) {
      gpu.writeToBuffer(toolLocationBuffer, toolLocation);
    }
  }

  function onToolColorChange(color: Float32Array) {
    toolColor = color;
    if (gpu && toolColorBuffer) {
      gpu.writeToBuffer(toolColorBuffer, toolColor);
    }
  }

  function onToolSizeChange(size: Float32Array) {
    toolSize = size;
    if (gpu && toolSizeBuffer) {
      gpu.writeToBuffer(toolSizeBuffer, toolSize);
    }
  }

  function onToolOpacityChange(opacity: Float32Array) {
    toolOpacity = opacity;
    if (gpu && toolOpacityBuffer) {
      gpu.writeToBuffer(toolOpacityBuffer, toolOpacity);
    }
  }
</script>

<main>
  <FileControls
    {isPlaying}
    windDirection={windDirectionRad}
    onPlayToggled={(play: boolean) => (isPlaying = play)}
  />
  <DrawingControls
    {toolColor}
    {toolSize}
    {toolOpacity}
    {onToolColorChange}
    {onToolSizeChange}
    {onToolOpacityChange}
  />
  <Canvas {onToolMove} bind:canvas></Canvas>
</main>
