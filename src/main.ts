import { mount } from "svelte";

import App from "./app/App.svelte";
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/app.css";
import "./styles/markdown.css";
import "./styles/themes.css";

const target = document.getElementById("app");

if (!target) {
  throw new Error("LitheMark could not find its application mount point.");
}

mount(App, { target });
