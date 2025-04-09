export class Simulation {
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
}

export default new Simulation();
