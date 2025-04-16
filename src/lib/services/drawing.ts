import { SimulationGPU, Bindings } from "@/lib/services/web-gpu";

export const Tools = {
  Pencil: 0,
  Pen: 1,
  Marker: 2,
  Brush: 3,
  Water: 4,
  WindErosion: 5,
} as const;

export class Drawing {
  private gpu: SimulationGPU;

  constructor(gpu: SimulationGPU) {
    this.gpu = gpu;
  }

  createToolBuffer(data: Int32Array) {
    return this.gpu.createUniformBuffer({
      data,
      label: "Tool",
      binding: Bindings.Tool,
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
      readonly: true,
    });
  }

  createToolLocationBuffer(data: Float32Array) {
    return this.gpu.createUniformBuffer({
      data,
      label: "Tool location",
      binding: Bindings.ToolLocation,
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
      readonly: true,
    });
  }

  createToolColorBuffer(data: Float32Array) {
    return this.gpu.createUniformBuffer({
      data,
      label: "Tool color",
      binding: Bindings.ToolColor,
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
      readonly: true,
    });
  }

  createToolSizeBuffer(data: Float32Array) {
    return this.gpu.createUniformBuffer({
      data,
      label: "Tool size",
      binding: Bindings.ToolSize,
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
      readonly: true,
    });
  }

  createToolOpacityBuffer(data: Float32Array) {
    return this.gpu.createUniformBuffer({
      data,
      label: "Tool opacity",
      binding: Bindings.ToolOpacity,
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
      readonly: true,
    });
  }
}
