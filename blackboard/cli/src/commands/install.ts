/**
 * Install command - Display installation and update instructions for blackboard CLI.
 */

interface InstallOptions {
  quiet?: boolean;
}

/**
 * Display installation instructions for the blackboard CLI.
 */
export function installCommand(options: InstallOptions): void {
  if (options.quiet) {
    console.log("deno install -g --force --name blackboard --config deno.json --allow-read --allow-write --allow-env --allow-ffi --allow-net=github.com,objects.githubusercontent.com --allow-run=docker,git,claude,open,security mod.ts");
    return;
  }

  console.log(`
=== Blackboard CLI Installation ===

Prerequisites:
  Deno runtime (https://deno.land)

Install or Update:
  cd blackboard/cli
  deno task install

This runs:
  deno install -g --force --name blackboard \\
    --config deno.json \\
    --allow-read --allow-write --allow-env --allow-ffi \\
    --allow-net=github.com,objects.githubusercontent.com \\
    --allow-run=docker,git,claude,open,security \\
    mod.ts

After installation, the 'blackboard' command will be available globally.

Verify:
  blackboard --version
  blackboard --help
`);
}
