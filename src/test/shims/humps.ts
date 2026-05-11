// ESM shim for humps (CJS UMD package). Jest maps `humps` here (via
// moduleNameMapper) so `import { camelizeKeys } from "humps"` resolves to
// real ESM named exports. The ESM ⇄ CJS interop in jest can't reliably
// extract named exports from humps (which uses `module.exports = humps`),
// so we import the default and re-export each function explicitly.
//
// We use a deeper specifier (`humps/humps.js`) and `* as humps` so jest's
// loader treats it as a star namespace import, exposing the CJS module's
// shape in a way that survives the round-trip.
import * as humps from "humps/humps.js";

interface HumpsModule {
  camelize: (str: string) => string;
  decamelize: (str: string) => string;
  pascalize: (str: string) => string;
  depascalize: (str: string) => string;
  camelizeKeys: (obj: unknown, options?: unknown) => unknown;
  decamelizeKeys: (obj: unknown, options?: unknown) => unknown;
  pascalizeKeys: (obj: unknown, options?: unknown) => unknown;
  depascalizeKeys: (obj: unknown, options?: unknown) => unknown;
}

// Under jest's ESM-CJS bridge the default export holds the original
// `module.exports` object; outside jest the named keys may sit on the
// namespace itself. Try both so the same shim works in either world.
const ns = humps as unknown as Partial<HumpsModule> & { default?: HumpsModule };
const m = (ns.camelizeKeys ? ns : ns.default) as HumpsModule;

export const camelize = m.camelize;
export const decamelize = m.decamelize;
export const pascalize = m.pascalize;
export const depascalize = m.depascalize;
export const camelizeKeys = m.camelizeKeys;
export const decamelizeKeys = m.decamelizeKeys;
export const pascalizeKeys = m.pascalizeKeys;
export const depascalizeKeys = m.depascalizeKeys;
export default m;
