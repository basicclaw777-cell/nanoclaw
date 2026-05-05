#!/bin/bash
CAT=~/cathedral-vault/09_Artifacts/icons/cathedral/svg

cat > $CAT/status.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="4" y="6" width="28" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
<path d="M13 30h10M18 24v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M9 15l3-4 4 5 3-3 4 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $CAT/muse.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="18" cy="18" r="6" stroke="currentColor" stroke-width="1.5"/>
<path d="M18 4v4M18 28v4M4 18h4M28 18h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M8.5 8.5l2.8 2.8M24.7 24.7l2.8 2.8M8.5 27.5l2.8-2.8M24.7 11.3l2.8-2.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
EOF

cat > $CAT/vault-state.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<ellipse cx="18" cy="11" rx="11" ry="4" stroke="currentColor" stroke-width="1.5"/>
<path d="M7 11v7c0 2.2 4.9 4 11 4s11-1.8 11-4v-7" stroke="currentColor" stroke-width="1.5"/>
<path d="M7 18v7c0 2.2 4.9 4 11 4s11-1.8 11-4v-7" stroke="currentColor" stroke-width="1.5"/>
</svg>
EOF

cat > $CAT/brief.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="6" y="8" width="24" height="20" rx="2" stroke="currentColor" stroke-width="1.5"/>
<path d="M10 14h16M10 18h10M10 22h13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<circle cx="28" cy="10" r="4" fill="currentColor"/>
</svg>
EOF

cat > $CAT/gold.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M18 4L8 14h5v4l-5 4 10 10 10-10-5-4v-4h5L18 4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M13 18h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
EOF

cat > $CAT/proprioception.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="18" cy="13" r="5" stroke="currentColor" stroke-width="1.5"/>
<path d="M10 32c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M18 13v-4M14 10l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $CAT/sight.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M4 18c3-7 8-11 14-11s11 4 14 11c-3 7-8 11-14 11S7 25 4 18z" stroke="currentColor" stroke-width="1.5"/>
<circle cx="18" cy="18" r="4" stroke="currentColor" stroke-width="1.5"/>
<circle cx="18" cy="18" r="1.5" fill="currentColor"/>
</svg>
EOF

cat > $CAT/smell.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M18 28c0-4 4-6 4-10a4 4 0 00-8 0c0 4 4 6 4 10z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M12 12c-2-3 0-8 4-8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M24 12c2-3 0-8-4-8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M14 20h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
EOF

cat > $CAT/obliteratus.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="16" cy="16" r="9" stroke="currentColor" stroke-width="1.5"/>
<path d="M23 23l7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M12 16h8M16 12v8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
EOF

cat > $CAT/oracle.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M18 4l2.5 8h8.5l-7 5 2.5 8-7-5-7 5 2.5-8-7-5h8.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
</svg>
EOF

cat > $CAT/search.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="16" cy="16" r="9" stroke="currentColor" stroke-width="1.5"/>
<path d="M23 23l7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M11 16h10M16 11v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
EOF

cat > $CAT/harvest.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M18 4v20M11 17l7 7 7-7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M6 28h24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<rect x="9" y="28" width="18" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/>
</svg>
EOF

cat > $CAT/experiments.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M14 4v12l-6 14h16l-6-14V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M11 4h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<circle cx="16" cy="24" r="1.5" fill="currentColor"/>
<circle cx="20" cy="26" r="1.5" fill="currentColor"/>
</svg>
EOF

cat > $CAT/verify-doi.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M8 18l6 6 14-14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="18" cy="18" r="13" stroke="currentColor" stroke-width="1.5"/>
</svg>
EOF

cat > $CAT/trajectory.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M6 28l8-10 6 4 10-14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="6" cy="28" r="2" fill="currentColor"/>
<circle cx="14" cy="18" r="2" fill="currentColor"/>
<circle cx="20" cy="22" r="2" fill="currentColor"/>
<circle cx="30" cy="8" r="2" fill="currentColor"/>
</svg>
EOF

cat > $CAT/librarian.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="6" y="6" width="10" height="24" rx="1" stroke="currentColor" stroke-width="1.5"/>
<rect x="18" y="6" width="10" height="24" rx="1" stroke="currentColor" stroke-width="1.5"/>
<path d="M9 12h4M9 16h4M9 20h4M21 12h4M21 16h4M21 20h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
EOF

cat > $CAT/physicist.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="18" cy="18" r="4" stroke="currentColor" stroke-width="1.5"/>
<ellipse cx="18" cy="18" rx="14" ry="6" stroke="currentColor" stroke-width="1.5"/>
<ellipse cx="18" cy="18" rx="14" ry="6" transform="rotate(60 18 18)" stroke="currentColor" stroke-width="1.5"/>
<ellipse cx="18" cy="18" rx="14" ry="6" transform="rotate(120 18 18)" stroke="currentColor" stroke-width="1.5"/>
</svg>
EOF

cat > $CAT/archivist.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="6" y="10" width="24" height="20" rx="2" stroke="currentColor" stroke-width="1.5"/>
<path d="M6 16h24" stroke="currentColor" stroke-width="1.5"/>
<path d="M12 7v6M18 7v6M24 7v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M10 22h8M10 26h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
EOF

cat > $CAT/experimentalist.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M15 4v14l-7 12h20l-7-12V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M12 4h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M10 26h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<circle cx="15" cy="22" r="1.5" fill="currentColor"/>
<circle cx="20" cy="24" r="1.5" fill="currentColor"/>
</svg>
EOF

cat > $CAT/council.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="18" cy="10" r="4" stroke="currentColor" stroke-width="1.5"/>
<circle cx="8" cy="26" r="3" stroke="currentColor" stroke-width="1.5"/>
<circle cx="28" cy="26" r="3" stroke="currentColor" stroke-width="1.5"/>
<path d="M18 14v4M18 18l-7 5M18 18l7 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
EOF

cat > $CAT/pm2.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="4" y="8" width="28" height="20" rx="2" stroke="currentColor" stroke-width="1.5"/>
<path d="M10 16l4 4-4 4M18 24h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $CAT/backup.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M18 6c-6.6 0-12 5.4-12 12 0 3.8 1.8 7.2 4.6 9.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M18 6l-4 4M18 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M10.6 27.4C13 29.6 16.3 31 18 31c6.6 0 12-5.4 12-12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M30 19l-4 4M30 19l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

cat > $CAT/schedule.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="18" cy="18" r="13" stroke="currentColor" stroke-width="1.5"/>
<path d="M18 10v8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M18 7V5M18 31v-2M7 18H5M31 18h-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
EOF

cat > $CAT/git.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="10" cy="10" r="4" stroke="currentColor" stroke-width="1.5"/>
<circle cx="26" cy="10" r="4" stroke="currentColor" stroke-width="1.5"/>
<circle cx="18" cy="28" r="4" stroke="currentColor" stroke-width="1.5"/>
<path d="M14 10h8M13 13l-4 11M23 13l4 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
EOF

cat > $CAT/engineers.svg << 'EOF'
<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M14 6l-2 4H6l6 4-2 5 8-4 8 4-2-5 6-4h-6l-2-4h-8z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M18 19v11M14 26l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
EOF

echo "All Cathedral icons filed (25 files)"
ls -la $CAT/
