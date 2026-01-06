import { createHash } from "node:crypto";
import { ConfigLoader } from "./ConfigLoader.js";
import fs from "fs";
import path from "path";
import { TScripts } from "./types.js";
import { Options } from "./Executor.js";
import { Logger } from "./Logger.js";
import { globSync } from "glob";

type IdempotencyType = "file" | "dir" | "env" | "static" | "glob";
type IdempotencyKey = `${IdempotencyType}:${string}`;

type IdempotencyKeyMap = {
  // Key is just for labeling purposes
  [label: string]: IdempotencyConfig;
};

export type IdempotencyConfig =
  | IdempotencyKey
  | IdempotencyKey[]
  | IdempotencyKeyMap;

export class Idempotency {
  public static get useFileContent(): boolean {
    return ConfigLoader.config.config?.idempotency?.useFileContent ?? false;
  }

  private static get location(): string {
    return (
      ConfigLoader.config.config?.idempotency?.location ??
      "./node_modules/.cache/bsm/idempotency"
    );
  }

  private static updateHashForFile(
    hash: ReturnType<typeof createHash>,
    path: string,
  ): void {
    try {
      if (this.useFileContent) {
        const content = fs.readFileSync(path);
        hash.update(content);
      } else {
        const stats = fs.lstatSync(path);
        hash.update(stats.ctimeMs.toString());
        hash.update(stats.mtimeMs.toString());
      }
    } catch {
      // File does not exist
    }
  }

  private static updateHashForDir(
    hash: ReturnType<typeof createHash>,
    dir: string,
  ): void {
    try {
      fs.readdirSync(dir, {
        withFileTypes: true,
        recursive: true,
      }).forEach((file) => {
        // Is for node 18
        /* eslint-disable */
        /* c8 ignore next 3 */
        if (file.name == null) return;
        const fullPath = path
          .join(file.parentPath ?? file.path ?? dir, file.name)
          .replace(/\\/g, "/");
        /* eslint-enable */
        hash.update(fullPath);
        if (file.isFile()) this.updateHashForFile(hash, fullPath);
      });
    } catch {
      // Directory does not exist
    }
  }

  private static updateHashForGlob(
    hash: ReturnType<typeof createHash>,
    glob: string,
  ): void {
    try {
      const files = globSync(glob, { withFileTypes: true });
      for (const file of files) {
        // To ensure the hash is consistent across different environments,
        const pth = path.relative(process.cwd(), file.fullpath());
        if (file.isFile()) {
          this.updateHashForFile(hash, pth);
        } else {
          this.updateHashForDir(hash, pth);
        }
      }
      /* c8 ignore next 3 */
    } catch {
      // Unknown error, glob might not be valid or files might not exist
    }
  }

  private static getIdempotencyKeys(
    this: void,
    config: IdempotencyConfig,
  ): IdempotencyKey[] {
    if (typeof config === "string") {
      return [config];
    } else if (typeof config === "object") {
      return Object.values(config).flatMap(Idempotency.getIdempotencyKeys);
    }

    Logger.error(
      // please use (type: ${typeof config} not supported) in message in color
      `\x1b[31m[Idempotency] Invalid idempotency config (type: \x1B[4m${typeof config}\x1B[0m\x1b[31m not supported)\x1b[0m`,
    );

    return [];
  }

  public static calculateIdempotencyHash(
    config: IdempotencyConfig,
    options?: Options,
  ): string {
    const keys = Idempotency.getIdempotencyKeys(config);
    const hash = createHash("sha256");

    for (const key of keys) {
      const type = key.split(":")[0] as IdempotencyType;
      const value = key.substring(type.length + 1);

      switch (type) {
        case "static":
          hash.update(value);
          break;
        case "env":
          hash.update(value);
          hash.update(
            options?.env?.[value] ?? process.env[value] ?? Buffer.of(),
          );
          break;
        case "file":
          this.updateHashForFile(hash, value);
          break;
        case "dir":
          this.updateHashForDir(hash, value);
          break;
        case "glob":
          this.updateHashForGlob(hash, value);
          break;
        default:
          Logger.log(
            `\x1b[33m[Idempotency]\x1b[0m Unknown type: ${type as string}, using value as static`,
          );
          hash.update(key);
      }
    }

    return hash.digest("hex");
  }

  private static getFileName(path: string[]): string {
    const script = path.join(".");

    return `${this.location}/${script}.hash`.replaceAll("*", "__all__");
  }

  public static saveIdempotencyHash(hash: string, path: string[]): void {
    fs.mkdirSync(this.location, { recursive: true });
    fs.writeFileSync(this.getFileName(path), hash);
  }

  public static getSavedIdempotencyHash(path: string[]): string | undefined {
    const fullPath = this.getFileName(path);
    if (!fs.existsSync(fullPath)) return undefined;
    return fs.readFileSync(fullPath, "utf-8");
  }

  public static checkIdempotency(
    context: TScripts,
    path: string[],
    options?: Options,
  ): boolean {
    const config = context["$idempotency"] as IdempotencyConfig;
    const hash = this.calculateIdempotencyHash(config, options);
    const savedHash = this.getSavedIdempotencyHash(path);
    return savedHash === hash;
  }

  public static saveIdempotency(context: TScripts, path: string[]): void {
    const config = context["$idempotency"] as IdempotencyConfig;
    const hash = this.calculateIdempotencyHash(config);
    this.saveIdempotencyHash(hash, path);
  }

  public static hasIdempotencyEnabled(context: TScripts): boolean {
    if (process.env.BSM_DISABLE_IDEMPOTENCY === "true") return false;
    if (!Object.hasOwn(context, "$idempotency")) return false;
    if (!Object.hasOwn(context, "$idempotencyEnabled")) return true;
    return Boolean(context["$idempotencyEnabled"]);
  }
}
