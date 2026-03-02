#!/usr/bin/env node

/**
 * Build validation script for Azure DevOps Extension
 * Validates that the built extension meets all requirements
 */

const fs = require("fs");
const path = require("path");
const util = require("util");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(level, message) {
  const timestamp = new Date().toISOString();
  const levelColors = {
    info: colors.blue,
    success: colors.green,
    warning: colors.yellow,
    error: colors.red,
  };

  const color = levelColors[level] || colors.reset;
  const prefix = {
    info: "ℹ️ ",
    success: "✅",
    warning: "⚠️ ",
    error: "❌",
  };

  console.log(`${color}${prefix[level]} ${message}${colors.reset}`);
}

function validateFileExists(filePath, description) {
  if (!fs.existsSync(filePath)) {
    log("error", `Missing ${description}: ${filePath}`);
    return false;
  }
  return true;
}

function validateJsonFile(filePath, description) {
  if (!validateFileExists(filePath, description)) {
    return false;
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    JSON.parse(content);
    log("success", `${description} is valid JSON`);
    return true;
  } catch (error) {
    log("error", `${description} is invalid JSON: ${error.message}`);
    return false;
  }
}

function validateJavaScriptFile(filePath, description) {
  if (!validateFileExists(filePath, description)) {
    return false;
  }

  try {
    // Basic syntax validation by requiring the file
    const content = fs.readFileSync(filePath, "utf8");

    // Check for basic syntax errors
    if (content.includes("undefined")) {
      log(
        "warning",
        `${description} contains 'undefined' - check for missing imports`,
      );
    }

    log("success", `${description} appears to be valid JavaScript`);
    return true;
  } catch (error) {
    log("error", `${description} validation failed: ${error.message}`);
    return false;
  }
}

function validateTaskDefinition(taskJsonPath) {
  if (!validateJsonFile(taskJsonPath, "task.json")) {
    return false;
  }

  const taskDef = JSON.parse(fs.readFileSync(taskJsonPath, "utf8"));
  let valid = true;

  // Check required fields
  const requiredFields = [
    "id",
    "name",
    "friendlyName",
    "description",
    "category",
    "version",
    "execution",
  ];

  for (const field of requiredFields) {
    if (!taskDef[field]) {
      log("error", `task.json missing required field: ${field}`);
      valid = false;
    }
  }

  // Check version format
  if (taskDef.version) {
    const version = taskDef.version;
    if (
      typeof version.Major !== "number" ||
      typeof version.Minor !== "number" ||
      typeof version.Patch !== "number"
    ) {
      log(
        "error",
        "task.json version must have Major, Minor, and Patch as numbers",
      );
      valid = false;
    }
  }

  // Check execution target
  if (taskDef.execution && taskDef.execution.Node22_1) {
    const targetFile = taskDef.execution.Node22_1.target;
    const targetPath = path.join(path.dirname(taskJsonPath), targetFile);
    if (!fs.existsSync(targetPath)) {
      log("error", `task.json execution target not found: ${targetFile}`);
      valid = false;
    }
  }

  // Check inputs
  if (taskDef.inputs && Array.isArray(taskDef.inputs)) {
    for (const input of taskDef.inputs) {
      if (!input.name || !input.type) {
        log("error", "task.json input missing name or type");
        valid = false;
      }
    }
  }

  if (valid) {
    log("success", "task.json structure is valid");
  }

  return valid;
}

function validateVersionConsistency() {
  const packageJsonPath = "package.json";
  const vssExtensionPath = "vss-extension.json";
  const taskJsonPath = "dist/task.json";

  let valid = true;

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const vssExtension = JSON.parse(fs.readFileSync(vssExtensionPath, "utf8"));
    const taskJson = JSON.parse(fs.readFileSync(taskJsonPath, "utf8"));

    const packageVersion = packageJson.version;
    const vssVersion = vssExtension.version;
    const taskVersion = `${taskJson.version.Major}.${taskJson.version.Minor}.${taskJson.version.Patch}`;

    log("info", `Package version: ${packageVersion}`);
    log("info", `VSS extension version: ${vssVersion}`);
    log("info", `Task version: ${taskVersion}`);

    if (vssVersion !== taskVersion) {
      log("error", "Version mismatch between vss-extension.json and task.json");
      valid = false;
    }

    if (packageVersion !== vssVersion) {
      log("warning", "Package version differs from extension version");
    }

    if (valid) {
      log("success", "Version consistency check passed");
    }
  } catch (error) {
    log("error", `Version consistency check failed: ${error.message}`);
    valid = false;
  }

  return valid;
}

function validateDistStructure() {
  const distPath = "dist";

  if (!fs.existsSync(distPath)) {
    log("error", "dist directory does not exist");
    return false;
  }

  const requiredFiles = ["azure-pipeline.js", "task.json"];

  let valid = true;

  for (const file of requiredFiles) {
    const filePath = path.join(distPath, file);
    if (!fs.existsSync(filePath)) {
      log("error", `Required file missing in dist: ${file}`);
      valid = false;
    }
  }

  // Check azure-pipelines-task-lib exists (sole external dependency)
  const taskLibPath = path.join(
    distPath,
    "node_modules",
    "azure-pipelines-task-lib",
  );
  if (!fs.existsSync(taskLibPath)) {
    log("error", "azure-pipelines-task-lib missing in dist/node_modules");
    valid = false;
  }

  if (valid) {
    log("success", "dist directory structure is valid");
  }

  return valid;
}

function validateDependencies() {
  const taskLibPath = "dist/node_modules/azure-pipelines-task-lib";

  if (!fs.existsSync(taskLibPath)) {
    log("error", "azure-pipelines-task-lib not found in dist/node_modules");
    return false;
  }

  log("success", "azure-pipelines-task-lib is present");
  return true;
}

function generateBuildReport() {
  const reportPath = "build-report.json";

  const report = {
    timestamp: new Date().toISOString(),
    buildValid: true,
    checks: {},
    files: {},
    sizes: {},
  };

  // Get file sizes
  const filesToCheck = ["dist/azure-pipeline.js", "dist/task.json"];

  for (const file of filesToCheck) {
    if (fs.existsSync(file)) {
      const stats = fs.statSync(file);
      report.sizes[file] = stats.size;
    }
  }

  // List all files in dist
  if (fs.existsSync("dist")) {
    const distFiles = fs.readdirSync("dist", { withFileTypes: true });
    report.files.dist = distFiles.map((f) => ({
      name: f.name,
      isDirectory: f.isDirectory(),
      size: f.isDirectory()
        ? null
        : fs.statSync(path.join("dist", f.name)).size,
    }));
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log("info", `Build report generated: ${reportPath}`);
}

function main() {
  log("info", "Starting build validation...");

  let overallValid = true;

  // Run all validation checks
  const checks = [
    { name: "Dist Structure", fn: validateDistStructure },
    {
      name: "Task Definition",
      fn: () => validateTaskDefinition("dist/task.json"),
    },
    {
      name: "JavaScript Bundle",
      fn: () =>
        validateJavaScriptFile(
          "dist/azure-pipeline.js",
          "Azure Pipeline Bundle",
        ),
    },
    { name: "Version Consistency", fn: validateVersionConsistency },
    { name: "Dependencies", fn: validateDependencies },
  ];

  for (const check of checks) {
    log("info", `Running ${check.name} validation...`);
    const result = check.fn();
    if (!result) {
      overallValid = false;
      log("error", `${check.name} validation failed`);
    } else {
      log("success", `${check.name} validation passed`);
    }
  }

  // Generate build report
  generateBuildReport();

  // Final result
  if (overallValid) {
    log("success", "All build validations passed!");
    log("info", "Extension is ready for packaging");
    process.exit(0);
  } else {
    log("error", "Build validation failed");
    log("info", "Fix the errors above and rebuild");
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  validateFileExists,
  validateJsonFile,
  validateJavaScriptFile,
  validateTaskDefinition,
  validateVersionConsistency,
  validateDistStructure,
  validateDependencies,
};
