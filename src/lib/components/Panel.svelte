<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    tag?: string;
    class?: string;
    children?: Snippet;
  }

  let { tag = "div", class: className = "", children }: Props = $props();
</script>

<svelte:element
  this={tag}
  class={[
    "z-10 fixed flex p-3 gap-2 bg-gray-100 shadow-md inset-shadow-sm inset-shadow-white/50",
    className,
  ]}
>
  {@render children?.()}
</svelte:element>
