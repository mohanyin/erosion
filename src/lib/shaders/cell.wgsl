struct VertexInput {
  @location(0) pos: vec2f,
  @builtin(instance_index) instance: u32,
};

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) cell: vec2f,
  @location(1) state: f32,
  @interpolate(flat) @location(2) instance: u32,
};

@group(0) @binding({{GridSize}}) var<uniform> grid: vec2f;
@group(0) @binding({{CellStateA}}) var<storage> cellState: array<f32>;
@group(0) @binding({{WaterStateA}}) var<storage> waterState: array<i32>;

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  let i = f32(input.instance); // Save the instance_index as a float
  let cell = vec2f(i % grid.x, floor(i / grid.x));
  let cellOffset = cell / grid * 2;
  let gridPos = (input.pos + 1) / grid - 1 + cellOffset;

  var output: VertexOutput;
  output.pos = vec4f(gridPos, 0, 1);
  output.cell = cell;
  output.instance = input.instance;

  let state = cellState[input.instance];
  output.state = state;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let c = input.state / {{MAX_HEIGHT}};
  let water = waterState[input.instance];
  if (water == 1) {
    return vec4f(c, 1- c, 1, 1);
  } else {
    return vec4f(c, 1 - c, c, 1);
  }
} 