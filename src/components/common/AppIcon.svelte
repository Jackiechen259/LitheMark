<script lang="ts">
  import appIcon from "../../assets/lithemark-icon.png";

  let {
    size = 20,
    decorative = true,
  }: {
    size?: number;
    decorative?: boolean;
  } = $props();
</script>

<img
  class="app-icon"
  src={appIcon}
  alt={decorative ? "" : "LitheMark"}
  width={size}
  height={size}
  draggable="false"
  aria-hidden={decorative || undefined}
/>
