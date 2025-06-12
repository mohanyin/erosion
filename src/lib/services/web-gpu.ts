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
  ColorParams: 14,
} as const;

export class GPU {
  private _device: GPUDevice | null = null;
  private _context: GPUCanvasContext | null = null;
  private _format: GPUTextureFormat | null = null;

  async init(): Promise<this> {
    if (this._device) {
      return this;
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
    return this;
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
