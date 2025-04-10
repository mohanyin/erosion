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
    HeightStateA: 1,
    HeightStateB: 2,
    WindDirection: 3,
    WaterSourceLocation: 4,
    WaterSourceHeight: 5,
    WaterStateA: 6,
    WaterStateB: 7,
  } as const;

  let step = 0; // Track how many simulation steps have been run
  let updateInterval: number;
  let windDirectionRad = Simulation.pickRandomDirection();

  onMount(async () => {
    const gpu = new GPU();
    await gpu.init();
    gpu.setupGPUCanvasRendering(canvas);

    const gridSizeBuffer = gpu.createUniformBuffer({
      binding: Bindings.GridSize,
      visibility:
        GPUShaderStage.VERTEX |
        GPUShaderStage.FRAGMENT |
        GPUShaderStage.COMPUTE,
      readonly: true,
      data: new Float32Array([GRID_SIZE, GRID_SIZE]),
      label: "Grid Size",
    });

    const windDirection = new Float32Array([0.0, 1.0]);
    const windDirectionBuffer = gpu.createUniformBuffer({
      binding: Bindings.WindDirection,
      visibility: GPUShaderStage.COMPUTE,
      readonly: true,
      data: windDirection,
      label: "Wind Direction",
    });

    const waterSourceLocation = Simulation.pickRandomPointOnEdge(GRID_SIZE);
    const waterSourceLocationBuffer = gpu.createUniformBuffer({
      binding: Bindings.WaterSourceLocation,
      visibility: GPUShaderStage.COMPUTE,
      readonly: true,
      data: waterSourceLocation,
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
      attributes: [
        {
          format: "float32x2" as GPUVertexFormat,
          offset: 0,
          shaderLocation: 0,
        },
      ],
    });

    const cellStateArray = new Float32Array(GRID_SIZE * GRID_SIZE);
    const cellStateStorage = [
      gpu.createStorageBuffer({
        data: cellStateArray,
        label: "Height State A",
        binding: (step: number) =>
          step % 2 === 0 ? Bindings.HeightStateA : Bindings.HeightStateB,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        readonly: true,
      }),
      gpu.createStorageBuffer({
        data: cellStateArray,
        label: "Height State B",
        binding: (step: number) =>
          step % 2 === 0 ? Bindings.HeightStateB : Bindings.HeightStateA,
        visibility: GPUShaderStage.COMPUTE,
        readonly: false,
      }),
    ];

    for (let i = 0; i < cellStateArray.length; ++i) {
      cellStateArray[i] = Math.random() * MAXIMUM_HEIGHT;
    }
    gpu.device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

    const waterSourceIndex =
      waterSourceLocation[0] + waterSourceLocation[1] * GRID_SIZE;
    let waterSourceHeight = new Float32Array([300]);
    const waterSourceHeightBuffer = gpu.createUniformBuffer({
      data: waterSourceHeight,
      label: "Water Source Height",
      binding: Bindings.WaterSourceHeight,
      visibility: GPUShaderStage.COMPUTE,
      readonly: true,
    });
    const waterStateArray = new Int32Array(GRID_SIZE * GRID_SIZE);
    waterStateArray[waterSourceIndex] = 1;
    gpu.createStorageBuffer({
      data: waterStateArray,
      label: "Water State A",
      binding: (step: number) =>
        step % 2 === 0 ? Bindings.WaterStateA : Bindings.WaterStateB,
      visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
      readonly: true,
    });
    gpu.createStorageBuffer({
      data: waterStateArray,
      label: "Water State B",
      binding: (step: number) =>
        step % 2 === 0 ? Bindings.WaterStateB : Bindings.WaterStateA,
      visibility: GPUShaderStage.COMPUTE,
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

    const bindGroupLayout = gpu.device.createBindGroupLayout({
      label: "Cell Bind Group Layout",
      entries: gpu.getBindGroupLayout(),
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
        buffers: gpu.getVertexBufferLayout(),
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
        entries: gpu.getBindGroupEntries(0),
      }),
      gpu.device.createBindGroup({
        label: "Cell renderer bind group B",
        layout: bindGroupLayout,
        entries: gpu.getBindGroupEntries(1),
      }),
    ];

    function updateGrid() {
      windDirectionRad = Simulation.randomlyNudgeValue(
        windDirectionRad,
        WIND_DIRECTION_VARIABILITY,
      );
      const windDirection = Simulation.convertRadiansToVector(windDirectionRad);
      gpu.device.queue.writeBuffer(windDirectionBuffer, 0, windDirection);

      waterSourceHeight = new Float32Array([waterSourceHeight[0] - 0.2]);
      gpu.device.queue.writeBuffer(
        waterSourceHeightBuffer,
        0,
        waterSourceHeight,
      );

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
