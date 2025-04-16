@group(0) @binding({{GridSize}}) var<uniform> grid: vec2f;
@group(0) @binding({{WindDirection}}) var<uniform> windDirection: vec2f;

@group(0) @binding({{WaterSourceLocation}}) var<uniform> waterSourceLocation: vec2u;
@group(0) @binding({{WaterSourceHeight}}) var<uniform> waterSourceHeight: f32;
@group(0) @binding({{WaterStateA}}) var<storage> waterStateIn: array<i32>;
@group(0) @binding({{WaterStateB}}) var<storage, read_write> waterStateOut: array<i32>;

@group(0) @binding({{ColorsA}}) var<storage> colorsIn: array<f32>;
@group(0) @binding({{ColorsB}}) var<storage, read_write> colorsOut: array<f32>;

@group(0) @binding({{Tool}}) var<uniform> tool: i32;
@group(0) @binding({{ToolLocation}}) var<uniform> toolLocation: vec2f;
@group(0) @binding({{ToolColor}}) var<uniform> toolColor: vec3f;
@group(0) @binding({{ToolSize}}) var<uniform> toolSize: f32;
@group(0) @binding({{ToolOpacity}}) var<uniform> toolOpacity: f32;

const PENCIL = 0;
const PEN = 1;
const MARKER = 2;
const BRUSH = 3;
const WATER = 4;
const WIND_EROSION = 5;

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

fn calculateDarkness(color: vec3f) -> f32 {
  // max darkness (sqrt(3 * 255^2)) is 441.6729559301
  return length(vec3f(255.0) - color) / 441.6729559301;
}

fn setColorOut(x: i32, y: i32, color: vec3f) {
  let normalizedColor = clamp(color, vec3f(0.0), vec3f(255.0));
  let index = 3 * cellIndex(x, y);
  colorsOut[index] = normalizedColor.x;
  colorsOut[index + 1] = normalizedColor.y;
  colorsOut[index + 2] = normalizedColor.z;
}

fn getWindMovedMaterial(x: i32, y: i32) -> f32 {
  let state = calculateDarkness(getColor(x, y));
  let left = calculateDarkness(getColor(x-1, y));
  let right = calculateDarkness(getColor(x+1, y));
  let up = calculateDarkness(getColor(x, y+1));
  let down = calculateDarkness(getColor(x, y-1));

  let localMaximaFactor = state - (left + right + up + down) / 4.0;
  return clamp(localMaximaFactor * 200, 0.0, 10.0);
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

fn updateWaterSpread(color: vec3f, x: i32, y: i32) -> i32 {
  let cellIndex = cellIndex(x, y);
  if (i32(waterSourceLocation.x) == x && i32(waterSourceLocation.y) == y) {
    waterStateOut[cellIndex] = 1;
    return 1;
  }

  let darkness = calculateDarkness(color);
  if (darkness > waterSourceHeight) {
    waterStateOut[cellIndex] = 0;
    return 0;
  } else if (darkness < waterSourceHeight && hasNeighborWithWater(x, y, 1)) {
    waterStateOut[cellIndex] = 1;
    return 1;
  }

  let currentState = getWaterState(x, y);
  waterStateOut[cellIndex] = currentState;
  return currentState;
}

fn addMaterialFromTool(color: vec3f, x: i32, y: i32) -> vec3f {
  let distanceToTool = distance(vec2f(f32(x), f32(y)), toolLocation - 0.5);

  if (tool == PENCIL || tool == PEN) {
    if (distanceToTool < toolSize) {
      let colorDifference = color - toolColor;
      let change = toolOpacity * colorDifference;

      return clamp(color - change, vec3f(0.0), vec3f(255.0));
    }
  }

  return color;
}

@compute
@workgroup_size({{WORKGROUP_SIZE}}, {{WORKGROUP_SIZE}})
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  let x = i32(cell.x);
  let y = i32(cell.y);
  var color = getColor(x, y);
  let darkness = calculateDarkness(color);
  var waterState = getWaterState(x, y);

  if (toolLocation.x != -1.0) {
    color = addMaterialFromTool(color, x, y);
  }
  waterState = updateWaterSpread(color, x, y);

  // If underwater, there is no wind erosion
  if (waterState == 1) {
    let waterDepth = waterSourceHeight - darkness;
    let waterRemovedMaterial = clamp(20.0 - waterDepth * 20, 0.0, 255.0);
    setColorOut(x, y, color + vec3f(waterRemovedMaterial));
    return;
  }

  // Removed material from wind erosion
  let removedMaterial = getWindMovedMaterial(x, y);

  // Added material from wind erosion from neighboring cells
  var addedMaterial = 0.0;
  let windNormalized = normalize(windDirection);
  let windXAmount = pow(abs(windNormalized.x), 2);
  let windYAmount = pow(abs(windNormalized.y), 2);

  if (windDirection.x > 0.0) {
    addedMaterial += windXAmount * getWindMovedMaterial(x - 1, y);
  } else {
    addedMaterial += windXAmount * getWindMovedMaterial(x + 1, y);
  }

  if (windDirection.y > 0.0) {
    addedMaterial += windYAmount * getWindMovedMaterial(x, y + 1);
  } else {
    addedMaterial += windYAmount * getWindMovedMaterial(x, y - 1);
  }

  // Removed material from being near water
  var waterRemovedMaterial = 0.0;
  if (waterState == 1) {
    let waterDepth = waterSourceHeight - darkness;
    waterRemovedMaterial = max(20.0 - waterDepth * 4, 0.0);
  } else if (getWaterState(x, y - 1) == 1) {
    waterRemovedMaterial = 3.0;
  }

  let delta = removedMaterial + addedMaterial - waterRemovedMaterial;
  setColorOut(x, y, color + vec3f(delta));
}
