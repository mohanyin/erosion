@group(0) @binding({{GridSize}}) var<uniform> grid: vec2f;
@group(0) @binding({{WindDirection}}) var<uniform> windDirection: vec2f;
@group(0) @binding({{WaterSourceLocation}}) var<uniform> waterSourceLocation: vec2i;

@group(0) @binding({{CellStateA}}) var<storage> cellStateIn: array<f32>;
@group(0) @binding({{CellStateB}}) var<storage, read_write> cellStateOut: array<f32>;

fn cellIndex(cell: vec2u) -> u32 {
  return (cell.y % u32(grid.y)) * u32(grid.x) +
         (cell.x % u32(grid.x));
}

fn getCellState(x: u32, y: u32) -> f32 {
  return cellStateIn[cellIndex(vec2(x, y))];
}

fn getMovedMaterial(x: u32, y: u32) -> f32 {
  let state = getCellState(x, y);
  let left = getCellState(x-1, y);
  let right = getCellState(x+1, y);
  let up = getCellState(x, y+1);
  let down = getCellState(x, y-1);

  let localMaximaFactor = state - (left + right + up + down) / 4.0;
  return clamp(localMaximaFactor / 2, 0.0, 10.0);
}

@compute
@workgroup_size({{WORKGROUP_SIZE}}, {{WORKGROUP_SIZE}})
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  let state = getCellState(cell.x, cell.y);
  let removedMaterial = getMovedMaterial(cell.x, cell.y);
  var addedMaterial = 0.0;

  let windNormalized = normalize(windDirection);
  let windXAmount = pow(abs(windNormalized.x), 2);
  let windYAmount = pow(abs(windNormalized.y), 2);

  if (windDirection.x > 0.0) {
    addedMaterial += windXAmount * getMovedMaterial(cell.x - 1, cell.y);
  } else {
    addedMaterial += windXAmount * getMovedMaterial(cell.x + 1, cell.y);
  }

  if (windDirection.y > 0.0) {
    addedMaterial += windYAmount * getMovedMaterial(cell.x, cell.y + 1);
  } else {
    addedMaterial += windYAmount * getMovedMaterial(cell.x, cell.y - 1);
  }

  cellStateOut[cellIndex(cell.xy)] = clamp(state - removedMaterial + addedMaterial, 0.0, 1000.0);
}
