import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read CHANGELOG.md
const changelogPath = path.join(__dirname, 'CHANGELOG.md');
const changelogContent = fs.readFileSync(changelogPath, 'utf-8');

// Parse CHANGELOG to extract versions
function parseChangelog(content) {
    const versions = [];
    const versionRegex = /## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})/g;
    const lines = content.split('\n');

    let currentVersion = null;
    let currentChanges = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const versionMatch = line.match(/## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})/);

        if (versionMatch) {
            // Save previous version if exists
            if (currentVersion) {
                versions.push({
                    version: currentVersion.version,
                    date: currentVersion.date,
                    changes: currentChanges.filter(c => c.trim())
                });
            }

            // Start new version
            currentVersion = {
                version: versionMatch[1],
                date: versionMatch[2]
            };
            currentChanges = [];
        } else if (currentVersion && line.startsWith('- ')) {
            // Extract change item (remove leading "- " and markdown bold markers)
            const change = line.substring(2).replace(/\*\*/g, '');
            currentChanges.push(change);
        }
    }

    // Add last version
    if (currentVersion) {
        versions.push({
            version: currentVersion.version,
            date: currentVersion.date,
            changes: currentChanges.filter(c => c.trim())
        });
    }

    return versions.slice(0, 4); // Only return last 4 versions
}

const versions = parseChangelog(changelogContent);

// Generate the changelog data file
const outputPath = path.join(__dirname, 'src', 'changelog-data.js');
const output = `// Auto-generated from CHANGELOG.md - Do not edit manually
export const changelogVersions = ${JSON.stringify(versions, null, 2)};
`;

fs.writeFileSync(outputPath, output);
console.log('✅ Generated changelog-data.js from CHANGELOG.md');
console.log(`   Found ${versions.length} versions`);
