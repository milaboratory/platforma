# Ptabler Software

A Polars-based data processing library for table operations.

## Local Development Setup

### Prerequisites

1. **Install mise** (universal runtime manager):
   ```bash
   # macOS (using Homebrew)
   brew install mise
   
   # Follow mise installation guide for your OS:
   # https://mise.jdx.dev/getting-started.html
   ```

2. **Configure mise** in your shell profile:
   ```bash
   # Add to ~/.zshrc, ~/.bashrc, or ~/.bash_profile
   eval "$(mise activate zsh)"
   ```

### Running Tests Locally

1. **Initialize Python environment**:
   ```bash
   pnpm run init-python
   ```
   This will:
   - Use Python of the required version via mise
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

2. **Local Python version** in the `init-python:create-venv` script in `package.json`:
   ```json
   "init-python:create-venv": "mise exec python@3.12.6 -- python -m venv --clear .venv"
   ```

After updating, recreate the virtual environment:
```bash
pnpm run init-python
```
