@group(0) @binding({{GridSize}}) var<uniform> grid: vec2f;
@group(0) @binding({{WindDirection}}) var<uniform> windDirection: vec2f;

@group(0) @binding({{WaterSourceHeight}}) var<uniform> waterSourceHeight: f32;
@group(0) @binding({{WaterStateA}}) var<storage> waterStateIn: array<i32>;

@group(0) @binding({{ColorsA}}) var<storage> colorsIn: array<f32>;
@group(0) @binding({{ColorsB}}) var<storage, read_write> colorsOut: array<f32>;

@group(0) @binding({{MovedMaterial}}) var<storage, read_write> movedMaterial: array<f32>;

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

fn setColorOut(x: i32, y: i32, color: vec3f) {
  let normalizedColor = clamp(color, vec3f(0.0), vec3f(255.0));
  let index = 3 * cellIndex(x, y);
  colorsOut[index] = normalizedColor.x;
  colorsOut[index + 1] = normalizedColor.y;
  colorsOut[index + 2] = normalizedColor.z;
}

@compute
@workgroup_size({{WORKGROUP_SIZE}}, {{WORKGROUP_SIZE}})
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  let x = i32(cell.x);
  let y = i32(cell.y);
  var color = getColor(x, y);
  let darkness = calculateDarkness(color);

  if (toolLocation.x != RESET) {
    let distanceToTool = distance(vec2f(f32(x), f32(y)), toolLocation - 0.5);

    if (tool == PENCIL || tool == PEN) {
      if (distanceToTool < toolSize) {
        let colorDifference = color - toolColor;
        let distanceFactor = clamp((toolSize - distanceToTool - 4.0) / 4.0, 0.0, 1.0);

        let change = toolOpacity * colorDifference * distanceFactor;
        let newColor = clamp(color - change, vec3f(0.0), vec3f(255.0));
        setColorOut(x, y, newColor);
      }
    }
  }
}
