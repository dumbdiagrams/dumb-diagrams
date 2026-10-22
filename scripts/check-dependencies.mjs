import { builtinModules } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { importBoundaryError } from "./lib/import-boundaries.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);
const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

const scopes = [
  {
    root,
    manifestPath: join(root, "package.json"),
    files: [
      ...sourceFiles(join(root, "scripts")),
      ...sourceFiles(join(root, "e2e")),
      ...readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile() && sourceExtensions.has(extname(entry.name)))
        .map((entry) => join(root, entry.name)),
    ],
  },
  ...readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const packageRoot = join(root, "packages", entry.name);
      return {
        root: packageRoot,
        manifestPath: join(packageRoot, "package.json"),
        files: sourceFiles(packageRoot),
      };
    }),
];

const errors = [];
for (const scope of scopes) {
  const manifest = JSON.parse(readFileSync(scope.manifestPath, "utf8"));
  const productionDependencies = new Set([
    manifest.name,
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  const declared = new Set([...productionDependencies, ...Object.keys(manifest.devDependencies ?? {})]);

  for (const file of scope.files) {
    for (const specifier of importsIn(file)) {
      const boundaryError = importBoundaryError(root, file, specifier);
      if (boundaryError) errors.push(`${relative(root, file)}: ${boundaryError}`);
      const packageName = externalPackageName(specifier);
      if (packageName && !declared.has(packageName)) {
        errors.push(
          `${relative(root, file)} imports ${packageName}, but ${relative(root, scope.manifestPath)} does not declare it`,
        );
      } else if (
        packageName &&
        isProductionPackageSource(scope.root, file) &&
        !productionDependencies.has(packageName) &&
        !isBundledWorkspaceImport(manifest, packageName)
      ) {
        errors.push(
          `${relative(root, file)} imports ${packageName} in production source, but ${relative(root, scope.manifestPath)} declares it only for development`,
        );
      }
    }
  }
}

function isBundledWorkspaceImport(manifest, packageName) {
  const declaration = manifest.devDependencies?.[packageName];
  return (
    typeof manifest.scripts?.["prepare:standalone"] === "string" &&
    typeof declaration === "string" &&
    declaration.startsWith("workspace:")
  );
}

function isProductionPackageSource(packageRoot, file) {
  if (packageRoot === root) return false;
  const sourceRoot = join(packageRoot, "src");
  const relativeSource = relative(sourceRoot, file);
  return !relativeSource.startsWith("..") && !relativeSource.includes(".test.") && !relativeSource.includes(".spec.");
}

if (errors.length > 0) {
  console.error(
    errors
      .sort()
      .map((error) => `- ${error}`)
      .join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log("Dependency declarations and workspace import boundaries pass");
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (["dist", "node_modules", "public"].includes(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

function importsIn(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = new Set();

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      imports.add(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      imports.add(node.arguments[0].text);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      imports.add(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return imports;
}

function externalPackageName(specifier) {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("#") ||
    specifier.includes(":") ||
    builtins.has(specifier)
  ) {
    return undefined;
  }
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}
