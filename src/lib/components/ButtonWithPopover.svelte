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

<div class="relative">
  <Button {icon} {ariaLabel} onclick={() => (active = !active)}>
    {@render button?.()}
  </Button>
  {#if active}
    <div
      class="absolute translate-y-[-100%] translate-x-[-50%] top-0 left-1/2 bg-gray-100 p-3 rounded-lg shadow-md"
    >
      {@render children?.()}
    </div>
  {/if}
</div>
