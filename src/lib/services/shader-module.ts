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

  build(shader: string) {
    const code = this.interpolateShader(
      this.utils + shader,
      this.interpolations,
    );
    return new ShaderModule(code);
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
  private code: string;
  reflect: WgslReflect;

  constructor(code: string) {
    this.code = code;
    this.reflect = new WgslReflect(code);
  }

  finalize(device: GPUDevice) {
    return device.createShaderModule({ code: this.code });
  }
}
