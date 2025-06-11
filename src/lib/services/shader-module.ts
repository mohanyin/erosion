import { WgslReflect } from "wgsl_reflect";

/**
 * Simple preprocessing of the shader code based on shared utils and interpolations.
 */
export class ShaderModuleBuilder {
  utils: string;
  interpolations: Record<string, string | number>;

  constructor(utils: string, interpolations: Record<string, string | number>) {
    this.utils = utils;
    this.interpolations = interpolations;
  }

  build(shader: string, gpuDevice: GPUDevice) {
    const code = this.interpolateShader(
      this.utils + shader,
      this.interpolations,
    );
    return new ShaderModule(code, gpuDevice);
  }

  private interpolateShader(
    code: string,
    interpolate: Record<string, string | number> = {},
  ) {
    Object.entries(interpolate).forEach(([key, value]) => {
      code = code.replaceAll(`{{${key}}}`, value.toString());
    });
    return code;
  }
}

export default class ShaderModule {
  reflect: WgslReflect;
  module: GPUShaderModule;

  constructor(
    private readonly code: string,
    private readonly gpuDevice: GPUDevice,
  ) {
    this.reflect = new WgslReflect(code);
    this.module = this.gpuDevice.createShaderModule({ code: this.code });
  }

  getComputeProgrammableStage() {
    return {
      module: this.module,
      entryPoint: this.reflect.entry.compute[0].name,
    };
  }

  getVertexProgrammableStage(options: Partial<GPUVertexState> = {}) {
    return {
      module: this.module,
      entryPoint: this.reflect.entry.vertex[0].name,
      ...options,
    };
  }

  getFragmentProgrammableStage(
    options: Required<Pick<GPUFragmentState, "targets">>,
  ): GPUFragmentState {
    return {
      module: this.module,
      entryPoint: this.reflect.entry.fragment[0].name,
      ...options,
    };
  }
}
