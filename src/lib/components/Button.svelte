<script lang="ts">
  interface Props {
    icon: string;
    ariaLabel?: string;
    onclick?: () => void;
  }

  const { icon, ariaLabel, onclick }: Props = $props();
</script>

<button
  class={[
    "w-10 h-8 cursor-pointer flex items-center justify-center text-center rounded-lg bg-gray-200 text-black",
    { icon: !!icon },
  ]}
  aria-label={ariaLabel}
  {onclick}
>
  <div>
    {icon}
  </div>
</button>
