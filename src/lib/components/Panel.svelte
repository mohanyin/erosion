<script lang="ts">
  interface Props {
    tag?: string;
    class?: string;
    children?: () => any;
  }

  let { tag = "div", class: className = "", children }: Props = $props();
</script>

<svelte:element
  this={tag}
  class={["z-10 fixed flex p-3 gap-2 bg-gray-100 shadow-md", className]}
>
  {@render children?.()}
</svelte:element>
