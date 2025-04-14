<script lang="ts">
  import { onMount } from "svelte";
  import { SimulationGPU } from "@/lib/services/web-gpu";
  import Utils, { throttle } from "@/lib/services/utils";
  import simulationShader from "@/lib/shaders/compute/simulation.wgsl?raw";
  import cellShader from "@/lib/shaders/cell.wgsl?raw";
  import { Bindings, Simulation } from "@/lib/services/simulation.svelte";
  import Canvas from "@/lib/components/Canvas.svelte";

  const UPDATE_INTERVAL = 50;
  const WORKGROUP_SIZE = 8;
  const MAXIMUM_HEIGHT = 1000;
  const WIND_DIRECTION_VARIABILITY = 0.4;

  let canvas: HTMLCanvasElement | null = $state(null);
  let simulation: Simulation | null = $state(null);
  let step = $state(0);
  let windDirectionRad = $state(Utils.pickRandomDirection());
  let windDirectionBuffer: GPUBuffer | null = null;
  let waterSourceHeight = $state(new Float32Array([300]));
  let waterSourceHeightBuffer: GPUBuffer | null = null;
  let waterSourceLocation = $state(new Int32Array([0, 0]));
  let vertices = Utils.getVerticesForSquare();
  let vertexBuffer: GPUBuffer | null = null;

  let brushLocation: Float32Array = $state(new Float32Array([-1, -1]));
  let brushLocationBuffer: GPUBuffer | null = null;

  let gpu: SimulationGPU | null = $state(null);

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

    const cellStateArray = new Float32Array(simulation.gridCellCount);
    const [heightStateA, _] =
      simulation.createHeightStateBuffers(cellStateArray);

    for (let i = 0; i < cellStateArray.length; ++i) {
      cellStateArray[i] = Math.random() * MAXIMUM_HEIGHT;
    }
    // todo just initialize this first?
    gpu.device.queue.writeBuffer(heightStateA, 0, cellStateArray);

    waterSourceHeightBuffer =
      simulation.createWaterSourceHeightBuffer(waterSourceHeight);
    const waterSourceIndex =
      waterSourceLocation[0] + waterSourceLocation[1] * simulation.gridSize[0];
    const waterStateArray = new Int32Array(simulation.gridCellCount);
    waterStateArray[waterSourceIndex] = 1;
    simulation.createWaterStateBuffers(waterStateArray);

    brushLocationBuffer = gpu.createStorageBuffer({
      data: brushLocation,
      label: "Brush location",
      binding: Bindings.BrushLocation,
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
      readonly: false,
    });

    const simulationShaderModule = gpu.createShaderModule(
      { code: simulationShader },
      { WORKGROUP_SIZE: WORKGROUP_SIZE.toString(), ...Bindings },
    );

    const cellShaderModule = gpu.createShaderModule(
      { code: cellShader },
      { MAX_HEIGHT: MAXIMUM_HEIGHT.toString(), ...Bindings },
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
    const workgroupCount = Math.ceil(simulation!.gridSize[0] / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
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

  function onBrushMove(location: Float32Array | null) {
    if (location) {
      const remappedLocation = new Float32Array([
        (location[0] / canvas!.width) * simulation!.gridSize[0],
        simulation!.gridSize[1] -
          (location[1] / canvas!.height) * simulation!.gridSize[1],
      ]);
      brushLocation = remappedLocation;
      isDrawing = true;
    } else {
      brushLocation = new Float32Array([-1, -1]);
      isDrawing = false;
    }
    if (gpu && brushLocationBuffer) {
      gpu.writeToBuffer(brushLocationBuffer, brushLocation);
    }
  }
</script>

<main>
  <Canvas {onBrushMove} bind:canvas></Canvas>
  <div>Step: {step}</div>
  <div style="transform: rotate({windDirectionRad}rad);" class="wind-direction">
    {"->"}
  </div>
  <div>
    <button onclick={() => (isPlaying = false)}>Pause</button>
    <button onclick={() => (isPlaying = true)}>Play</button>
  </div>
</main>

<style>
  .wind-direction {
    display: inline-block;
  }
</style>
