const LUMINANCE_COEFFICIENTS = vec3f(0.299, 0.587, 0.114);
const RESET = -1.0;

fn calculateDarkness(color: vec3f) -> f32 {
  return 1 - dot(color / 255.0, LUMINANCE_COEFFICIENTS);
}
