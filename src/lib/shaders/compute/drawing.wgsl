@group(0) @binding({{GridSize}}) var<uniform> grid: vec2f;

@group(0) @binding({{WaterSourceHeight}}) var<uniform> waterSourceHeight: f32;
@group(0) @binding({{WaterStateA}}) var<storage> waterStateIn: array<i32>;

@group(0) @binding({{ColorsA}}) var<storage> colorsIn: array<vec3f>;
@group(0) @binding({{ColorsB}}) var<storage, read_write> colorsOut: array<vec3f>;

@group(0) @binding({{Tool}}) var<uniform> tool: i32;
@group(0) @binding({{ToolLocation}}) var<storage> toolLocations: array<vec2f>;
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

fn shortestDistance(point: vec2f) -> f32 {
  var minDistance = 100000000.0;
  for (var i = 0; u32(i) < arrayLength(&toolLocations); i++) {
    if (toolLocations[i].x == RESET) {
      break;
    }
    let distance = length(point - toolLocations[i]);
    minDistance = min(minDistance, distance);
  }
  return minDistance;
}


fn getWindMovedMaterial(cell: vec2i) -> vec3f {
  let index = cellIndex(cell.x, cell.y);
  let color = colorsIn[index];
  let darkness = calculateDarkness(color);

  let vectorToTool = vec2f(f32(cell.x), f32(cell.y)) - toolLocations[0];
  let source = getSourceFromWind(atan2(vectorToTool.y, vectorToTool.x), 1.0);

  let invertedColor = vec3f(255.0) - color;
  let randomFactors = vec3f(
    0.9 + 0.2 * darkness,
    0.6 + 0.4 * darkness,
    1.2 - 0.4 * darkness
  );

  let closeness = 1 - (length(vectorToTool) / toolSize);
  return clamp(
    invertedColor * randomFactors * closeness * toolOpacity, 
    vec3f(0.0), 
    invertedColor / 5.0
  );
}

fn calculateWindErosion(cell: vec2i) -> vec3f {
  let x = i32(cell.x);
  let y = i32(cell.y);

  let vectorToTool = normalize(vec2f(f32(cell.x), f32(cell.y)) - toolLocations[0]);

  let color = colorsIn[cellIndex(x, y)];
  return color + 
    getWindMovedMaterial(cell) - 
    0.35 * getWindMovedMaterial(cell - vec2i(i32(vectorToTool.x), i32(vectorToTool.y))) - 
    0.2 * getWindMovedMaterial(cell - vec2i(i32(vectorToTool.x * 3.0), i32(vectorToTool.y * 3.0))) - 
    0.1 * getWindMovedMaterial(cell - vec2i(i32(vectorToTool.x * 9.0), i32(vectorToTool.y * 9.0)));
}

@compute
@workgroup_size({{WORKGROUP_SIZE}}, {{WORKGROUP_SIZE}})
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  if (toolLocations[0].x == RESET) {
    return;
  }

  let x = i32(cell.x);
  let y = i32(cell.y);
  let color = colorsIn[cellIndex(x, y)];

  if (tool == WIND_EROSION) {
    let newColor = calculateWindErosion(vec2i(x, y));
    colorsOut[cellIndex(x, y)] = normalizeColor(newColor);
    return;
  }

  let distanceToTool = shortestDistance(vec2f(f32(x), f32(y)));;
  if (distanceToTool > toolSize) {
    return;
  }
  
  let closeness = 1 - (distanceToTool / toolSize);
  let colorDifference = color - toolColor;
  var newColor = color;

  if (tool == PENCIL) {
    let textureSeed = f32(cellIndex(x, y)) / (toolSize / 6.0);
    let textureFactor = sqrt(((textureSeed * 23.0) % 48.0) + 16.0) / 8.0;
    let change = toolOpacity * colorDifference  * textureFactor * pow(closeness, 0.7);
    newColor = color - change / 2;
  } else if (tool == PEN) {
    let change = toolOpacity * colorDifference * pow(closeness, 0.4);
    newColor = color - change / 1.5;
  } else if (tool == MARKER) {
    let change = toolOpacity * max(colorDifference, vec3f(0.0)) * pow(closeness, 0.4);
    newColor = color - change / 4;
  } else if (tool == BRUSH) {
    let brushDirection = normalize(toolLocations[0] - toolLocations[1]);
    let textureSeed = abs(dot(brushDirection, vec2f(f32(x), f32(y)))) / (toolSize / 6.0);
    let textureFactor = sqrt((textureSeed * 301.0) % 64.0) / 8.0;
    let change = toolOpacity * colorDifference  * textureFactor * sqrt(closeness);
    newColor = color - change / 2;
  }

  colorsOut[cellIndex(x, y)] = normalizeColor(newColor);
}
