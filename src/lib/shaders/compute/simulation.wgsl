@group(0) @binding({{GridSize}}) var<uniform> grid: vec2f;
@group(0) @binding({{WindDirection}}) var<uniform> windDirection: vec2f;

@group(0) @binding({{WaterSourceLocation}}) var<uniform> waterSourceLocation: vec2u;
@group(0) @binding({{WaterSourceHeight}}) var<uniform> waterSourceHeight: f32;
@group(0) @binding({{WaterStateA}}) var<storage> waterStateIn: array<i32>;
@group(0) @binding({{WaterStateB}}) var<storage, read_write> waterStateOut: array<i32>;

@group(0) @binding({{HeightStateA}}) var<storage> heightStateIn: array<f32>;
@group(0) @binding({{HeightStateB}}) var<storage, read_write> heightStateOut: array<f32>;

@group(0) @binding({{BrushLocation}}) var<storage, read_write> brushLocation: vec2f;

fn cellIndex(cell: vec2u) -> u32 {
  return (min(cell.y, u32(grid.y) - 1)) * u32(grid.x) +
         (min(cell.x, u32(grid.x) - 1));
}

fn getHeight(x: u32, y: u32) -> f32 {
  return heightStateIn[cellIndex(vec2(x, y))];
}

fn getWindMovedMaterial(x: u32, y: u32) -> f32 {
  let state = getHeight(x, y);
  let left = getHeight(x-1, y);
  let right = getHeight(x+1, y);
  let up = getHeight(x, y+1);
  let down = getHeight(x, y-1);

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
  
  waterStateOut[cellIndex] = getWaterState(x, y);

  if (hasWater) {
    if (height > waterSourceHeight) {
      waterStateOut[cellIndex] = 0;
    } 
  } else {
    if (height < waterSourceHeight && hasNeighborWithWater(x, y, 1)) {
      waterStateOut[cellIndex] = 1;
    } 
  }
}

fn addMaterialFromBrush(height: f32, x: u32, y: u32) -> f32 {
  let distanceToBrush = distance(vec2f(f32(x), f32(y)), brushLocation - 0.5);
  let addedMaterial = 50.0 - pow(distanceToBrush, 3);
  
  let cellIndex = cellIndex(vec2(x, y));
  if (addedMaterial > 0.0) {
    return clamp(height + addedMaterial, 0.0, 1000.0);
  }

  return height;
}

@compute
@workgroup_size({{WORKGROUP_SIZE}}, {{WORKGROUP_SIZE}})
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  var state = getHeight(cell.x, cell.y);
  let waterState = getWaterState(cell.x, cell.y);

  if (brushLocation.x != -1.0) {
    state = addMaterialFromBrush(state, cell.x, cell.y);
  }
  updateWaterSpread(state, cell.x , cell.y);

  // If underwater, there is no wind erosion
  if (waterState == 1) {
    let waterDepth = waterSourceHeight - state;
    let waterRemovedMaterial = max(20.0 - waterDepth / 20, 0.0);
    heightStateOut[cellIndex(cell.xy)] = clamp(state - waterRemovedMaterial, 0.0, 1000.0);
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
    let waterDepth = waterSourceHeight - state;
    waterRemovedMaterial = max(20.0 - waterDepth / 100, 0.0);
  } else if (getWaterState(cell.x, cell.y - 1) == 1) {
    waterRemovedMaterial = 3.0;
  }

  heightStateOut[cellIndex(cell.xy)] = clamp(state - removedMaterial + addedMaterial - waterRemovedMaterial, 0.0, 1000.0);  
}
