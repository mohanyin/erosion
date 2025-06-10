export type BufferData = number | Float32Array | Int32Array;

export type GPUBufferOptions = Omit<GPUBufferDescriptor, "size"> & {
  data: GPUAllowSharedBufferSource;
};

export class WebGPUBuffer<T extends BufferData> {
  private device: GPUDevice | null = null;
  private options: GPUBufferOptions;

  data: GPUAllowSharedBufferSource = new Float32Array([]);
  buffer: GPUBuffer | null = $state(null);

  constructor(options: GPUBufferOptions, device: GPUDevice) {
    this.options = options;
    this.data = options.data;
    this.device = device;
    this.buffer = this.device.createBuffer({
      ...this.options,
      size: this.data!.byteLength,
    });
    this.set(this.options.data);
  }

  set(data: GPUAllowSharedBufferSource) {
    this.data = data;
    this.device?.queue.writeBuffer(this.buffer!, 0, data);
  }

  setScalar(data: number) {
    if (this.data instanceof Float32Array) {
      this.set(new Float32Array([data]));
    } else if (this.data instanceof Int32Array) {
      this.set(new Int32Array([data]));
    } else {
      throw new Error("Unknown buffer type in #setScalar");
    }
  }

  get scalar(): T | null {
    return this.data instanceof Float32Array || this.data instanceof Int32Array
      ? (this.data[0] as T)
      : null;
  }
}
