@group(0) @binding({{GridSize}}) var<uniform> grid: vec2f;
@group(0) @binding({{WindDirection}}) var<uniform> windDirection: f32;

@group(0) @binding({{WaterSourceHeight}}) var<uniform> waterSourceHeight: f32;
@group(0) @binding({{WaterStateA}}) var<storage> waterStateIn: array<i32>;

@group(0) @binding({{ColorsA}}) var<storage> colorsIn: array<vec3f>;
@group(0) @binding({{ColorsB}}) var<storage, read_write> colorsOut: array<vec3f>;

@group(0) @binding({{MovedMaterial}}) var<storage, read_write> movedMaterial: array<vec3f>;

const RGB_EROSION_FACTORS = vec3f(1, 0.8, 0.6);

fn clampCellToGrid(x: i32, y: i32) -> vec2i {
  return vec2i(clamp(x, 0, i32(grid.x) - 1), clamp(y, 0, i32(grid.y) - 1));
}

fn cellIndex(x: i32, y: i32) -> u32 {
  let clampedCell = clampCellToGrid(x, y);
  return (u32(clampedCell.y) * u32(grid.x) + u32(clampedCell.x));
}

fn getSourceFromWind(direction: f32) -> vec2i {
  let sourceDirection = windDirection + PI;
  return vec2i(
    i32(round(sin(sourceDirection))), 
    i32(round(cos(sourceDirection)))
  );
}

fn getWindMovedMaterial(x: i32, y: i32) -> vec3f {
  let index = cellIndex(x, y);
  if (movedMaterial[index].r != RESET) {
    return movedMaterial[index];
  }

  let color = colorsIn[cellIndex(x, y)];
  let darkness = calculateDarkness(color);

  let source = getSourceFromWind(windDirection);
  let sourceIndex = cellIndex(x + source.x, y + source.y);
  let sourceDarkness = calculateDarkness(colorsIn[sourceIndex]);

  if (sourceDarkness >= darkness + 0.05) {
    movedMaterial[index] = vec3f(0.0);
    return movedMaterial[index];
  }

  let destIndex = cellIndex(x - source.x, y - source.y);
  let destDarkness = calculateDarkness(colorsIn[destIndex]);

  let localMaximaFactor = darkness - (sourceDarkness + destDarkness) / 2.0;
  let invertedColor = vec3f(255.0) - color;
  let moved = clamp(localMaximaFactor * invertedColor * RGB_EROSION_FACTORS, vec3f(0.0), invertedColor / 10.0);
  
  movedMaterial[index] = moved;
  return movedMaterial[index];
}

fn getWaterState(x: i32, y: i32) -> i32 {
  return waterStateIn[cellIndex(x, y)];
}

@compute
@workgroup_size({{WORKGROUP_SIZE}}, {{WORKGROUP_SIZE}})
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  let x = i32(cell.x);
  let y = i32(cell.y);
  let index = cellIndex(x, y);
  var color = colorsIn[index];
  let darkness = calculateDarkness(color);

  var waterState = getWaterState(x, y);
  // If underwater, there is no wind erosion
  if (waterState == 1) {
    let waterDepth = waterSourceHeight - darkness;
    let waterRemovedMaterial = clamp(20.0 - waterDepth * 20, 0.0, 10.0);
    colorsOut[index] = normalizeColor(color + vec3f(waterRemovedMaterial));
    return;
  }

  // Removed material from wind erosion
  let removedMaterial = getWindMovedMaterial(x, y);

  // Added material from wind erosion from neighboring cells
  let source = getSourceFromWind(windDirection);
  var addedMaterial = 0.5 * getWindMovedMaterial(
    x + source.x, 
    y + source.y
  ) + 0.25 * getWindMovedMaterial(
    x + 2 * source.x, 
    y + 2 * source.y
  ) + 0.125 * getWindMovedMaterial(
    x + 4 * source.x, 
    y + 4 * source.y
  ) + 0.125 * getWindMovedMaterial(
    x + 8 * source.x, 
    y + 8 * source.y
  );

  // Removed material from being near water
  var waterRemovedMaterial = 0.0;
  if (waterState == 1) {
    let waterDepth = waterSourceHeight - darkness;
    waterRemovedMaterial = max(20.0 - waterDepth * 4, 0.0);
  } else if (getWaterState(x, y - 1) == 1) {
    waterRemovedMaterial = 3.0;
  }

  let delta = removedMaterial - addedMaterial + vec3f(waterRemovedMaterial);
  colorsOut[index] = normalizeColor(color + delta);
}
