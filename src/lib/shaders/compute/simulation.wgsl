@group(0) @binding({{GridSize}}) var<uniform> grid: vec2f;
@group(0) @binding({{WindDirection}}) var<uniform> windDirection: vec2f;

@group(0) @binding({{WaterSourceLocation}}) var<uniform> waterSourceLocation: vec2u;
@group(0) @binding({{WaterSourceHeight}}) var<uniform> waterSourceHeight: vec2f;
@group(0) @binding({{WaterStateA}}) var<storage> waterStateIn: array<i32>;
@group(0) @binding({{WaterStateB}}) var<storage, read_write> waterStateOut: array<i32>;

@group(0) @binding({{CellStateA}}) var<storage> cellStateIn: array<f32>;
@group(0) @binding({{CellStateB}}) var<storage, read_write> cellStateOut: array<f32>;

fn cellIndex(cell: vec2u) -> u32 {
  return (cell.y % u32(grid.y)) * u32(grid.x) +
         (cell.x % u32(grid.x));
}

fn getCellState(x: u32, y: u32) -> f32 {
  return cellStateIn[cellIndex(vec2(x, y))];
}

fn getWindMovedMaterial(x: u32, y: u32) -> f32 {
  let state = getCellState(x, y);
  let left = getCellState(x-1, y);
  let right = getCellState(x+1, y);
  let up = getCellState(x, y+1);
  let down = getCellState(x, y-1);

  let localMaximaFactor = state - (left + right + up + down) / 4.0;
  return clamp(localMaximaFactor / 2, 0.0, 10.0);
}

fn getWaterState(x: u32, y: u32) -> i32 {
  return waterStateIn[cellIndex(vec2(x, y))];
}

fn hasNeighborWithWater(x: u32, y: u32, value: i32) -> bool {
  let neighbors = array(
    vec2(1, 0),   // right
    vec2(-1, 0),  // left
    vec2(0, 1),   // up
    vec2(0, -1)   // down
  );
  
  for (var i = 0u; i < 4u; i = i + 1u) {
    let offset = neighbors[i];
    let nx = x + u32(offset.x);
    let ny = y + u32(offset.y);
    if (getWaterState(nx, ny) == value) {
      return true;
    }
  }
  return false;
}

fn updateWaterSpread(height: f32, x: u32, y: u32) {
  let cellIndex = cellIndex(vec2(x, y));
  if (waterSourceLocation.x == x && waterSourceLocation.y == y) {
    waterStateOut[cellIndex] = 1;
    return;
  }

  let hasWater = getWaterState(x, y) == 1;
  let waterHeight = waterSourceHeight.x;
  
  waterStateOut[cellIndex] = getWaterState(x, y);

  if (hasWater) {
    if (height > waterHeight) {
      waterStateOut[cellIndex] = 0;
    } 
  } else {
    if (height < waterHeight && hasNeighborWithWater(x, y, 1)) {
      waterStateOut[cellIndex] = 1;
    } 
  }
}

@compute
@workgroup_size({{WORKGROUP_SIZE}}, {{WORKGROUP_SIZE}})
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  let state = getCellState(cell.x, cell.y);
  let waterState = getWaterState(cell.x, cell.y);

  updateWaterSpread(state, cell.x , cell.y);

  // If underwater, there is no wind erosion
  if (waterState == 1) {
    let waterDepth = waterSourceHeight.x - state;
    let waterRemovedMaterial = max(20.0 - waterDepth / 20, 0.0);
    cellStateOut[cellIndex(cell.xy)] = clamp(state - waterRemovedMaterial, 0.0, 1000.0);
    return;
  }

  // Removed material from wind erosion
  let removedMaterial = getWindMovedMaterial(cell.x, cell.y);

  // Added material from wind erosion from neighboring cells
  var addedMaterial = 0.0;
  let windNormalized = normalize(windDirection);
  let windXAmount = pow(abs(windNormalized.x), 2);
  let windYAmount = pow(abs(windNormalized.y), 2);

  if (windDirection.x > 0.0) {
    addedMaterial += windXAmount * getWindMovedMaterial(cell.x - 1, cell.y);
  } else {
    addedMaterial += windXAmount * getWindMovedMaterial(cell.x + 1, cell.y);
  }

  if (windDirection.y > 0.0) {
    addedMaterial += windYAmount * getWindMovedMaterial(cell.x, cell.y + 1);
  } else {
    addedMaterial += windYAmount * getWindMovedMaterial(cell.x, cell.y - 1);
  }

  // Removed material from being near water
  var waterRemovedMaterial = 0.0;
  if (waterState == 1) {
    let waterDepth = waterSourceHeight.x - state;
    waterRemovedMaterial = max(20.0 - waterDepth / 100, 0.0);
  } else if (getWaterState(cell.x, cell.y - 1) == 1) {
    waterRemovedMaterial = 3.0;
  }

  cellStateOut[cellIndex(cell.xy)] = clamp(state - removedMaterial + addedMaterial - waterRemovedMaterial, 0.0, 1000.0);  
}
