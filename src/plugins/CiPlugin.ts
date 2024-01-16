import { SimplePlugin } from "../Plugin";
import { isCI } from "ci-info";

export const CiPlugin = new SimplePlugin("_ci", () => isCI);
