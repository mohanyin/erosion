<script lang="ts">
  import { onMount } from "svelte";

  import Canvas from "@/lib/components/Canvas.svelte";
  import DrawingControls from "@/lib/components/DrawingControls.svelte";
  import FileControls from "@/lib/components/FileControls.svelte";
  import {
    CurveInterpolator,
    MAX_SEGMENTS,
  } from "@/lib/services/curve-intepolator";
  import { Drawing, Tools, type Tool } from "@/lib/services/drawing";
  import { Simulation, WORKGROUP_SIZE } from "@/lib/services/simulation.svelte";
  import utils from "@/lib/services/utils";
  import { SimulationGPU, Bindings } from "@/lib/services/web-gpu";
  import cellShader from "@/lib/shaders/cell.wgsl?raw";
  import drawingShader from "@/lib/shaders/compute/drawing.wgsl?raw";
  import preSimulationShader from "@/lib/shaders/compute/pre-simulation.wgsl?raw";
  import simulationShader from "@/lib/shaders/compute/simulation.wgsl?raw";
  import shaderUtils from "@/lib/shaders/compute/utils.wgsl?raw";
  import waterSimulationShader from "@/lib/shaders/compute/water-simulation.wgsl?raw";

  const UPDATE_INTERVAL = 1000 / 60;
  const WIND_DIRECTION_VARIABILITY = 0.1;

  let canvas: HTMLCanvasElement | null = $state(null);
  let gpu: SimulationGPU | null = $state(null);
  let simulation: Simulation | null = $state(null);
  let drawing: Drawing | null = $state(null);

  let step = 0;

  let windDirection = $state(Math.random() * 2 * Math.PI);
  let windDirectionBuffer: GPUBuffer | null = null;
  let waterSourceHeight = $state(new Float32Array([0.01]));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let waterSourceHeightBuffer: GPUBuffer | null = null;
  let waterSourceLocation = $state(new Int32Array([-1, -1]));
  let vertices = utils.getVerticesForSquare();
  let vertexBuffer: GPUBuffer | null = null;

  let tool = $state<Tool>(Tools.Pencil);

  let toolBuffer: GPUBuffer | null = null;
  const toolLocationBufferSize = 4 * (MAX_SEGMENTS + 1);
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

    windDirectionBuffer = simulation.createWindDirectionBuffer(
      new Float32Array([windDirection]),
    );

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

    simulation.createColorBuffers(
      new Float32Array(simulation.gridCellCount * 4).fill(255.0),
    );

    waterSourceHeightBuffer =
      simulation.createWaterSourceHeightBuffer(waterSourceHeight);
    const waterSourceIndex =
      waterSourceLocation[0] + waterSourceLocation[1] * simulation.gridSize[0];
    const waterStateArray = new Int32Array(simulation.gridCellCount);
    waterStateArray[waterSourceIndex] = 1;
    simulation.createWaterStateBuffers(waterStateArray);

    simulation.createMovedMaterialBuffer(
      new Float32Array(4 * simulation.gridCellCount).fill(-1.0),
    );

    drawing = new Drawing(gpu);
    toolBuffer = drawing.createToolBuffer(new Int32Array([tool]));
    // One more point than segments, because of the two end points.
    toolLocationBuffer = drawing.createToolLocationBuffer(
      new Float32Array(toolLocationBufferSize).fill(-1.0),
    );
    toolColorBuffer = drawing.createToolColorBuffer(toolColor);
    toolSizeBuffer = drawing.createToolSizeBuffer(toolSize);
    toolOpacityBuffer = drawing.createToolOpacityBuffer(toolOpacity);

    const preSimulationShaderModule = gpu.createShaderModule(
      { code: shaderUtils + preSimulationShader },
      { WORKGROUP_SIZE: WORKGROUP_SIZE.toString(), ...Bindings },
    );

    const simulationShaderModule = gpu.createShaderModule(
      { code: shaderUtils + simulationShader },
      { WORKGROUP_SIZE: WORKGROUP_SIZE.toString(), ...Bindings },
    );

    const waterSimulationShaderModule = gpu.createShaderModule(
      { code: shaderUtils + waterSimulationShader },
      { WORKGROUP_SIZE: WORKGROUP_SIZE.toString(), ...Bindings },
    );

    const drawingShaderModule = gpu.createShaderModule(
      { code: shaderUtils + drawingShader },
      { WORKGROUP_SIZE: WORKGROUP_SIZE.toString(), ...Bindings },
    );

    const cellShaderModule = gpu.createShaderModule(
      { code: shaderUtils + cellShader },
      { ...Bindings },
    );

    gpu.finalizePipelines({
      label: "Simulation",
      compute: {
        preSimulation: {
          module: preSimulationShaderModule,
          entryPoint: "computeMain",
        },
        simulation: {
          module: simulationShaderModule,
          entryPoint: "computeMain",
        },
        waterSimulation: {
          module: waterSimulationShaderModule,
          entryPoint: "computeMain",
        },
        drawing: {
          module: drawingShaderModule,
          entryPoint: "computeMain",
        },
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
    if (!gpu || !gpu.isFinalized) {
      throw new Error("GPU not initialized");
    }

    if (!simulation) {
      throw new Error("Simulation not initialized");
    }

    windDirection =
      utils.randomlyNudgeValue(windDirection, WIND_DIRECTION_VARIABILITY) %
      (2 * Math.PI);
    gpu.writeToBuffer(windDirectionBuffer!, new Float32Array([windDirection]));

    // waterSourceHeight = new Float32Array([waterSourceHeight[0] - 0.2]);
    // gpu.writeToBuffer(waterSourceHeightBuffer!, waterSourceHeight);

    const encoder = gpu.device.createCommandEncoder();

    if (isPlaying) {
      const simulationBindGroup = bindGroups[step % 2];
      simulation.runComputePass("preSimulation", encoder, simulationBindGroup);
      simulation.runComputePass(
        "waterSimulation",
        encoder,
        simulationBindGroup,
      );
      simulation.runComputePass("simulation", encoder, simulationBindGroup);
    }

    // TODO: DON'T OVERWRITE EROSION
    const currentBindGroup = bindGroups[step % 2];
    simulation.runComputePass("drawing", encoder, currentBindGroup);

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

    pass.setPipeline(gpu.renderPipeline!);
    pass.setBindGroup(0, bindGroups[step % 2]);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(vertices.length / 2, simulation!.gridCellCount);

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

  function onToolChange(newTool: Tool) {
    tool = newTool;
    if (gpu && toolBuffer) {
      gpu.writeToBuffer(toolBuffer, new Int32Array([tool]));
    }
  }

  const curveInterpolator = new CurveInterpolator();

  function onToolMove(location: Float32Array | null) {
    if (location) {
      const remappedLocation = [
        (location[0] / canvas!.clientWidth) * simulation!.gridSize[0],
        simulation!.gridSize[1] -
          (location[1] / canvas!.clientHeight) * simulation!.gridSize[1],
      ];

      isDrawing = true;
      curveInterpolator.addControlPoint(remappedLocation);
      const newPoints = curveInterpolator.getNewestPoints();
      const locations = [
        ...newPoints.flat(),
        ...new Array(4 * (MAX_SEGMENTS + 1 - newPoints.length)).fill(-1.0),
      ];
      gpu!.writeToBuffer(toolLocationBuffer!, new Float32Array(locations));
    } else {
      isDrawing = false;
      curveInterpolator.reset();
      gpu!.writeToBuffer(
        toolLocationBuffer!,
        new Float32Array(new Float32Array(toolLocationBufferSize).fill(-1.0)),
      );
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
    {windDirection}
    onPlayToggled={(play: boolean) => (isPlaying = play)}
  />
  <DrawingControls
    {tool}
    {toolColor}
    {toolSize}
    {toolOpacity}
    {onToolChange}
    {onToolColorChange}
    {onToolSizeChange}
    {onToolOpacityChange}
  />
  <Canvas {onToolMove} bind:canvas></Canvas>
</main>
