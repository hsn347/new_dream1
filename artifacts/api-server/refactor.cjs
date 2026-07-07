const { Project } = require("ts-morph");

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
});
project.addSourceFilesAtPaths("src/**/*.ts");

const agentFile = project.getSourceFileOrThrow("src/lib/agent.ts");
const brainFile = project.createSourceFile("src/lib/agentBrain.ts", "", { overwrite: true });

console.log("Copying imports...");
const imports = agentFile.getImportDeclarations();
imports.forEach(i => {
  brainFile.addImportDeclaration(i.getStructure());
});

console.log("Exporting top-level declarations in agent.ts...");
agentFile.getFunctions().forEach(f => {
  if (f.getName() && f.getName() !== "processTextFlow" && f.getName() !== "processEvolutionPayload" && !f.isExported()) {
    f.setIsExported(true);
  }
});

agentFile.getVariableStatements().forEach(v => {
  if (!v.isExported()) {
    v.setIsExported(true);
  }
});

console.log("Moving target functions...");
const textFlow = agentFile.getFunctionOrThrow("processTextFlow");
const evoPayload = agentFile.getFunctionOrThrow("processEvolutionPayload");

const textFlowText = textFlow.getText();
const evoPayloadText = evoPayload.getText();

textFlow.remove();
evoPayload.remove();

brainFile.addStatements([textFlowText, evoPayloadText]);
brainFile.getFunctionOrThrow("processTextFlow").setIsExported(true);
brainFile.getFunctionOrThrow("processEvolutionPayload").setIsExported(true);

console.log("Wiring imports from agent.ts to agentBrain.ts...");
const exportedNames = [];
for (const [name, decls] of agentFile.getExportedDeclarations()) {
  // Avoid re-importing things that might clash or aren't needed, but it's safe to just import all.
  exportedNames.push(name);
}

// Remove names that are already imported from external modules in brainFile to avoid duplicates
const existingImports = new Set();
brainFile.getImportDeclarations().forEach(id => {
  id.getNamedImports().forEach(ni => existingImports.add(ni.getName()));
  if (id.getDefaultImport()) existingImports.add(id.getDefaultImport().getText());
});

const filteredExports = exportedNames.filter(n => !existingImports.has(n));

brainFile.addImportDeclaration({
  namedImports: filteredExports,
  moduleSpecifier: "./agent.js"
});

console.log("Re-exporting from agent.ts...");
agentFile.addExportDeclaration({
  namedExports: ["processTextFlow", "processEvolutionPayload"],
  moduleSpecifier: "./agentBrain.js"
});

project.saveSync();
console.log("Refactoring complete.");
