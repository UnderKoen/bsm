import { SimplePlugin } from "../Plugin";

export const PlatformPlugin = new SimplePlugin(`_${process.platform}`);
