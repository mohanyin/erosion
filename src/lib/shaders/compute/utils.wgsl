fn calculateDarkness(color: vec3f) -> f32 {
  // max darkness (sqrt(3 * 255^2)) is 441.6729559301
  return length(vec3f(255.0) - color) / 441.6729559301;
}
