const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

async function createPackage() {
  try {
    // Get package name
    const packageName = await question(
      "Enter the package name (without @thlee/ prefix): "
    );
    const fullPackageName = `@thlee/${packageName}-mcp`;
    const packageDir = path.join("packages", packageName);

    // Create package directory
    if (fs.existsSync(packageDir)) {
      console.error(`Package ${packageName} already exists!`);
      process.exit(1);
    }

    // Copy template
    console.log("Copying template...");
    execSync(`cp -r template ${packageDir}`);

    // Update package.json
    const packageJsonPath = path.join(packageDir, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    packageJson.name = fullPackageName;
    packageJson.description = `${packageName} MCP Server`;
    packageJson.bin = {
      [`mcp-server-${packageName}`]: "dist/index.js",
    };
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Update source files
    const indexTsPath = path.join(packageDir, "index.ts");
    let indexTs = fs.readFileSync(indexTsPath, "utf8");
    indexTs = indexTs.replace(
      /TemplateMCPServer/g,
      `${packageName.charAt(0).toUpperCase() + packageName.slice(1)}MCPServer`
    );
    fs.writeFileSync(indexTsPath, indexTs);

    // Update Dockerfile
    const dockerfilePath = path.join(packageDir, "Dockerfile");
    let dockerfile = fs.readFileSync(dockerfilePath, "utf8");
    dockerfile = dockerfile.replace(
      /packages\/template/g,
      `packages/${packageName}`
    );
    fs.writeFileSync(dockerfilePath, dockerfile);

    // Update README.md
    const readmePath = path.join(packageDir, "README.md");
    let readme = fs.readFileSync(readmePath, "utf8");
    readme = readme.replace(
      /Template/g,
      packageName.charAt(0).toUpperCase() + packageName.slice(1)
    );
    fs.writeFileSync(readmePath, readme);

    console.log(`\nPackage ${fullPackageName} created successfully!`);
    console.log("\nNext steps:");
    console.log(`1. cd ${packageDir}`);
    console.log("2. npm install");
    console.log("3. Start implementing your MCP server");
  } catch (error) {
    console.error("Error creating package:", error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

createPackage();
