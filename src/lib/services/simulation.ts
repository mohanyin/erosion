import type { SimulationGPU } from "@/lib/services/web-gpu";

export const Bindings = {
  GridSize: 0,
  HeightStateA: 1,
  HeightStateB: 2,
  WindDirection: 3,
  WaterSourceLocation: 4,
  WaterSourceHeight: 5,
  WaterStateA: 6,
  WaterStateB: 7,
} as const;

export const GRID_SIZE = 100;

export class Simulation {
  private gpu: SimulationGPU;

  constructor(gpu: SimulationGPU) {
    this.gpu = gpu;
  }

  createGridSizeBuffer() {
    return this.gpu.createUniformBuffer({
      binding: Bindings.GridSize,
      visibility:
        GPUShaderStage.VERTEX |
        GPUShaderStage.FRAGMENT |
        GPUShaderStage.COMPUTE,
      readonly: true,
      data: new Float32Array([GRID_SIZE, GRID_SIZE]),
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

  createHeightStateBuffers(data: Float32Array) {
    return [
      this.gpu.createStorageBuffer({
        data,
        label: "Height State A",
        binding: (step: number) =>
          step % 2 === 0 ? Bindings.HeightStateA : Bindings.HeightStateB,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        readonly: true,
      }),
      this.gpu.createStorageBuffer({
        data,
        label: "Height State B",
        binding: (step: number) =>
          step % 2 === 0 ? Bindings.HeightStateB : Bindings.HeightStateA,
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
}
