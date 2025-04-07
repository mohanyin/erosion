<script lang="ts">
  import { onMount } from "svelte";
  import { GPU } from "@/lib/services/web-gpu";
  import simulationShader from "@/lib/shaders/compute/simulation.wgsl?raw";
  import cellShader from "@/lib/shaders/cell.wgsl?raw";

  let canvas: HTMLCanvasElement;

  const GRID_SIZE = 1000;
  const UPDATE_INTERVAL = 200; // Update every 200ms (5 times/sec)
  const WORKGROUP_SIZE = 8;

  let step = 0; // Track how many simulation steps have been run

  onMount(async () => {
    const gpu = new GPU();
    await gpu.init();
    gpu.setupGPUCanvasRendering(canvas);

    // Create a uniform buffer that describes the grid.
    const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
    const uniformBuffer = gpu.createUniformBuffer({
      data: uniformArray,
      label: "Grid Uniforms",
    });

    const vertices = new Float32Array([
      //   X,    Y,
      -0.8,
      -0.8, // Triangle 1 (Blue)
      0.8,
      -0.8,
      0.8,
      0.8,

      -0.8,
      -0.8, // Triangle 2 (Red)
      0.8,
      0.8,
      -0.8,
      0.8,
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

    const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
    // Create two storage buffers to hold the cell state.
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
      cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
    }
    gpu.device!.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

    const simulationShaderModule = gpu.createShaderModule(
      {
        code: simulationShader,
      },
      {
        WORKGROUP_SIZE: WORKGROUP_SIZE.toString(),
      },
    );

    const cellShaderModule = gpu.createShaderModule({
      code: cellShader,
    });

    const bindGroupLayout = gpu.device!.createBindGroupLayout({
      label: "Cell Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility:
            GPUShaderStage.VERTEX |
            GPUShaderStage.COMPUTE |
            GPUShaderStage.FRAGMENT,
          buffer: {}, // Grid uniform buffer
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" }, // Cell state input buffer
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" }, // Cell state output buffer
        },
      ],
    });

    const pipelineLayout = gpu.device!.createPipelineLayout({
      label: "Cell Pipeline Layout",
      bindGroupLayouts: [bindGroupLayout],
    });

    const simulationPipeline = gpu.device!.createComputePipeline({
      label: "Simulation pipeline",
      layout: pipelineLayout,
      compute: {
        module: simulationShaderModule,
        entryPoint: "computeMain",
      },
    });

    const cellPipeline = gpu.device!.createRenderPipeline({
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
      gpu.device!.createBindGroup({
        label: "Cell renderer bind group A",
        layout: bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: { buffer: uniformBuffer },
          },
          {
            binding: 1,
            resource: { buffer: cellStateStorage[0] },
          },
          {
            binding: 2,
            resource: { buffer: cellStateStorage[1] },
          },
        ],
      }),
      gpu.device!.createBindGroup({
        label: "Cell renderer bind group B",
        layout: bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: { buffer: uniformBuffer },
          },
          {
            binding: 1,
            resource: { buffer: cellStateStorage[1] },
          },
          {
            binding: 2,
            resource: { buffer: cellStateStorage[0] },
          },
        ],
      }),
    ];

    function updateGrid() {
      const encoder = gpu.device!.createCommandEncoder();
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
      gpu.device!.queue.submit([encoder.finish()]);
    }

    setInterval(updateGrid, UPDATE_INTERVAL);
  });
</script>

<main>
  <canvas id="canvas" bind:this={canvas}></canvas>
</main>

<style>
</style>
