<script lang="ts">
  import Button from "@/lib/components/Button.svelte";
  import Panel from "@/lib/components/Panel.svelte";

  interface Props {
    isPlaying: boolean;
    onDownload: () => void;
    onUpload: (file: File) => void;
    onPlayToggled: (play: boolean) => void;
    windDirection: number;
  }

  let { isPlaying, onPlayToggled, onDownload, onUpload, windDirection }: Props =
    $props();

  function pickFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        onUpload(file);
        input.remove();
      }
    };
    input.click();
  }
</script>

<Panel tag="header" class="top-0 left-0 rounded-ee-lg">
  <Button icon="download" ariaLabel="Download image" onclick={onDownload} />
  <Button
    icon="upload_file"
    ariaLabel="Upload image"
    onclick={() => pickFile()}
  />

  <div class="w-[1px] h-fill bg-gray-300"></div>

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
</Panel>
