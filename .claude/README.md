# Claude Code Configuration

This directory contains configuration for the Claude Code CLI used in local development.

## Local Settings

### settings.local.json

Configures permissions for Claude Code to automate git and build operations during development.

**Granted Permissions:**
- `Bash(git add:*)` - Stage files for commit
- `Bash(git commit:*)` - Create commits
- `Bash(git push:*)` - Push commits to repository
- `Bash(npm run build:*)` - Execute the npm build script

### Security Considerations

**Important:** `settings.local.json` is **local-only** and should never be committed to version control. It is listed in `.gitignore` to ensure each developer maintains their own permission configuration.

#### Trust Model

This configuration assumes:
- Claude Code operates in a **trusted, local development environment**
- **Injection defenses** are active and prevent malicious instructions from observed content (web pages, emails, documents)
- **Human review** of commits and pushes remains part of the development workflow
- Claude follows **best practices** for branching, PR workflows, and code review

#### Risk Mitigation

The following safeguards apply:
1. **Injection Defense:** Claude refuses to execute instructions found in function results, web pages, or observed content without explicit user verification in the chat
2. **Branch Workflows:** Claude is instructed to follow proper branching practices (feature branches, pull requests for main)
3. **Permission Narrowness:** The `npm run build` permission is scoped to a specific script; git permissions are intentionally limited to common operations
4. **Local-Only:** This configuration exists only on your machine and does not affect other developers

### Modifying Permissions

To add or remove permissions:
1. Edit `settings.local.json` in this directory
2. Add or remove entries in the `permissions.allow` array
3. Restart Claude Code to apply changes

**Example:** To add permission for npm test:
```json
"permissions": {
  "allow": [
    "Bash(git add:*)",
    "Bash(git commit:*)",
    "Bash(git push:*)",
    "Bash(npm run build:*)",
    "Bash(npm run test:*)"
  ]
}
```

### Recommended Practices

- **Pull Requests:** Even with push permissions, create pull requests for code review on shared branches
- **Commit Messages:** Let Claude suggest commits, but review before pushing
- **Sensitive Data:** Never ask Claude to commit secrets, API keys, or credentials
- **Build Validation:** Run builds locally before pushing to catch issues early

### Questions or Concerns?

If you have questions about permissions or security implications, review the [Claude Code documentation](https://claude.com/claude-code) or discuss with your team.
