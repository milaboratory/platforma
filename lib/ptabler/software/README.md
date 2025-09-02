# Ptabler Software

A Polars-based data processing library for table operations.

## Local Development Setup

### Prerequisites

1. **Install pyenv** (Python version manager):
   ```bash
   # macOS (using Homebrew)
   brew install pyenv
   
   # Follow pyenv installation guide for your OS:
   # https://github.com/pyenv/pyenv#installation
   ```

2. **Configure pyenv** in your shell profile:
   ```bash
   # Add to ~/.zshrc, ~/.bashrc, or ~/.bash_profile
   export PYENV_ROOT="$HOME/.pyenv"
   command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"
   eval "$(pyenv init -)"
   ```

### Running Tests Locally

1. **Initialize Python environment**:
   ```bash
   pnpm run init-python
   ```
   This will:
   - Set the local Python version to 3.12.6
   - Create a virtual environment with the correct Python version
   - Install all required dependencies

2. **Run tests**:
   ```bash
   pnpm t
   ```

### Updating Python Version

When updating the Python version, make sure to update both:

1. **Block software configuration** in `package.json`:
   ```json
   "environment": "@platforma-open/milaboratories.runenv-python-3:3.12.6"
   ```

2. **Local Python version** in `.python-version` file:
   ```
   3.12.6
   ```

After updating, recreate the virtual environment:
```bash
pnpm run init-python
```
