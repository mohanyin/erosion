export const Bindings = {
  GridSize: 0,
  ColorsA: 1,
  ColorsB: 2,
  WindDirection: 3,
  WaterSourceLocation: 4,
  WaterSourceHeight: 5,
  WaterStateA: 6,
  WaterStateB: 7,
  Tool: 8,
  ToolColor: 9,
  ToolSize: 10,
  ToolLocation: 11,
  ToolOpacity: 12,
  MovedMaterial: 13,
} as const;

export class BaseGPU {
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
    if (!this._format) {
      throw new Error(
        "GPU format not initialized. Please call setupGPUCanvasRendering() first.",
      );
    }
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
}

interface DataBufferWithOptions {
  buffer: GPUBuffer;
  binding: GPUIndex32 | ((step: number) => GPUIndex32);
  visibility: GPUShaderStageFlags;
  readonly: boolean;
  usage: GPUBufferUsageFlags;
}

interface CreateDataBufferOptions
  extends Omit<DataBufferWithOptions, "buffer"> {
  data: GPUAllowSharedBufferSource;
  label: string;
}

type CreateSpecificDataBufferOptions = Omit<CreateDataBufferOptions, "usage">;

interface CreateVertexBufferOptions {
  data: Float32Array;
  label: string;
  attributes: GPUVertexAttribute[];
}

export class GPU extends BaseGPU {
  private _buffers: Map<string, DataBufferWithOptions> = new Map();
  private _vertexBuffers: Map<string, CreateVertexBufferOptions> = new Map();

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

  getBindGroupLayout(step: number = 0): GPUBindGroupLayoutEntry[] {
    return Array.from(this._buffers.values()).map((buffer) => {
      const binding =
        typeof buffer.binding === "function"
          ? buffer.binding(step)
          : buffer.binding;
      return {
        binding,
        visibility: buffer.visibility,
        buffer: this.mapUsageToBufferType(buffer.usage, buffer.readonly),
      };
    });
  }

  getBindGroupEntries(step: number = 0): GPUBindGroupEntry[] {
    return Array.from(this._buffers.values()).map((buffer) => {
      const binding =
        typeof buffer.binding === "function"
          ? buffer.binding(step)
          : buffer.binding;
      return {
        binding,
        resource: { buffer: buffer.buffer },
      };
    });
  }

  getVertexBufferLayout(): GPUVertexBufferLayout[] {
    return Array.from(this._vertexBuffers.values()).map((buffer) => ({
      arrayStride: 8,
      attributes: buffer.attributes,
    }));
  }

  createAndCopyBuffer({
    binding,
    visibility = GPUShaderStage.COMPUTE,
    data,
    label,
    usage,
    readonly = false,
  }: CreateDataBufferOptions) {
    const buffer = this.device.createBuffer({
      label,
      size: data.byteLength,
      usage,
    });
    this.device.queue.writeBuffer(buffer, 0, data);
    this._buffers.set(label, {
      binding,
      visibility,
      readonly,
      buffer,
      usage,
    });
    return buffer;
  }

  createUniformBuffer(options: CreateSpecificDataBufferOptions) {
    return this.createAndCopyBuffer({
      ...options,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  createStorageBuffer(options: CreateSpecificDataBufferOptions) {
    return this.createAndCopyBuffer({
      ...options,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  createVertexBuffer({ label, data, attributes }: CreateVertexBufferOptions) {
    const buffer = this.device.createBuffer({
      label,
      size: data.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(buffer, 0, data);
    this._vertexBuffers.set(label, { label, data, attributes });
    return buffer;
  }

  writeToBuffer(buffer: GPUBuffer, data: GPUAllowSharedBufferSource) {
    this.device.queue.writeBuffer(buffer, 0, data);
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

type ComputePipelineMap = Record<string, GPUComputePipeline>;

export class SimulationGPU extends GPU {
  isFinalized = false;
  computePipelines: ComputePipelineMap = {};
  renderPipeline: GPURenderPipeline | null = null;

  finalizePipelines({
    label,
    compute,
    vertex,
    fragment,
  }: {
    label: string;
    compute: Record<string, GPUProgrammableStage>;
    vertex: GPUVertexState;
    fragment: GPUFragmentState;
  }): { compute: ComputePipelineMap; render: GPURenderPipeline } {
    if (this.isFinalized) {
      return { compute: this.computePipelines, render: this.renderPipeline! };
    }

    const bindGroupLayout = this.device.createBindGroupLayout({
      label: `${label} Bind Group Layout`,
      entries: this.getBindGroupLayout(),
    });
    const pipelineLayout = this.device.createPipelineLayout({
      label: `${label} Pipeline Layout`,
      bindGroupLayouts: [bindGroupLayout],
    });

    Object.entries(compute).forEach(([label, compute]) => {
      const computePipeline = this.device.createComputePipeline({
        label: `${label} Compute Pipeline`,
        compute,
        layout: pipelineLayout,
      });
      this.computePipelines[label] = computePipeline;
    });

    const renderPipeline = this.device.createRenderPipeline({
      label: `${label} Render Pipeline`,
      layout: pipelineLayout,
      vertex,
      fragment,
    });
    this.renderPipeline = renderPipeline;

    this.isFinalized = true;
    return { compute: this.computePipelines, render: renderPipeline };
  }
}
