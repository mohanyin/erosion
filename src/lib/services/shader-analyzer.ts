import { ResourceType, VariableInfo, WgslReflect } from "wgsl_reflect";

import { ComputeBuffer, type BufferData } from "@/lib/services/compute-buffer";
import type ShaderModule from "@/lib/services/shader-module";

type RawBinding = number | (() => number);
type Binding = number;

interface BufferDetails {
  usage: GPUBufferUsageFlags;
  label: string;
  binding: RawBinding;
  visibility: GPUFlagsConstant;
  readonly: boolean;
}

/**
 * Analyzes shaders to tell what kind of buffers are needed for each binding.
 */
export default class ShaderAnalyzer {
  private shaders: Record<string, ShaderModule> = {};
  private bindGroup: {
    buffer: ComputeBuffer<BufferData>;
    binding: RawBinding;
  }[] = [];

  private mergedVariableData: Record<Binding, Partial<BufferDetails>> = {};

  constructor(shaders: Record<string, ShaderModule>) {
    this.shaders = shaders;
    this.mergedVariableData = this.mergeVariableData();
  }

  private mapUsage(variable: VariableInfo) {
    if (variable.resourceType === ResourceType.Uniform) {
      return GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
    } else if (variable.resourceType === ResourceType.Storage) {
      return GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    }
  }

  private mapVisibility(
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

  private mergeVariableData(): Record<Binding, Partial<BufferDetails>> {
    const dataBufferOptions: Record<Binding, Partial<BufferDetails>> = {};

    for (const shader of Object.values(this.shaders)) {
      const reflection = shader.reflect;
      for (const variable of [...reflection.uniforms, ...reflection.storage]) {
        if (!dataBufferOptions[variable.binding]) {
          dataBufferOptions[variable.binding] = {
            usage: this.mapUsage(variable),
            label: variable.name, // use binding key at some point
            binding: variable.binding,
            visibility: this.mapVisibility(variable, reflection),
            readonly: variable.access !== "read_write",
          };
        } else {
          const current = dataBufferOptions[variable.binding];
          if (variable.access === "read_write") {
            current.readonly = false;
          }
          current.visibility =
            current.visibility! | this.mapVisibility(variable, reflection);
        }
      }
    }

    return dataBufferOptions;
  }

  getVariableData(binding: Binding) {
    return this.mergedVariableData[binding];
  }
}
