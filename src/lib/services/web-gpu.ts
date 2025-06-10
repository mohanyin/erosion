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

export interface CreateDataBufferOptions
  extends Omit<DataBufferWithOptions, "buffer"> {
  data: GPUAllowSharedBufferSource;
  label: string;
}

export type CreateSpecificDataBufferOptions = Omit<
  CreateDataBufferOptions,
  "usage"
>;

interface CreateVertexBufferOptions {
  data: Float32Array;
  label: string;
  attributes: GPUVertexAttribute[];
}

export function interpolateShader(
  code: string,
  interpolate: Record<string, string | number> = {},
) {
  Object.entries(interpolate).forEach(([key, value]) => {
    code = code.replaceAll(`{{${key}}}`, value.toString());
  });
  return code;
}

export class GPU extends BaseGPU {
  private _vertexBuffers: Map<string, CreateVertexBufferOptions> = new Map();

  getVertexBufferLayout(): GPUVertexBufferLayout[] {
    return Array.from(this._vertexBuffers.values()).map((buffer) => ({
      arrayStride: 8,
      attributes: buffer.attributes,
    }));
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

  createShaderModule(
    options: GPUShaderModuleDescriptor,
    interpolate: Record<string, string | number> = {},
  ) {
    const code = interpolateShader(options.code, interpolate);
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
    bindGroupLayout,
  }: {
    label: string;
    compute: Record<string, GPUProgrammableStage>;
    vertex: GPUVertexState;
    fragment: GPUFragmentState;
    bindGroupLayout: GPUBindGroupLayout;
  }): { compute: ComputePipelineMap; render: GPURenderPipeline } {
    if (this.isFinalized) {
      return { compute: this.computePipelines, render: this.renderPipeline! };
    }

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
