<script lang="ts">
  import type { Snippet } from "svelte";

  import Button from "@/lib/components/Button.svelte";

  interface Props {
    icon?: string;
    ariaLabel?: string;
    children?: Snippet;
    button?: Snippet;
    meter?: Snippet;
    onChange?: (active: boolean) => void;
  }

  let { icon, ariaLabel, children, button, meter, onChange }: Props = $props();

  let active = $state(false);

  function setActive(updated: boolean) {
    active = updated;
    onChange?.(active);
  }
</script>

<div class="flex flex-col items-center gap-1">
  {@render meter?.()}
  <div
    class={[
      "relative transition-all rounded-lg overflow-hidden h-full",
      { "w-40 shadow-lg -mt-2": active, "w-10": !active },
    ]}
    onmouseleave={() => setActive(false)}
    role={active ? "dialog" : "button"}
  >
    {#if !active}
      <Button
        class="w-full"
        {icon}
        {ariaLabel}
        onclick={() => setActive(!active)}
      >
        {@render button?.()}
      </Button>
    {:else}
      <div class="h-full">
        {@render children?.()}
      </div>
    {/if}
  </div>
</div>
