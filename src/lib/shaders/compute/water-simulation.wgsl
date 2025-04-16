@group(0) @binding({{GridSize}}) var<uniform> grid: vec2f;

@group(0) @binding({{WaterSourceLocation}}) var<uniform> waterSourceLocation: vec2u;
@group(0) @binding({{WaterSourceHeight}}) var<uniform> waterSourceHeight: f32;
@group(0) @binding({{WaterStateA}}) var<storage> waterStateIn: array<i32>;
@group(0) @binding({{WaterStateB}}) var<storage, read_write> waterStateOut: array<i32>;

@group(0) @binding({{ColorsA}}) var<storage> colorsIn: array<f32>;
@group(0) @binding({{ColorsB}}) var<storage, read_write> colorsOut: array<f32>;

fn clampCellToGrid(x: i32, y: i32) -> vec2i {
  return vec2i(clamp(x, 0, i32(grid.x) - 1), clamp(y, 0, i32(grid.y) - 1));
}

fn cellIndex(x: i32, y: i32) -> u32 {
  let clampedCell = clampCellToGrid(x, y);
  return (u32(clampedCell.y) * u32(grid.x) + u32(clampedCell.x));
}

fn getColor(x: i32, y: i32) -> vec3f {
  let index = 3 * cellIndex(x, y);
  return vec3f(colorsIn[index], colorsIn[index + 1], colorsIn[index + 2]);
}

fn getWaterState(x: i32, y: i32) -> i32 {
  return waterStateIn[cellIndex(x, y)];
}

fn hasNeighborWithWater(x: i32, y: i32, value: i32) -> bool {
  let neighbors = array(
    vec2(1, 0),   // right
    vec2(-1, 0),  // left
    vec2(0, 1),   // up
    vec2(0, -1)   // down
  );
  
  for (var i = 0u; i < 4u; i = i + 1u) {
    let offset = neighbors[i];
    let neighbor = clampCellToGrid(x + offset.x, y + offset.y);
    if (getWaterState(neighbor.x, neighbor.y) == value) {
      return true;
    }
  }
  return false;
}

@compute
@workgroup_size({{WORKGROUP_SIZE}}, {{WORKGROUP_SIZE}})
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  let x = i32(cell.x);
  let y = i32(cell.y);
  let cellIndex = cellIndex(x, y);
  if (i32(waterSourceLocation.x) == x && i32(waterSourceLocation.y) == y) {
    waterStateOut[cellIndex] = 1;
  }

  let darkness = calculateDarkness(getColor(x, y));
  if (darkness > waterSourceHeight) {
    waterStateOut[cellIndex] = 0;
    return;
  } else if (darkness < waterSourceHeight && hasNeighborWithWater(x, y, 1)) {
    waterStateOut[cellIndex] = 1;
    return;
  }

  waterStateOut[cellIndex] = getWaterState(x, y);
}
