import type ShaderAnalyzer from "@/lib/services/shader-analyzer";
import {
  WebGPUBuffer,
  type BufferData,
} from "@/lib/services/web-gpu-buffer.svelte";

export type RawBinding = number | (() => number);
type Binding = number;

export default class GPUMemory {
  private bindGroup: {
    buffer: WebGPUBuffer<BufferData>;
    binding: RawBinding;
  }[] = [];

  constructor(
    private readonly shaderAnalyzer: ShaderAnalyzer,
    private readonly gpuDevice: GPUDevice,
  ) {}

  private calculateBinding(binding: Binding | (() => Binding)) {
    return typeof binding === "function" ? binding() : binding;
  }

  createBuffer<T extends BufferData>(
    rawBinding: RawBinding,
    data: GPUAllowSharedBufferSource,
  ) {
    const binding = this.calculateBinding(rawBinding);
    const buffer = new WebGPUBuffer<T>(
      {
        data,
        usage: this.shaderAnalyzer.getVariableData(binding).usage!,
      },
      this.gpuDevice,
    );
    this.bindGroup.push({
      buffer,
      binding: rawBinding,
    });
    return buffer;
  }

  private mapUsageToBufferType(
    usage: GPUBufferUsageFlags,
    readonly: boolean,
  ): GPUBufferBindingLayout {
    if (usage & GPUBufferUsage.UNIFORM) {
      return { type: "uniform" };
    } else if (usage & GPUBufferUsage.STORAGE && !readonly) {
      return { type: "storage" };
    } else if (usage & GPUBufferUsage.STORAGE && readonly) {
      return { type: "read-only-storage" };
    } else {
      throw new Error("Unknown buffer usage");
    }
  }

  private getBindGroupLayout(label: string): GPUBindGroupLayoutEntry[] {
    return this.bindGroup.map((bindGroup) => {
      const binding = this.calculateBinding(bindGroup.binding);
      const variable = this.shaderAnalyzer.getVariableData(binding);
      return {
        label: label,
        binding,
        visibility: variable.visibility!,
        buffer: this.mapUsageToBufferType(variable.usage!, variable.readonly!),
      };
    });
  }

  private getBindGroupEntries(label: string): GPUBindGroupEntry[] {
    return this.bindGroup.map((bindGroup) => {
      const binding = this.calculateBinding(bindGroup.binding);
      return {
        binding,
        resource: { buffer: bindGroup.buffer.buffer!, label: label + binding },
      };
    });
  }

  createBindGroupLayout(device: GPUDevice, label: string) {
    return device.createBindGroupLayout({
      label,
      entries: this.getBindGroupLayout(label + "layout"),
    });
  }

  createBindGroup(device: GPUDevice, label: string) {
    return device.createBindGroup({
      label,
      layout: this.createBindGroupLayout(device, label),
      entries: this.getBindGroupEntries(label + "entries"),
    });
  }
}
