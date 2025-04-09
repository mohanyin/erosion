<script lang="ts">
  import { onMount } from "svelte";
  import { GPU } from "@/lib/services/web-gpu";
  import Simulation from "@/lib/services/simulation";
  import simulationShader from "@/lib/shaders/compute/simulation.wgsl?raw";
  import cellShader from "@/lib/shaders/cell.wgsl?raw";

  let canvas: HTMLCanvasElement;

  const GRID_SIZE = 100;
  const UPDATE_INTERVAL = 50;
  const WORKGROUP_SIZE = 8;
  const MAXIMUM_HEIGHT = 1000;
  const WIND_DIRECTION_VARIABILITY = 0.4;

  const Bindings = {
    GridSize: 0,
    CellStateA: 1,
    CellStateB: 2,
    WindDirection: 3,
    WaterSourceLocation: 4,
  } as const;

  let step = 0; // Track how many simulation steps have been run
  let updateInterval: number;
  let windDirectionRad = Simulation.pickRandomDirection();

  onMount(async () => {
    const gpu = new GPU();
    await gpu.init();
    gpu.setupGPUCanvasRendering(canvas);

    const gridSizeBuffer = gpu.createUniformBuffer({
      data: new Float32Array([GRID_SIZE, GRID_SIZE]),
      label: "Grid Size",
    });

    const windDirection = new Float32Array([0.0, 1.0]);
    const windDirectionBuffer = gpu.createUniformBuffer({
      data: windDirection,
      label: "Wind Direction",
    });

    const waterSourceLocationBuffer = gpu.createUniformBuffer({
      data: Simulation.pickRandomPointOnEdge(GRID_SIZE),
      label: "Water Source Location",
    });

    const vertices = new Float32Array([
      //   X,    Y,
      -1,
      -1, // Triangle 1 (Blue)
      1,
      -1,
      1,
      1,

      -1,
      -1, // Triangle 2 (Red)
      1,
      1,
      -1,
      1,
    ]);

    const vertexBuffer = gpu.createVertexBuffer({
      data: vertices,
      label: "Cell vertices",
    });

    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 8,
      attributes: [
        {
          format: "float32x2" as GPUVertexFormat,
          offset: 0,
          shaderLocation: 0, // Position, see vertex shader
        },
      ],
    };

    const cellStateArray = new Float32Array(GRID_SIZE * GRID_SIZE);
    const cellStateStorage = [
      gpu.createStorageBuffer({
        data: cellStateArray,
        label: "Cell State A",
      }),
      gpu.createStorageBuffer({
        data: cellStateArray,
        label: "Cell State B",
      }),
    ];

    for (let i = 0; i < cellStateArray.length; ++i) {
      cellStateArray[i] = Math.random() * MAXIMUM_HEIGHT;
    }
    gpu.device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

    const simulationShaderModule = gpu.createShaderModule(
      { code: simulationShader },
      { WORKGROUP_SIZE: WORKGROUP_SIZE.toString(), ...Bindings },
    );

    const cellShaderModule = gpu.createShaderModule(
      { code: cellShader },
      { MAX_HEIGHT: MAXIMUM_HEIGHT.toString(), ...Bindings },
    );

    const bindGroupLayout = gpu.device.createBindGroupLayout({
      label: "Cell Bind Group Layout",
      entries: [
        {
          binding: Bindings.GridSize,
          visibility:
            GPUShaderStage.VERTEX |
            GPUShaderStage.COMPUTE |
            GPUShaderStage.FRAGMENT,
          buffer: {},
        },
        {
          binding: Bindings.CellStateA,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: Bindings.CellStateB,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: Bindings.WindDirection,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        {
          binding: Bindings.WaterSourceLocation,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
      ],
    });

    const pipelineLayout = gpu.device.createPipelineLayout({
      label: "Cell Pipeline Layout",
      bindGroupLayouts: [bindGroupLayout],
    });

    const simulationPipeline = gpu.device.createComputePipeline({
      label: "Simulation pipeline",
      layout: pipelineLayout,
      compute: {
        module: simulationShaderModule,
        entryPoint: "computeMain",
      },
    });

    const cellPipeline = gpu.device.createRenderPipeline({
      label: "Cell pipeline",
      layout: pipelineLayout,
      vertex: {
        module: cellShaderModule,
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout],
      },
      fragment: {
        module: cellShaderModule,
        entryPoint: "fragmentMain",
        targets: [
          {
            format: gpu.format!,
          },
        ],
      },
    });

    const bindGroups = [
      gpu.device.createBindGroup({
        label: "Cell renderer bind group A",
        layout: bindGroupLayout,
        entries: [
          {
            binding: Bindings.GridSize,
            resource: { buffer: gridSizeBuffer },
          },
          {
            binding: Bindings.CellStateA,
            resource: { buffer: cellStateStorage[0] },
          },
          {
            binding: Bindings.CellStateB,
            resource: { buffer: cellStateStorage[1] },
          },
          {
            binding: Bindings.WindDirection,
            resource: { buffer: windDirectionBuffer },
          },
          {
            binding: Bindings.WaterSourceLocation,
            resource: { buffer: waterSourceLocationBuffer },
          },
        ],
      }),
      gpu.device.createBindGroup({
        label: "Cell renderer bind group B",
        layout: bindGroupLayout,
        entries: [
          {
            binding: Bindings.GridSize,
            resource: { buffer: gridSizeBuffer },
          },
          {
            binding: Bindings.CellStateA,
            resource: { buffer: cellStateStorage[1] },
          },
          {
            binding: Bindings.CellStateB,
            resource: { buffer: cellStateStorage[0] },
          },
          {
            binding: Bindings.WindDirection,
            resource: { buffer: windDirectionBuffer },
          },
          {
            binding: Bindings.WaterSourceLocation,
            resource: { buffer: waterSourceLocationBuffer },
          },
        ],
      }),
    ];

    function updateGrid() {
      windDirectionRad = Simulation.randomlyNudgeValue(
        windDirectionRad,
        WIND_DIRECTION_VARIABILITY,
      );
      const windDirection = Simulation.convertRadiansToVector(windDirectionRad);
      gpu.device.queue.writeBuffer(windDirectionBuffer, 0, windDirection);

      const encoder = gpu.device.createCommandEncoder();
      const computePass = encoder.beginComputePass();

      computePass.setPipeline(simulationPipeline);
      computePass.setBindGroup(0, bindGroups[step % 2]);
      const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
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
      pass.setPipeline(cellPipeline);
      pass.setBindGroup(0, bindGroups[step % 2]); // Updated!
      pass.setVertexBuffer(0, vertexBuffer);
      pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);

      // End the render pass and submit the command buffer
      pass.end();
      gpu.device.queue.submit([encoder.finish()]);
    }

    updateInterval = setInterval(updateGrid, UPDATE_INTERVAL);
  });

  function pause() {
    clearInterval(updateInterval);
  }
</script>

<main>
  <canvas id="canvas" bind:this={canvas} width="720" height="720"></canvas>
  <div>Step: {step}</div>
  <div style="transform: rotate({windDirectionRad}rad);">{"->"}</div>
  <div>
    <button on:click={pause}>Pause</button>
  </div>
</main>

<style>
</style>
