#!/bin/bash
# Save all BR footwork icons and Cathedral command icons to vault
BR=~/cathedral-vault/09_Artifacts/icons/basic-reflex/svg
CAT=~/cathedral-vault/09_Artifacts/icons/cathedral/svg

# ── BR FOOTWORK ICONS ──────────────────────────────────────

cat > $BR/half-step-forward.svg << 'EOF'
<svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="8" y="8" width="72" height="72" rx="2" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<line x1="44" y1="8" x2="44" y2="80" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>
<line x1="8" y1="44" x2="80" y2="44" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<rect x="8" y="8" width="36" height="36" rx="2" fill="currentColor" opacity="0.05"/>
<g transform="translate(36,28) rotate(-30)" opacity="0.15"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(36,14) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor"/><circle cx="8" cy="0" r="1" fill="white" opacity="0.6"/></g>
<g transform="translate(52,56) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor" opacity="0.55"/></g>
<path d="M44 26 L44 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M41 20 L44 17 L47 20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $BR/half-step-back.svg << 'EOF'
<svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="8" y="8" width="72" height="72" rx="2" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<line x1="44" y1="8" x2="44" y2="80" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>
<line x1="8" y1="44" x2="80" y2="44" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<rect x="44" y="44" width="36" height="36" rx="2" fill="currentColor" opacity="0.05"/>
<g transform="translate(36,28) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor"/><circle cx="8" cy="0" r="1" fill="white" opacity="0.6"/></g>
<g transform="translate(52,56) rotate(-30)" opacity="0.15"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(52,70) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor" opacity="0.55"/></g>
<path d="M44 58 L44 68" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M41 66 L44 69 L47 66" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $BR/half-step-left.svg << 'EOF'
<svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="8" y="8" width="72" height="72" rx="2" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<line x1="44" y1="8" x2="44" y2="80" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>
<line x1="8" y1="44" x2="80" y2="44" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<rect x="8" y="8" width="36" height="36" rx="2" fill="currentColor" opacity="0.05"/>
<g transform="translate(36,28) rotate(-30)" opacity="0.15"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(22,28) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor"/></g>
<g transform="translate(52,56) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor" opacity="0.55"/></g>
<path d="M34 28 L24 28" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M26 25 L23 28 L26 31" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $BR/half-step-right.svg << 'EOF'
<svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="8" y="8" width="72" height="72" rx="2" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<line x1="44" y1="8" x2="44" y2="80" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>
<line x1="8" y1="44" x2="80" y2="44" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<rect x="44" y="44" width="36" height="36" rx="2" fill="currentColor" opacity="0.05"/>
<g transform="translate(36,28) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor"/></g>
<g transform="translate(52,56) rotate(-30)" opacity="0.15"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(66,56) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor" opacity="0.55"/></g>
<path d="M54 56 L64 56" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M62 53 L65 56 L62 59" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $BR/full-step-forward.svg << 'EOF'
<svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="8" y="8" width="72" height="72" rx="2" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<line x1="44" y1="8" x2="44" y2="80" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>
<line x1="8" y1="44" x2="80" y2="44" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<g transform="translate(36,36) rotate(-30)" opacity="0.15"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(52,60) rotate(-30)" opacity="0.15"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(36,20) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor"/></g>
<g transform="translate(52,44) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor" opacity="0.55"/></g>
<path d="M36 34 L36 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M33 24 L36 21 L39 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M52 58 L52 46" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M49 48 L52 45 L55 48" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $BR/full-step-back.svg << 'EOF'
<svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="8" y="8" width="72" height="72" rx="2" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<line x1="44" y1="8" x2="44" y2="80" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>
<line x1="8" y1="44" x2="80" y2="44" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<g transform="translate(36,28) rotate(-30)" opacity="0.15"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(52,52) rotate(-30)" opacity="0.15"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(36,44) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor"/></g>
<g transform="translate(52,68) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor" opacity="0.55"/></g>
<path d="M36 30 L36 42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M33 40 L36 43 L39 40" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M52 54 L52 66" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M49 64 L52 67 L55 64" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $BR/full-step-left.svg << 'EOF'
<svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="8" y="8" width="72" height="72" rx="2" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<line x1="44" y1="8" x2="44" y2="80" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>
<line x1="8" y1="44" x2="80" y2="44" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<g transform="translate(36,28) rotate(-30)" opacity="0.15"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(52,52) rotate(-30)" opacity="0.15"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(20,28) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor"/></g>
<g transform="translate(36,52) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor" opacity="0.55"/></g>
<path d="M34 28 L22 28" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M24 25 L21 28 L24 31" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M50 52 L38 52" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M40 49 L37 52 L40 55" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $BR/full-step-right.svg << 'EOF'
<svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="8" y="8" width="72" height="72" rx="2" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<line x1="44" y1="8" x2="44" y2="80" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>
<line x1="8" y1="44" x2="80" y2="44" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<g transform="translate(36,28) rotate(-30)" opacity="0.15"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(52,52) rotate(-30)" opacity="0.15"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(52,28) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor"/></g>
<g transform="translate(68,52) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor" opacity="0.55"/></g>
<path d="M38 28 L50 28" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M48 25 L51 28 L48 31" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M54 52 L66 52" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M64 49 L67 52 L64 55" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $BR/pivot-clockwise.svg << 'EOF'
<svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="8" y="8" width="72" height="72" rx="2" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<line x1="44" y1="8" x2="44" y2="80" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>
<line x1="8" y1="44" x2="80" y2="44" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<g transform="translate(36,28) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor"/></g>
<circle cx="44" cy="28" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
<path d="M52,56 A24,24 0 0,1 66,32" stroke="currentColor" stroke-width="1.5" fill="none" stroke-dasharray="3 2" opacity="0.5"/>
<g transform="translate(52,56) rotate(-30)" opacity="0.2"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(66,32) rotate(50)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor" opacity="0.55"/></g>
<path d="M62 28 L66 32 L62 35" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $BR/pivot-anticlockwise.svg << 'EOF'
<svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="8" y="8" width="72" height="72" rx="2" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<line x1="44" y1="8" x2="44" y2="80" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>
<line x1="8" y1="44" x2="80" y2="44" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<g transform="translate(36,28) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor"/></g>
<circle cx="44" cy="28" r="3" stroke="currentColor" stroke-width="1.5" fill="none"/>
<path d="M52,56 A24,24 0 0,0 22,38" stroke="currentColor" stroke-width="1.5" fill="none" stroke-dasharray="3 2" opacity="0.5"/>
<g transform="translate(52,56) rotate(-30)" opacity="0.2"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(22,38) rotate(-80)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor" opacity="0.55"/></g>
<path d="M26 34 L22 38 L26 40" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $BR/pendulum-step.svg << 'EOF'
<svg width="88" height="88" viewBox="0 0 88 88" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="8" y="8" width="72" height="72" rx="2" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<line x1="44" y1="8" x2="44" y2="80" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>
<line x1="8" y1="44" x2="80" y2="44" stroke="currentColor" stroke-width="0.5" opacity="0.12"/>
<g transform="translate(36,14) rotate(-30)" opacity="0.15"><rect x="-8" y="-3.5" width="16" height="7" rx="2" stroke="currentColor" stroke-width="1" fill="none"/></g>
<g transform="translate(36,30) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor"/></g>
<g transform="translate(52,54) rotate(-30)"><rect x="-8" y="-3.5" width="16" height="7" rx="2" fill="currentColor" opacity="0.55"/></g>
<path d="M44 22 L44 28" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M41 26 L44 29 L47 26" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M44 34 L44 42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2 2" opacity="0.45"/>
<path d="M41 40 L44 43 L47 40" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>
</svg>
EOF

echo "All BR footwork icons filed (11 files)"
ls -la $BR/
