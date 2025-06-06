import { createHash } from "node:crypto";
import { ConfigLoader } from "./ConfigLoader";
import fs from "fs";
import path from "path";
import { TScripts } from "./types";
import { Options } from "./Executor";
import { Logger } from "./Logger";

type IdempotencyType = "file" | "dir" | "env" | "static";
type IdempotencyKey = `${IdempotencyType}:${string}`;

export type IdempotencyConfig =
  // Key is just for labeling purposes
  | Record<string, IdempotencyKey | IdempotencyKey[]>
  | IdempotencyKey[]
  | IdempotencyKey;

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
          .join(file.path ?? dir, file.name)
          .replace(/\\/g, "/");
        /* eslint-enable */
        hash.update(fullPath);
        if (file.isFile()) this.updateHashForFile(hash, fullPath);
      });
    } catch {
      // Directory does not exist
    }
  }

  public static calculateIdempotencyHash(
    config: IdempotencyConfig,
    options?: Options,
  ): string {
    const keys: IdempotencyKey[] = [];

    if (Array.isArray(config)) {
      keys.push(...config);
    } else if (typeof config === "string") {
      keys.push(config);
    } else {
      for (const key of Object.values(config)) {
        if (Array.isArray(key)) {
          keys.push(...key);
        } else {
          keys.push(key);
        }
      }
    }

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
