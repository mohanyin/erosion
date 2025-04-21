<script lang="ts">
  import type { Snippet } from "svelte";

  import Button from "@/lib/components/Button.svelte";

  interface Props {
    icon?: string;
    ariaLabel?: string;
    children?: Snippet;
    button?: Snippet;
  }

  let { icon, ariaLabel, children, button }: Props = $props();

  let active = $state(false);
</script>

<div
  class={[
    "relative transition-all rounded-lg overflow-hidden",
    { "w-40 shadow-lg": active, "w-10": !active },
  ]}
  onmouseleave={() => (active = false)}
  role={active ? "dialog" : "button"}
>
  {#if !active}
    <Button
      class="w-full"
      {icon}
      {ariaLabel}
      onclick={() => (active = !active)}
    >
      {@render button?.()}
    </Button>
  {:else}
    <div class="h-full">
      {@render children?.()}
    </div>
  {/if}
</div>
