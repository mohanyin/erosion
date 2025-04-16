<script lang="ts">
  interface Props {
    icon?: string;
    ariaLabel?: string;
    onclick?: () => void;
    children?: () => any;
  }

  const { icon, ariaLabel, onclick, children }: Props = $props();
</script>

<button
  class={[
    "w-10 h-8 cursor-pointer flex items-center justify-center text-center rounded-lg bg-gray-200 text-black",
    { icon: !!icon },
  ]}
  aria-label={ariaLabel}
  {onclick}
>
  {#if icon}
    <div class="icon">{icon}</div>
  {/if}
  {@render children?.()}
</button>
