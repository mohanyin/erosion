<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ClassValue } from "svelte/elements";

  export interface Props {
    highlight?: boolean;
    icon?: string;
    class?: ClassValue;
    ariaLabel?: string;
    onclick?: () => void;
    children?: Snippet;
  }

  const {
    highlight,
    icon,
    ariaLabel,
    onclick,
    children,
    class: className,
  }: Props = $props();
</script>

<button
  class={[
    "w-10 h-8 cursor-pointer flex items-center justify-center text-center rounded-lg",
    {
      "bg-blue-500 text-white": highlight,
      "bg-gray-200 text-black": !highlight,
    },
    className,
  ]}
  aria-label={ariaLabel}
  {onclick}
>
  {#if icon}
    <div class="icon">{icon}</div>
  {/if}
  {@render children?.()}
</button>
