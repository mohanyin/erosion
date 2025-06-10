import { ResourceType, VariableInfo, WgslReflect } from "wgsl_reflect";

import type ShaderModule from "./shader-module";
import { type CreateDataBufferOptions } from "./web-gpu";
import { WebGPUBuffer, type BufferData } from "./web-gpu-buffer.svelte";

type RawBinding = number | (() => number);
type Binding = number;

export default class ShaderAnalyzer {
  private shaders: Record<string, ShaderModule> = {};
  private bindGroup: {
    buffer: WebGPUBuffer<BufferData>;
    binding: RawBinding;
  }[] = [];

  private mergedVariableData: Record<
    Binding,
    Partial<CreateDataBufferOptions>
  > = {};

  constructor(shaders: Record<string, ShaderModule>) {
    this.shaders = shaders;
    this.mergedVariableData = this.mergeVariableData();
  }

  private getUsage(variable: VariableInfo) {
    if (variable.resourceType === ResourceType.Uniform) {
      return GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
    } else if (variable.resourceType === ResourceType.Storage) {
      return GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    }
  }

  private getVisibility(
    variable: VariableInfo,
    reflection: WgslReflect,
  ): GPUFlagsConstant {
    const stages = [];
    for (const func of reflection.functions) {
      if (func.resources.find((resource) => resource.name === variable.name)) {
        stages.push(func.stage);
      }
    }

    return stages.reduce((acc, stage) => {
      if (stage === "compute") {
        return acc | GPUShaderStage.COMPUTE;
      } else if (stage === "fragment") {
        return acc | GPUShaderStage.FRAGMENT;
      } else {
        return acc | GPUShaderStage.VERTEX;
      }
    }, 0);
  }

  private mergeVariableData(): Record<
    Binding,
    Partial<CreateDataBufferOptions>
  > {
    const dataBufferOptions: Record<
      Binding,
      Partial<CreateDataBufferOptions>
    > = {};

    for (const shader of Object.values(this.shaders)) {
      const reflection = shader.reflect;
      for (const variable of [...reflection.uniforms, ...reflection.storage]) {
        if (!dataBufferOptions[variable.binding]) {
          dataBufferOptions[variable.binding] = {
            usage: this.getUsage(variable),
            label: variable.name, // use binding key at some point
            binding: variable.binding,
            visibility: this.getVisibility(variable, reflection),
            readonly: variable.access !== "read_write",
          };
        } else {
          const current = dataBufferOptions[variable.binding];
          if (variable.access === "read_write") {
            current.readonly = false;
          }
          current.visibility =
            current.visibility! | this.getVisibility(variable, reflection);
        }
      }
    }

    return dataBufferOptions;
  }

  private calculateBinding(binding: Binding | (() => Binding)) {
    return typeof binding === "function" ? binding() : binding;
  }

  createBuffer<T extends BufferData>(
    rawBinding: RawBinding,
    data: GPUAllowSharedBufferSource,
  ) {
    const binding = this.calculateBinding(rawBinding);
    const buffer = new WebGPUBuffer<T>({
      data,
      usage: this.mergedVariableData[binding].usage!,
    });
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
      const variable = this.mergedVariableData[binding];
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
