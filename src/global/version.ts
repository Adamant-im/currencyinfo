import fs from 'fs';
import path from 'path';

/**
 * Reads and exports the current service version from package.json.
 * Uses a safe fallback if package.json cannot be read directly.
 */
let cachedVersion = 'unknown';

try {
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = fs.readFileSync(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(packageJson);
    if (pkg.version) {
      cachedVersion = pkg.version;
    }
  }
} catch {
  // Fallback to unknown version if package.json cannot be read
}

export const version: string = cachedVersion;
