import { createRoot } from "react-dom/client";
import "./index.css";
import { ChartPg } from "./ChartPg.tsx";

createRoot(document.getElementById("root")!).render(
  <>
    <ChartPg />
  </>,
);
