import { CurveInterpolator as CurveInterpolatorLib } from "curve-interpolator";

const TENSION = 0.0;
const ALPHA = 1.0;

const POINT_DENSITY = 0.4;
export const MAX_SEGMENTS = 50;

type Point = number[];

export class CurveInterpolator {
  private points: Point[] = [];
  private previousInterpolation: CurveInterpolatorLib | null = null;
  private currentInterpolation: CurveInterpolatorLib | null = null;

  get currentPoint() {
    return this.points[this.points.length - 1];
  }

  addControlPoint(point: Point) {
    this.points = [...this.points.slice(-4), point];
    if (this.points.length >= 2) {
      this.previousInterpolation = this.currentInterpolation;
      this.currentInterpolation = new CurveInterpolatorLib(this.points, {
        tension: TENSION,
        alpha: ALPHA,
      });
    }
  }

  private getSegmentCount(length: number) {
    return Math.min(Math.max(length * POINT_DENSITY, 1), MAX_SEGMENTS);
  }

  getNewestPoints(): Point[] {
    if (!this.currentInterpolation) {
      return [this.currentPoint];
    } else if (!this.previousInterpolation) {
      const segments = this.getSegmentCount(this.currentInterpolation.length);
      const points = this.currentInterpolation.getPoints(segments);
      return points;
    } else {
      const previousPoint = this.points[this.points.length - 2];
      const { u: start } =
        this.currentInterpolation.getNearestPosition(previousPoint);

      const segmentStart =
        (start + POINT_DENSITY) / this.currentInterpolation.length;
      if (segmentStart >= 1) {
        return [this.currentPoint];
      }

      const segmentLength = (1 - start) * this.currentInterpolation.length;
      return this.currentInterpolation.getPoints(
        this.getSegmentCount(segmentLength),
        null,
        segmentStart,
        1,
      ) as Point[];
    }
  }

  reset() {
    this.previousInterpolation = null;
    this.currentInterpolation = null;
    this.points = [];
  }
}
