import { MAX_SEGMENTS } from "./curve-intepolator";
import { Tools } from "./drawing";

import type { ComputeBuffer, BufferData } from "@/lib/services/compute-buffer";
import GPUMemory from "@/lib/services/gpu-memory";
import ShaderAnalyzer from "@/lib/services/shader-analyzer";
import type ShaderModule from "@/lib/services/shader-module";
import { ShaderModuleBuilder } from "@/lib/services/shader-module";
import utils from "@/lib/services/utils";
import { Bindings, GPU } from "@/lib/services/web-gpu";
import drawingShader from "@/lib/shaders/compute/drawing.wgsl?raw";
import presimulationShader from "@/lib/shaders/compute/pre-simulation.wgsl?raw";
import simulationShader from "@/lib/shaders/compute/simulation.wgsl?raw";
import shaderUtils from "@/lib/shaders/compute/utils.wgsl?raw";
import waterSimulationShader from "@/lib/shaders/compute/water-simulation.wgsl?raw";
import drawShader from "@/lib/shaders/draw.wgsl?raw";

export const WORKGROUP_SIZE = 8;
export const TOOL_LOCATION_BUFFER_SIZE = 4 * (MAX_SEGMENTS + 1);

type ComputePipelineMap = Record<string, GPUComputePipeline>;

const vertices = utils.getVerticesForSquare();

export class Simulation {
  private gpu: GPU;

  shaderAnalyzer: ShaderAnalyzer;
  memory: GPUMemory;

  shaders!: Record<string, ShaderModule>;
  vertexBuffer!: GPUBuffer;
  computeBuffers: Record<string, ComputeBuffer<BufferData>> = {};

  computePipelines: ComputePipelineMap = {};
  renderPipeline!: GPURenderPipeline;

  step = $state(0);
  gridSize = $state([0, 0]);
  gridCellCount = $derived(this.gridSize[0] * this.gridSize[1]);

  constructor(gpu: GPU) {
    this.gpu = gpu;

    this.gridSize = [window.innerWidth, window.innerHeight];

    this.createShaders();
    this.shaderAnalyzer = new ShaderAnalyzer(this.shaders);
    this.memory = new GPUMemory(this.shaderAnalyzer, gpu.device);

    this.createBuffers();
    this.finalizePipelines();
  }

  createShaders() {
    const shaderModuleBuilder = new ShaderModuleBuilder(shaderUtils, {
      WORKGROUP_SIZE,
      ...Bindings,
    });
    this.shaders = {
      presimulation: shaderModuleBuilder.build(
        presimulationShader,
        this.gpu.device,
      ),
      simulation: shaderModuleBuilder.build(simulationShader, this.gpu.device),
      waterSimulation: shaderModuleBuilder.build(
        waterSimulationShader,
        this.gpu.device,
      ),
      drawing: shaderModuleBuilder.build(drawingShader, this.gpu.device),
      draw: shaderModuleBuilder.build(drawShader, this.gpu.device),
    };
  }

  createBuffers() {
    this.vertexBuffer = this.memory.createVertexBuffer({
      data: vertices,
      label: "Cell vertices",
    });

    this.computeBuffers = {
      windDirection: this.memory.createBuffer<number>(
        Bindings.WindDirection,
        new Float32Array([Math.random() * 2 * Math.PI]),
      ),
      tool: this.memory.createBuffer<number>(
        Bindings.Tool,
        new Int32Array([Tools.Pencil]),
      ),
      toolLocation: this.memory.createBuffer<number>(
        Bindings.ToolLocation,
        new Float32Array(TOOL_LOCATION_BUFFER_SIZE).fill(-1.0),
      ),
      toolColor: this.memory.createBuffer<number>(
        Bindings.ToolColor,
        new Float32Array([0, 0, 0]),
      ),
      toolSize: this.memory.createBuffer<number>(
        Bindings.ToolSize,
        new Float32Array([1]),
      ),
      toolOpacity: this.memory.createBuffer<number>(
        Bindings.ToolOpacity,
        new Float32Array([1]),
      ),
      gridSize: this.memory.createBuffer<number>(
        Bindings.GridSize,
        new Float32Array(this.gridSize),
      ),
      waterSourceLocation: this.memory.createBuffer<number>(
        Bindings.WaterSourceLocation,
        new Int32Array([-1, -1]),
      ),
      waterSourceHeight: this.memory.createBuffer<number>(
        Bindings.WaterSourceHeight,
        new Float32Array([0]),
      ),
      waterStateA: this.memory.createBuffer<number>(
        () =>
          this.step % 2 === 0 ? Bindings.WaterStateA : Bindings.WaterStateB,
        new Int32Array(this.gridCellCount).fill(0),
      ),
      waterStateB: this.memory.createBuffer<number>(
        () =>
          this.step % 2 === 0 ? Bindings.WaterStateB : Bindings.WaterStateA,
        new Int32Array(this.gridCellCount).fill(0),
      ),
      colorsA: this.memory.createBuffer<number>(
        () => (this.step % 2 === 0 ? Bindings.ColorsA : Bindings.ColorsB),
        new Float32Array(this.gridCellCount * 4).fill(255.0),
      ),
      colorsB: this.memory.createBuffer<number>(
        () => (this.step % 2 === 0 ? Bindings.ColorsB : Bindings.ColorsA),
        new Float32Array(this.gridCellCount * 4).fill(255.0),
      ),
      movedMaterial: this.memory.createBuffer<number>(
        Bindings.MovedMaterial,
        new Float32Array(this.gridCellCount * 4).fill(-1.0),
      ),
    };
  }

  finalizePipelines() {
    const pipelineLayout = this.gpu.device.createPipelineLayout({
      label: "Simulation Pipeline Layout",
      bindGroupLayouts: [
        this.memory.createBindGroupLayout(
          this.gpu.device,
          "Simulation Bind Group",
        ),
      ],
    });

    const computeStages = {
      presimulation: this.shaders.presimulation.getComputeProgrammableStage(),
      simulation: this.shaders.simulation.getComputeProgrammableStage(),
      waterSimulation:
        this.shaders.waterSimulation.getComputeProgrammableStage(),
      drawing: this.shaders.drawing.getComputeProgrammableStage(),
    };
    Object.entries(computeStages).forEach(([label, compute]) => {
      const computePipeline = this.gpu.device.createComputePipeline({
        label: `Simulation Compute Pipeline ${label}`,
        compute,
        layout: pipelineLayout,
      });
      this.computePipelines[label] = computePipeline;
    });

    this.renderPipeline = this.gpu.device.createRenderPipeline({
      label: `Simulation Render Pipeline`,
      layout: pipelineLayout,
      vertex: this.shaders.draw.getVertexProgrammableStage({
        buffers: this.memory.getVertexBufferLayout(),
      }),
      fragment: this.shaders.draw.getFragmentProgrammableStage({
        targets: [{ format: this.gpu.format }],
      }),
    });
  }

  dispatchComputePass(
    pipeline: GPUComputePipeline,
    encoder: GPUCommandEncoder,
    bindGroup: GPUBindGroup,
  ) {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(this.gridSize[0] / WORKGROUP_SIZE),
      Math.ceil(this.gridSize[1] / WORKGROUP_SIZE),
    );
    pass.end();
  }
}
