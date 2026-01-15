const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const packageJsonPath = path.resolve(__dirname, '../package.json');
const packageJson = require(packageJsonPath);

const currentVersion = packageJson.version;
console.log(`Current version: ${currentVersion}`);

// Regex to capture major.minor.patch and optional suffix
const versionRegex = /^(\d+)\.(\d+)\.(\d+)(-(.+))?$/;
const match = currentVersion.match(versionRegex);

if (!match) {
    console.error(`Invalid version format: ${currentVersion}`);
    process.exit(1);
}

const major = parseInt(match[1], 10);
const minor = parseInt(match[2], 10);
let patch = parseInt(match[3], 10);
const suffix = match[4] || ''; // Includes the leading '-' if present

// Increment patch
patch += 1;

const newVersion = `${major}.${minor}.${patch}${suffix}`;
console.log(`Next version: ${newVersion}`);

try {
    // Use npm version to update package.json and look-a-likes
    execSync(`npm version ${newVersion} --no-git-tag-version`, { stdio: 'inherit' });
    console.log('Version updated successfully.');
} catch (error) {
    console.error('Failed to update version:', error);
    process.exit(1);
}
