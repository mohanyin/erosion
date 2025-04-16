<script lang="ts">
  import Button from "@/lib/components/Button.svelte";
  import Panel from "@/lib/components/Panel.svelte";
  import StrokeWidth from "@/assets/icons/StrokeWidth.svelte";
  import Opacity from "@/assets/icons/Opacity.svelte";

  interface Props {
    isDrawing: boolean;
    onDrawingToggled: (drawing: boolean) => void;
  }

  let { isDrawing, onDrawingToggled }: Props = $props();
</script>

<Panel
  tag="footer"
  class="bottom-0 left-[50%] translate-x-[-50%] rounded-se-lg rounded-ss-lg"
>
  <Button icon={"stylus_pencil"} ariaLabel={"Pencil"} />
  <Button icon={"water"} ariaLabel={"Paint with water"} />
  <Button icon={"air"} ariaLabel={"Erode with air"} />
  <div class="w-[1px] h-fill bg-gray-300"></div>
  <Button ariaLabel={"Stroke width"}><StrokeWidth /></Button>
  <Button ariaLabel={"Opacity"}><Opacity /></Button>
  <div class="w-[1px] h-fill bg-gray-300"></div>
  <Button ariaLabel={"Hue"}>H</Button>
  <Button ariaLabel={"Saturation"}>S</Button>
  <Button ariaLabel={"Lightness"}>L</Button>
</Panel>
