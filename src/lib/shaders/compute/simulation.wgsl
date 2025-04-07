@group(0) @binding(0) var<uniform> grid: vec2f;

@group(0) @binding(1) var<storage> cellStateIn: array<f32>;
@group(0) @binding(2) var<storage, read_write> cellStateOut: array<f32>;

fn cellIndex(cell: vec2u) -> u32 {
  return (cell.y % u32(grid.y)) * u32(grid.x) +
         (cell.x % u32(grid.x));
}

fn getCellState(x: u32, y: u32) -> f32 {
  return cellStateIn[cellIndex(vec2(x, y))];
}

@compute
@workgroup_size({{WORKGROUP_SIZE}}, {{WORKGROUP_SIZE}})
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  let neighborHeightSum = getCellState(cell.x+1, cell.y+1) +
                     getCellState(cell.x+1, cell.y) +
                       getCellState(cell.x+1, cell.y-1) +
                       getCellState(cell.x, cell.y-1) +
                       getCellState(cell.x-1, cell.y-1) +
                       getCellState(cell.x-1, cell.y) +
                       getCellState(cell.x-1, cell.y+1) +
                       getCellState(cell.x, cell.y+1);

  let i = cellIndex(cell.xy);
  cellStateOut[i] = neighborHeightSum / 8.0;
}
