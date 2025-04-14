<script lang="ts">
  const WIDTH = 720;
  const HEIGHT = 720;

  let brushLocation: Float32Array | null = $state(null);

  interface Props {
    onBrushMove: (event: Float32Array | null) => void;
    canvas: HTMLCanvasElement | null;
  }

  let { onBrushMove, canvas = $bindable() }: Props = $props();

  function setBrushLocation(event: MouseEvent) {
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    brushLocation = new Float32Array([x, y]);
    onBrushMove(brushLocation);
  }

  function onCanvasMouseMove(event: MouseEvent) {
    if (!brushLocation) {
      return;
    }
    setBrushLocation(event);
  }

  function clearBrushLocation() {
    brushLocation = null;
    onBrushMove(brushLocation);
  }

  function onPointerEnter(event: PointerEvent) {
    // "1" means primary button (left mouse button)
    if (event.buttons === 1) {
      setBrushLocation(event);
    }
  }
</script>

<canvas
  id="canvas"
  class="canvas"
  bind:this={canvas}
  onpointerdown={setBrushLocation}
  onpointermove={onCanvasMouseMove}
  onpointerup={clearBrushLocation}
  onpointerenter={onPointerEnter}
  onpointerleave={clearBrushLocation}
></canvas>

<style lang="scss">
  .canvas {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
  }
</style>
