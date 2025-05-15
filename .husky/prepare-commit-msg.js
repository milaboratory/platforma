#!/usr/bin/env node

const fs = require('fs');
const { execSync } = require('child_process');

// Get the commit message file path and commit source from arguments
const commitMsgFile = process.argv[2];
const commitSource = process.argv[3];

// Get the current branch name
let branchName;
try {
  branchName = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
} catch (error) {
  // console.error('Error getting branch name:', error);
  process.exit(0); // Exit if git command fails, similar to original script
}

// Extract issue number from the branch name (e.g., ABC-123)
const issueNumberMatch = branchName.match(/^([A-Z]+-[0-9]+)/);
const issueNumber = issueNumberMatch ? issueNumberMatch[0] : null;

if (!issueNumber) {
  process.exit(0);
}

// Only modify the commit message if it's a direct commit (not a merge, squash, etc.)
// and an issue number was found.
if (commitMsgFile && !commitSource && issueNumber) {
  try {
    let commitMsg = fs.readFileSync(commitMsgFile, { encoding: 'utf8' });

    // Prepend the issue number to the commit message if not already present
    const issuePrefix = `${issueNumber}: `;
    if (!commitMsg.startsWith(issuePrefix)) {
      commitMsg = `${issuePrefix}${commitMsg}`;
      fs.writeFileSync(commitMsgFile, commitMsg, { encoding: 'utf8' });
    }
  } catch (error) {
    // console.error('Error processing commit message:', error);
    process.exit(1); // Exit with error if file operations fail
  }
}
