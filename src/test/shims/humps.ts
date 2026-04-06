// ESM shim for humps (CJS package) — used by Jest ESM test environment
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const humps = require("humps");

export const camelizeKeys = humps.camelizeKeys as (obj: unknown) => unknown;
export const decamelizeKeys = humps.decamelizeKeys as (obj: unknown, options?: unknown) => unknown;
export const camelize = humps.camelize as (str: string) => string;
export const decamelize = humps.decamelize as (str: string) => string;
export const pascalize = humps.pascalize as (str: string) => string;
export const depascalize = humps.depascalize as (str: string) => string;
