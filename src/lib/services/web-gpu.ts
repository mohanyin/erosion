interface CreateUsageSpecificBufferOptions<T extends ArrayBufferView> {
  data: T;
  label: string;
}

export class GPU {
  private _device: GPUDevice | null = null;
  private _context: GPUCanvasContext | null = null;
  private _format: GPUTextureFormat | null = null;

  async init() {
    if (this._device) {
      return;
    }

    if (!navigator.gpu) {
      throw new Error("WebGPU not supported on this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) {
      throw new Error("No appropriate GPUAdapter found.");
    }

    this._device = await adapter.requestDevice();
  }

  get device() {
    if (!this._device) {
      throw new Error("GPU device not initialized. Please call init() first.");
    }
    return this._device;
  }

  get context() {
    return this._context;
  }

  get format() {
    return this._format;
  }

  setupGPUCanvasRendering(canvas: HTMLCanvasElement) {
    this._context = canvas.getContext("webgpu");
    if (!this._context) {
      throw new Error("Failed to create WebGPU context.");
    }
    this._format = navigator.gpu.getPreferredCanvasFormat();
    if (!this.device) {
      throw new Error("GPU device not initialized. Please call init() first.");
    }
    this._context.configure({ device: this.device, format: this._format });
  }

  createAndCopyBuffer<T extends ArrayBufferView>({
    data,
    label,
    usage,
  }: {
    data: T;
    label: string;
    usage: number;
  }) {
    const buffer = this.device.createBuffer({
      label,
      size: data.byteLength,
      usage,
    });
    this.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  createUniformBuffer<T extends ArrayBufferView>(
    options: CreateUsageSpecificBufferOptions<T>,
  ) {
    return this.createAndCopyBuffer({
      ...options,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  createStorageBuffer<T extends ArrayBufferView>(
    options: CreateUsageSpecificBufferOptions<T>,
  ) {
    return this.createAndCopyBuffer({
      ...options,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  createVertexBuffer<T extends ArrayBufferView>(
    options: CreateUsageSpecificBufferOptions<T>,
  ) {
    return this.createAndCopyBuffer({
      ...options,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
  }

  createShaderModule(
    options: GPUShaderModuleDescriptor,
    interpolate?: Record<string, string | number>,
  ) {
    let code = options.code;
    if (interpolate) {
      Object.entries(interpolate).forEach(([key, value]) => {
        code = code.replaceAll(`{{${key}}}`, value.toString());
      });
    }
    return this.device.createShaderModule({
      ...options,
      code,
    });
  }
}
