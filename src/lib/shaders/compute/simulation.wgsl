@group(0) @binding({{GridSize}}) var<uniform> grid: vec2f;
@group(0) @binding({{WindDirection}}) var<uniform> windDirection: vec2f;

@group(0) @binding({{WaterSourceHeight}}) var<uniform> waterSourceHeight: f32;
@group(0) @binding({{WaterStateA}}) var<storage> waterStateIn: array<i32>;

@group(0) @binding({{ColorsA}}) var<storage> colorsIn: array<f32>;
@group(0) @binding({{ColorsB}}) var<storage, read_write> colorsOut: array<f32>;

const RGB_EROSION_FACTORS = vec3f(0.3, 0.25, 0.2);

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

fn setColorOut(x: i32, y: i32, color: vec3f) {
  let normalizedColor = clamp(color, vec3f(0.0), vec3f(255.0));
  let index = 3 * cellIndex(x, y);
  colorsOut[index] = normalizedColor.x;
  colorsOut[index + 1] = normalizedColor.y;
  colorsOut[index + 2] = normalizedColor.z;
}

fn getWindMovedMaterial(x: i32, y: i32) -> vec3f {
  let color = getColor(x, y);
  let state = calculateDarkness(color);
  let left = calculateDarkness(getColor(x-1, y));
  let right = calculateDarkness(getColor(x+1, y));
  let up = calculateDarkness(getColor(x, y+1));
  let down = calculateDarkness(getColor(x, y-1));

  let localMaximaFactor = state - (left + right + up + down) / 4.0;
  let scalingFactors = clamp(vec3f(localMaximaFactor) * color * RGB_EROSION_FACTORS, vec3f(0.0), vec3f(10.0));
  return scalingFactors;
}

fn getWaterState(x: i32, y: i32) -> i32 {
  return waterStateIn[cellIndex(x, y)];
}

@compute
@workgroup_size({{WORKGROUP_SIZE}}, {{WORKGROUP_SIZE}})
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  let x = i32(cell.x);
  let y = i32(cell.y);
  var color = getColor(x, y);
  let darkness = calculateDarkness(color);

  var waterState = getWaterState(x, y);
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
  var addedMaterial = vec3f(0.0);
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

  let delta = removedMaterial + addedMaterial - vec3f(waterRemovedMaterial);
  setColorOut(x, y, color + delta);
}
