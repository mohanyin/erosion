const LUMINANCE_COEFFICIENTS = vec3f(0.299, 0.587, 0.114);
const RESET = -1.0;
const PI: f32 = 3.141592653589793238462643;

fn calculateDarkness(color: vec3f) -> f32 {
  return 1 - dot(color / 255.0, LUMINANCE_COEFFICIENTS);
}

fn normalizeColor(color: vec3f) -> vec3f {
  return clamp(color, vec3f(0.0), vec3f(255.0));
}
