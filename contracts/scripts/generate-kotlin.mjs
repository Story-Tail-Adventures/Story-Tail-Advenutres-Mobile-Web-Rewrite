// openapi.yaml → contracts/kotlin/com/storytail/contracts/Types.kt
//
// WHY THIS EXISTS RATHER THAN openapi-generator-cli.
//
// contracts/README.md deferred Kotlin codegen for a good reason: openapi-generator-cli
// pulls a ~25 MB JAR and needs a Java toolchain on every CI runner. That objection still
// stands — so this does not use it. It emits Kotlin SOURCE LITERALS from the parsed spec,
// exactly the way web/scripts/export-public-content.mts emits GeneratedPublicContent.kt:
// reviewable in a diff, checked by the Kotlin compiler rather than at runtime, and with no
// serialization-codegen runtime or new heavy dependency.
//
// The scope is deliberately narrow. It generates request/response DATA CLASSES and the
// enums they reference, and nothing else — no HTTP client, no operation wrappers. The
// mobile side already has a repository layer with its own error handling
// (api/AuthRepository.kt); what it lacked was type-safe payloads that cannot drift from the
// contract, and that is all this closes.
//
// Run: npm run generate:kotlin -w contracts   (or `generate`, which runs both sides)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = resolve(HERE, '../openapi.yaml');
const OUT = resolve(HERE, '../kotlin/com/storytail/contracts/Types.kt');
const PACKAGE = 'com.storytail.contracts';

const spec = yaml.load(readFileSync(SPEC, 'utf8'));
const schemas = spec.components?.schemas ?? {};

/** Kotlin reserved words that would not survive being used as a property name bare. */
const RESERVED = new Set([
  'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun', 'if', 'in',
  'interface', 'is', 'null', 'object', 'package', 'return', 'super', 'this', 'throw',
  'true', 'try', 'typealias', 'typeof', 'val', 'var', 'when', 'while',
]);

const refName = (ref) => ref.replace('#/components/schemas/', '');

/** SCREAMING_SNAKE for an enum constant, from a wire value like "insurance_cert". */
const constName = (v) => v.replace(/[^A-Za-z0-9]+/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

/**
 * Flatten OpenAPI 3.1's nullable forms into `{schema, nullable}`.
 *
 * 3.1 dropped `nullable: true` in favour of a type UNION, so a nullable string is
 * `type: [string, "null"]` and a nullable enum carries a literal `null` among its values.
 * Both broke this generator when the onboarding schemas were backfilled: the union fell
 * through to `JsonElement`, silently erasing the type, and `constName(null)` threw outright.
 *
 * Nullability belongs on the Kotlin TYPE, not in the enum's members — a Kotlin enum with a
 * NULL constant would let `NULL` be assigned where the wire format means absent.
 */
function denull(schema) {
  let nullable = false;
  let out = schema;

  if (Array.isArray(out.type)) {
    const kinds = out.type.filter((t) => t !== 'null' && t !== null);
    nullable = kinds.length !== out.type.length;
    // A union of two real types has no single Kotlin equivalent, so it stays JsonElement —
    // but that is now a decision rather than an accident, and there are none in the spec.
    out = { ...out, type: kinds.length === 1 ? kinds[0] : undefined };
  }

  if (Array.isArray(out.enum) && out.enum.some((v) => v === null)) {
    nullable = true;
    out = { ...out, enum: out.enum.filter((v) => v !== null) };
  }

  return { schema: out, nullable };
}

/** True for a schema that should become a Kotlin data class. */
function isObjectSchema(schema) {
  const { schema: s } = denull(schema);
  return s.type === 'object' && !!s.properties;
}

/** The Kotlin type for a property schema, plus any nested enum it needs declared. */
function kotlinType(name, propName, rawSchema, enums) {
  const { schema } = denull(rawSchema);
  if (schema.$ref) return refName(schema.$ref);

  if (schema.enum) {
    // An inline enum becomes a real Kotlin enum class, named for where it appeared, so an
    // invalid value is a compile error rather than a string typo.
    const enumName = `${name}${propName[0].toUpperCase()}${propName.slice(1)}`;
    enums.set(enumName, schema.enum);
    return enumName;
  }

  switch (schema.type) {
    case 'string':
      // Money and byte counts travel as digit-strings on purpose (CLAUDE.md rule 5 — a
      // JSON number above 2^53 loses precision silently), so they stay String here too.
      // Parsing them into Long is the repository's job, where the failure has somewhere
      // to go.
      return 'String';
    case 'integer':
      return schema.format === 'int64' ? 'Long' : 'Int';
    case 'number':
      return 'Double';
    case 'boolean':
      return 'Boolean';
    case 'array': {
      const inner = kotlinType(name, propName, schema.items ?? { type: 'string' }, enums);
      return `List<${inner}>`;
    }
    case 'object':
    default:
      return 'JsonElement';
  }
}

const lines = [];
const w = (s = '') => lines.push(s);

w('// GENERATED FILE — DO NOT EDIT.');
w('//');
w('// Source: contracts/openapi.yaml');
w('// Regenerate: npm run generate -w contracts');
w('//');
w('// Hand-editing this file is the one thing that breaks the contract, because the CI job');
w('// "Contracts codegen is current" regenerates it and diffs — an edit here shows up as a');
w('// failing build on somebody else\'s PR. Change openapi.yaml instead.');
w('');
w(`package ${PACKAGE}`);
w('');
w('import kotlinx.serialization.SerialName');
w('import kotlinx.serialization.Serializable');
w('import kotlinx.serialization.json.JsonElement');
w('');

const enums = new Map();
const bodies = [];

for (const [name, schema] of Object.entries(schemas)) {
  if (!isObjectSchema(schema)) continue;

  const required = new Set(schema.required ?? []);
  const props = [];

  for (const [propName, propSchema] of Object.entries(denull(schema).schema.properties)) {
    const type = kotlinType(name, propName, propSchema, enums);
    // Optional when the spec does not require it, OR when its own type admits null. The
    // onboarding requests rely on the second: absent means "leave it alone" and explicit
    // null means "clear it", so none of them carries a `required` list at all.
    const optional = !required.has(propName) || denull(propSchema).nullable;
    const kotlinName = RESERVED.has(propName) ? `\`${propName}\`` : propName;

    const doc = propSchema.description
      ? propSchema.description.trim().split('\n').map((l) => `    // ${l.trim()}`).join('\n')
      : null;

    props.push({ propName, kotlinName, type, optional, doc });
  }

  const body = [];
  if (schema.description) {
    for (const l of schema.description.trim().split('\n')) body.push(`/** ${l.trim()} */`);
  }
  body.push('@Serializable');
  body.push(`data class ${name}(`);
  for (const p of props) {
    if (p.doc) body.push(p.doc);
    // Every property carries an explicit @SerialName so a Kotlin rename can never silently
    // change the wire format.
    body.push(`    @SerialName("${p.propName}")`);
    body.push(`    val ${p.kotlinName}: ${p.type}${p.optional ? '? = null' : ''},`);
  }
  body.push(')');
  bodies.push(body.join('\n'));
}

// Enums first: a data class referencing one has to come after it for readability, though
// Kotlin itself does not care about declaration order.
for (const [enumName, values] of enums) {
  const body = [];
  body.push('@Serializable');
  body.push(`enum class ${enumName} {`);
  for (const v of values) {
    body.push(`    @SerialName("${v}")`);
    body.push(`    ${constName(v)},`);
  }
  body.push('}');
  bodies.unshift(body.join('\n'));
}

w(bodies.join('\n\n'));
w('');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join('\n'), 'utf8');

const dataClasses = bodies.length - enums.size;
console.log(`Types.kt — ${dataClasses} data classes, ${enums.size} enums`);
