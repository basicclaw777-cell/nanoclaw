#!/bin/bash
# ACE-Step 1.5 Music Studio — Install Script
# Run this once: bash ~/nanoclaw/music-studio/install.sh

set -e

echo "=== ACE-Step 1.5 Music Studio Setup ==="

# Use existing venv or create
if [ ! -d "$HOME/acestep-venv" ]; then
    echo "Creating venv..."
    python3 -m venv ~/acestep-venv
fi

source ~/acestep-venv/bin/activate
echo "Python: $(python3 --version)"

# Install dependencies
echo "Installing dependencies..."
pip install torch torchvision torchaudio --quiet
pip install diffusers==0.32.2 transformers safetensors --quiet
pip install datasets librosa soundfile pypinyin pytorch_lightning --quiet
pip install gradio loguru matplotlib click --quiet

# Clone and install ACE-Step
if [ ! -d "/tmp/ace-step-repo" ]; then
    echo "Cloning ACE-Step..."
    git clone https://github.com/ACE-Step/ACE-Step.git /tmp/ace-step-repo
fi

echo "Installing ACE-Step..."
cd /tmp/ace-step-repo && pip install -e . --quiet

echo ""
echo "=== Installation complete ==="
echo ""
echo "To launch the music studio:"
echo "  source ~/acestep-venv/bin/activate"
echo "  acestep --bf16 false --port 7865"
echo ""
echo "First run downloads ~10GB of models automatically."
echo "After that, open http://localhost:7865 for the Gradio UI"
echo "or http://localhost:8080/music-studio for the Cathedral studio."
