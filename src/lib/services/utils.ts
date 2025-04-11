export class Utils {
  /** Returns a random direction in radians */
  pickRandomDirection() {
    return Math.random() * 2 * Math.PI;
  }

  /** Returns a slightly different value */
  randomlyNudgeValue(value: number, variability: number) {
    return value + (Math.random() - 0.5) * variability;
  }

  convertRadiansToVector(radians: number) {
    return new Float32Array([Math.cos(radians), Math.sin(radians)]);
  }

  pickRandomPointOnEdge(gridSize: number) {
    if (Math.random() < 0.25) {
      // Top edge
      return new Int32Array([Math.floor(Math.random() * gridSize), 0]);
    } else if (Math.random() < 0.5) {
      // Bottom edge
      return new Int32Array([
        Math.floor(Math.random() * gridSize),
        gridSize - 1,
      ]);
    } else if (Math.random() < 0.75) {
      // Left edge
      return new Int32Array([0, Math.floor(Math.random() * gridSize)]);
    } else {
      // Right edge
      return new Int32Array([
        gridSize - 1,
        Math.floor(Math.random() * gridSize),
      ]);
    }
  }

  getVerticesForSquare() {
    return new Float32Array([
      //   X,    Y,
      -1,
      -1, // Triangle 1 (Blue)
      1,
      -1,
      1,
      1,

      -1,
      -1, // Triangle 2 (Red)
      1,
      1,
      -1,
      1,
    ]);
  }
}

export default new Utils();

export function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  delay: number,
) {
  let lastCall = 0;
  return function (...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}
