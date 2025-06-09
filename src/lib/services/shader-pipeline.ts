import { ResourceType, VariableInfo, WgslReflect } from "wgsl_reflect";

import {
  interpolateShader,
  GPU,
  type CreateDataBufferOptions,
} from "./web-gpu";

type Binding = number;
type Group = number;

export default class ShaderPipeline {
  private gpu!: GPU;
  private shaders: Record<string, string> = {};
  private reflect: Record<string, WgslReflect> = {};
  private buffers: Record<string, GPUBuffer> = {};

  constructor({
    groups,
    bindings,
    shaders,
  }: {
    groups: Record<string, Group>;
    bindings: Record<string, Binding>;
    shaders: Record<string, string>;
  }) {
    Object.entries(shaders).forEach(([name, code]) => {
      this.shaders[name] = interpolateShader(code, { ...groups, ...bindings });
      this.reflect[name] = new WgslReflect(this.shaders[name]);
    });
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

  private mergeShaderReflections(): Record<
    Binding,
    Partial<CreateDataBufferOptions>
  > {
    const dataBufferOptions: Record<
      Binding,
      Partial<CreateDataBufferOptions>
    > = {};

    for (const reflection of Object.values(this.reflect)) {
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

  initBuffers(gpu: GPU, values: Record<Binding, GPUAllowSharedBufferSource>) {
    this.gpu = gpu;

    const variables = this.mergeShaderReflections();
    Object.entries(variables).forEach(([binding, variable]) => {
      this.buffers[binding] = this.gpu.createAndCopyBuffer({
        ...variable,
        data: values[Number(binding)],
      } as CreateDataBufferOptions);
    });
  }

  updateBuffer(binding: Binding, value: GPUAllowSharedBufferSource) {
    const buffer = this.buffers[binding];
    if (!buffer) {
      throw new Error(`Buffer not found for binding ${binding}`);
    }

    this.gpu.writeToBuffer(buffer, value);
  }

  // binding groups and all that nonsense
}
