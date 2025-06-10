<script lang="ts">
  import { onMount } from "svelte";

  import Canvas from "@/lib/components/Canvas.svelte";
  import DrawingControls from "@/lib/components/DrawingControls.svelte";
  import FileControls from "@/lib/components/FileControls.svelte";
  import {
    CurveInterpolator,
    MAX_SEGMENTS,
  } from "@/lib/services/curve-intepolator";
  import { Tools, type Tool } from "@/lib/services/drawing";
  import ShaderPipeline from "@/lib/services/shader-pipeline";
  import { Simulation, WORKGROUP_SIZE } from "@/lib/services/simulation.svelte";
  import utils from "@/lib/services/utils";
  import { Bindings, GPU } from "@/lib/services/web-gpu";
  import drawingShader from "@/lib/shaders/compute/drawing.wgsl?raw";
  import preSimulationShader from "@/lib/shaders/compute/pre-simulation.wgsl?raw";
  import simulationShader from "@/lib/shaders/compute/simulation.wgsl?raw";
  import shaderUtils from "@/lib/shaders/compute/utils.wgsl?raw";
  import waterSimulationShader from "@/lib/shaders/compute/water-simulation.wgsl?raw";
  import drawShader from "@/lib/shaders/draw.wgsl?raw";

  const UPDATE_INTERVAL = 1000 / 60;
  const WIND_DIRECTION_VARIABILITY = 0.1;

  let canvas: HTMLCanvasElement | null = $state(null);
  let gpu: GPU | null = $state(null);
  let simulation: Simulation | null = $state(null);
  let renderPipeline: GPURenderPipeline | null = $state(null);
  let computePipelines: Record<string, GPUComputePipeline> | null =
    $state(null);

  const pipeline = new ShaderPipeline({
    // fix
    groups: { MAIN: 0, WORKGROUP_SIZE },
    bindings: Bindings,
    shaders: {
      preSimulation: preSimulationShader,
      simulation: simulationShader,
      waterSimulation: waterSimulationShader,
      drawing: drawingShader,
      draw: drawShader,
    },
  });

  let step = 0;

  const windDirection = pipeline.createBuffer<number>(
    Bindings.WindDirection,
    new Float32Array([Math.random() * 2 * Math.PI]),
  );
  let waterSourceHeight = $state(new Float32Array([0.01]));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let waterSourceHeightBuffer: GPUBuffer | null = null;
  let waterSourceLocation = $state(new Int32Array([-1, -1]));
  let vertices = utils.getVerticesForSquare();
  let vertexBuffer: GPUBuffer | null = null;

  const tool = pipeline.createBuffer<Tool>(
    Bindings.Tool,
    new Int32Array([Tools.Pencil]),
  );

  const toolLocationBufferSize = 4 * (MAX_SEGMENTS + 1);
  const toolLocation = pipeline.createBuffer<Float32Array>(
    Bindings.ToolLocation,
    new Float32Array(toolLocationBufferSize).fill(-1.0),
  );
  const toolColor = pipeline.createBuffer<Float32Array>(
    Bindings.ToolColor,
    new Float32Array([0, 0, 0]),
  );
  const toolSize = pipeline.createBuffer<Float32Array>(
    Bindings.ToolSize,
    new Float32Array([24]),
  );
  const toolOpacity = pipeline.createBuffer<Float32Array>(
    Bindings.ToolOpacity,
    new Float32Array([1]),
  );

  onMount(async () => {
    await setupSimulation();
    isPlaying = true;
  });

  async function setupSimulation(): Promise<GPU> {
    gpu = new GPU();
    await gpu.init();
    gpu.setupGPUCanvasRendering(canvas!);

    simulation = new Simulation(gpu);

    const waterSourceIndex =
      waterSourceLocation[0] + waterSourceLocation[1] * simulation.gridSize[0];
    const waterStateArray = new Int32Array(simulation.gridCellCount);
    waterStateArray[waterSourceIndex] = 1;

    pipeline
      .createBuffer(Bindings.GridSize, new Float32Array(simulation.gridSize))
      .create(gpu.device);
    windDirection.create(gpu.device);
    pipeline
      .createBuffer(Bindings.WaterSourceLocation, waterSourceLocation)
      .create(gpu.device);
    pipeline
      .createBuffer(Bindings.WaterSourceHeight, waterSourceHeight)
      .create(gpu.device);
    pipeline
      .createBuffer(
        () => (step % 2 === 0 ? Bindings.WaterStateA : Bindings.WaterStateB),
        waterStateArray,
      )
      .create(gpu.device);
    pipeline
      .createBuffer(
        () => (step % 2 === 0 ? Bindings.WaterStateB : Bindings.WaterStateA),
        waterStateArray,
      )
      .create(gpu.device);
    tool.create(gpu.device);
    toolLocation.create(gpu.device);
    toolColor.create(gpu.device);
    toolSize.create(gpu.device);
    toolOpacity.create(gpu.device);
    pipeline
      .createBuffer(
        () => (step % 2 === 0 ? Bindings.ColorsA : Bindings.ColorsB),
        new Float32Array(simulation.gridCellCount * 4).fill(255.0),
      )
      .create(gpu.device);
    pipeline
      .createBuffer(
        () => (step % 2 === 0 ? Bindings.ColorsB : Bindings.ColorsA),
        new Float32Array(simulation.gridCellCount * 4).fill(255.0),
      )
      .create(gpu.device);
    pipeline
      .createBuffer(
        Bindings.MovedMaterial,
        new Float32Array(simulation.gridCellCount * 4).fill(-1.0),
      )
      .create(gpu.device);

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
      { code: shaderUtils + drawShader },
      { ...Bindings },
    );

    const { render, compute } = simulation.finalizePipelines({
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
      bindGroupLayout: pipeline.createBindGroupLayout(
        gpu.device,
        "Simulation Bind Group",
      ),
    });
    renderPipeline = render;
    computePipelines = compute;

    return gpu;
  }

  function updateGrid() {
    if (!gpu || !renderPipeline) {
      throw new Error("GPU not initialized");
    }

    if (!simulation) {
      throw new Error("Simulation not initialized");
    }

    const updatedWindDirection =
      utils.randomlyNudgeValue(
        windDirection.scalar,
        WIND_DIRECTION_VARIABILITY,
      ) %
      (2 * Math.PI);
    windDirection.setScalar(updatedWindDirection);

    // waterSourceHeight = new Float32Array([waterSourceHeight[0] - 0.2]);
    // gpu.writeToBuffer(waterSourceHeightBuffer!, waterSourceHeight);

    const encoder = gpu.device.createCommandEncoder();
    const bindGroup = pipeline.createBindGroup(
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
      toolLocation.set(new Float32Array(locations));
    } else {
      isDrawing = false;
      curveInterpolator.reset();
      toolLocation.set(new Float32Array(toolLocationBufferSize).fill(-1.0));
    }
  }
</script>

<main>
  <FileControls
    {isPlaying}
    windDirection={windDirection.scalar}
    onPlayToggled={(play: boolean) => (isPlaying = play)}
  />
  <DrawingControls
    tool={tool.scalar}
    toolColor={toolColor.data as Float32Array}
    toolSize={toolSize.scalar}
    toolOpacity={toolOpacity.scalar}
    onToolChange={(newTool: Tool) => tool.setScalar(newTool)}
    onToolColorChange={(color: Float32Array) => toolColor.set(color)}
    onToolSizeChange={(size: Float32Array) => toolSize.set(size)}
    onToolOpacityChange={(opacity: Float32Array) => toolOpacity.set(opacity)}
  />
  <Canvas {onToolMove} bind:canvas></Canvas>
</main>
