import { GPU } from "@/lib/services/web-gpu";

export const WORKGROUP_SIZE = 8;

type ComputePipelineMap = Record<string, GPUComputePipeline>;

export class Simulation {
  private gpu: GPU;

  gridSize = $state([0, 0]);

  gridCellCount = $derived(this.gridSize[0] * this.gridSize[1]);

  constructor(gpu: GPU) {
    this.gpu = gpu;
    this.gridSize = [window.innerWidth, window.innerHeight];
  }

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
    const pipelineLayout = this.gpu.device.createPipelineLayout({
      label: `${label} Pipeline Layout`,
      bindGroupLayouts: [bindGroupLayout],
    });

    const computePipelines: ComputePipelineMap = {};
    Object.entries(compute).forEach(([label, compute]) => {
      const computePipeline = this.gpu.device.createComputePipeline({
        label: `${label} Compute Pipeline`,
        compute,
        layout: pipelineLayout,
      });
      computePipelines[label] = computePipeline;
    });

    const renderPipeline = this.gpu.device.createRenderPipeline({
      label: `${label} Render Pipeline`,
      layout: pipelineLayout,
      vertex,
      fragment,
    });

    return { compute: computePipelines, render: renderPipeline };
  }

  dispatchComputePass(
    pipeline: GPUComputePipeline,
    encoder: GPUCommandEncoder,
    bindGroup: GPUBindGroup,
  ) {
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(
      Math.ceil(this.gridSize[0] / WORKGROUP_SIZE),
      Math.ceil(this.gridSize[1] / WORKGROUP_SIZE),
    );
    pass.end();
  }
}
