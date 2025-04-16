import { SimulationGPU, Bindings } from "@/lib/services/web-gpu";

export const WORKGROUP_SIZE = 8;

export class Simulation {
  private gpu: SimulationGPU;

  gridSize = $state([0, 0]);

  gridCellCount = $derived(this.gridSize[0] * this.gridSize[1]);

  constructor(gpu: SimulationGPU) {
    this.gpu = gpu;
    this.gridSize = [window.innerWidth, window.innerHeight];
  }

  createGridSizeBuffer() {
    return this.gpu.createUniformBuffer({
      binding: Bindings.GridSize,
      visibility:
        GPUShaderStage.VERTEX |
        GPUShaderStage.FRAGMENT |
        GPUShaderStage.COMPUTE,
      readonly: true,
      data: new Float32Array(this.gridSize),
      label: "Grid Size",
    });
  }

  createWindDirectionBuffer(data: Float32Array) {
    return this.gpu.createUniformBuffer({
      binding: Bindings.WindDirection,
      visibility: GPUShaderStage.COMPUTE,
      readonly: true,
      data,
      label: "Wind Direction",
    });
  }

  createWaterSourceLocationBuffer(data: Int32Array) {
    return this.gpu.createUniformBuffer({
      binding: Bindings.WaterSourceLocation,
      visibility: GPUShaderStage.COMPUTE,
      readonly: true,
      data,
      label: "Water Source Location",
    });
  }

  createColorBuffers(data: Float32Array) {
    return [
      this.gpu.createStorageBuffer({
        data,
        label: "Color State A",
        binding: (step: number) =>
          step % 2 === 0 ? Bindings.ColorsA : Bindings.ColorsB,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        readonly: true,
      }),
      this.gpu.createStorageBuffer({
        data,
        label: "Color State B",
        binding: (step: number) =>
          step % 2 === 0 ? Bindings.ColorsB : Bindings.ColorsA,
        visibility: GPUShaderStage.COMPUTE,
        readonly: false,
      }),
    ];
  }

  createWaterSourceHeightBuffer(data: Float32Array) {
    return this.gpu.createUniformBuffer({
      data,
      label: "Water Source Height",
      binding: Bindings.WaterSourceHeight,
      visibility: GPUShaderStage.COMPUTE,
      readonly: true,
    });
  }

  createWaterStateBuffers(data: Int32Array) {
    return [
      this.gpu.createStorageBuffer({
        data,
        label: "Water State A",
        binding: (step: number) =>
          step % 2 === 0 ? Bindings.WaterStateA : Bindings.WaterStateB,
        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        readonly: true,
      }),
      this.gpu.createStorageBuffer({
        data,
        label: "Water State B",
        binding: (step: number) =>
          step % 2 === 0 ? Bindings.WaterStateB : Bindings.WaterStateA,
        visibility: GPUShaderStage.COMPUTE,
        readonly: false,
      }),
    ];
  }

  runComputePass(
    pipelineName: string,
    encoder: GPUCommandEncoder,
    bindGroup: GPUBindGroup,
  ) {
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.gpu.computePipelines[pipelineName]);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(this.gridSize[0] / WORKGROUP_SIZE),
      Math.ceil(this.gridSize[1] / WORKGROUP_SIZE),
    );
    pass.end();
  }
}
