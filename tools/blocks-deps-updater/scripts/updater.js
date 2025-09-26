#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.length !== 0) {
  console.error(`Usage: ${process.argv[1]}`);
  process.exit(1);
}

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import YAML from 'yaml';

const workspacePath = path.resolve(process.cwd(), 'pnpm-workspace.yaml');

// Function to get the latest version of a package from npm registry
async function getLatestVersion(packageName) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://registry.npmjs.org/${packageName}`, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const packageInfo = JSON.parse(data);
          if (packageInfo['dist-tags'] && packageInfo['dist-tags'].latest) {
            resolve(packageInfo['dist-tags'].latest);
          } else {
            reject(new Error(`Could not find latest version for ${packageName}`));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.end();
  });
}

async function updatePackages() {
  try {
    // Read the workspace file as string
    const content = fs.readFileSync(workspacePath, 'utf8');
    
    // Parse it with yaml to get the structure, but we'll only use this to find packages
    const workspaceConfig = YAML.parse(content);
    
    if (!workspaceConfig.catalog) {
      console.error('No catalog section found in pnpm-workspace.yaml');
      return;
    }
    
    const catalog = workspaceConfig.catalog;
    const sdkPackages = Object.keys(catalog).filter(pkg => pkg.startsWith('@platforma-sdk/') || pkg.startsWith('@milaboratories/'));
    
    console.log('Checking for updates to @platforma-sdk packages...');
    
    // Store the original content and modify it only where needed
    let updatedContent = content;
    let hasUpdates = false;
    
    for (const packageName of sdkPackages) {
      console.log(`Checking ${packageName}...`);
      const currentVersion = catalog[packageName];
      // Remove leading ^ or ~ to compare versions
      const cleanCurrentVersion = currentVersion.replace(/^[\^~]/, '');
      
      try {
        let latestVersion = await getLatestVersion(packageName);
        
        if (!latestVersion) {
          console.log(`  Could not determine latest version for ${packageName}, skipping.`);
          continue;
        }
        
        const versionPrefix = currentVersion.startsWith('^') ? '^' : 
                             currentVersion.startsWith('~') ? '~' : '';
        
        if (cleanCurrentVersion !== latestVersion) {
          const newVersion = `${versionPrefix}${latestVersion}`;
          console.log(`  Updating ${packageName} from ${currentVersion} to ${newVersion}`);
          
          // Find the exact line containing this package
          const lines = updatedContent.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Check if this line contains our package
            if (line.includes(packageName) && line.includes(currentVersion)) {
              // Replace just the version part while keeping everything else the same
              lines[i] = line.replace(currentVersion, newVersion);
              hasUpdates = true;
              break;
            }
          }
          
          // Rejoin the lines
          updatedContent = lines.join('\n');
        } else {
          console.log(`  ${packageName} is already at the latest version (${currentVersion})`);
        }
      } catch (error) {
        console.error(`  Error checking ${packageName}: ${error.message}`);
      }
    }
    
    if (hasUpdates) {
      fs.writeFileSync(workspacePath, updatedContent, 'utf8');
      console.log('Updated pnpm-workspace.yaml with latest @platforma-sdk versions.');
    } else {
      console.log('All @platforma-sdk packages are already at their latest versions.');
    }
    
  } catch (error) {
    console.error('Error updating packages:', error);
  }
}

updatePackages();
