<script lang="ts">
  let toolLocation: Float32Array | null = $state(null);

  interface Props {
    onToolMove: (event: Float32Array | null) => void;
    canvas: HTMLCanvasElement | null;
  }

  let { onToolMove, canvas = $bindable() }: Props = $props();

  function setToolLocation(event: MouseEvent) {
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    toolLocation = new Float32Array([x, y]);
    onToolMove(toolLocation);
  }

  function onCanvasMouseMove(event: MouseEvent) {
    if (!toolLocation) {
      return;
    }
    setToolLocation(event);
  }

  function clearToolLocation() {
    toolLocation = null;
    onToolMove(toolLocation);
  }

  function onPointerEnter(event: PointerEvent) {
    // "1" means primary button (left mouse button)
    if (event.buttons === 1) {
      setToolLocation(event);
    }
  }
</script>

<canvas
  id="canvas"
  class="canvas"
  bind:this={canvas}
  onpointerdown={setToolLocation}
  onpointermove={onCanvasMouseMove}
  onpointerup={clearToolLocation}
  onpointerenter={onPointerEnter}
  onpointerleave={clearToolLocation}
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
