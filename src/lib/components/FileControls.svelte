<script lang="ts">
  import Button from "@/lib/components/Button.svelte";

  interface Props {
    isPlaying: boolean;
    onPlayToggled: (play: boolean) => void;
    windDirection: number;
  }

  let { isPlaying, onPlayToggled, windDirection }: Props = $props();
</script>

<header
  class="z-10 absolute top-0 left-0 flex p-3 gap-2 bg-gray-100 rounded-ee-lg
"
>
  <div class="w-10 h-8 flex items-center justify-center">
    <span
      class="icon text-black"
      style="transform: rotate({windDirection}rad);"
    >
      assistant_navigation
    </span>
  </div>
  <Button
    icon={isPlaying ? "pause" : "play_arrow"}
    ariaLabel={isPlaying ? "Pause" : "Play"}
    onclick={() => onPlayToggled(!isPlaying)}
  />
</header>
