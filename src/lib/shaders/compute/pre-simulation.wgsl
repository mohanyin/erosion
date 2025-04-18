@group(0) @binding({{GridSize}}) var<uniform> grid: vec2f;
@group(0) @binding({{MovedMaterial}}) var<storage, read_write> movedMaterial: array<vec3f>;

@compute
@workgroup_size({{WORKGROUP_SIZE}}, {{WORKGROUP_SIZE}})
fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
  let index = cell.y * u32(grid.x) + cell.x;
  movedMaterial[index] = vec3f(RESET);
}
