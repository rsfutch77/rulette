const fs = require('fs');
const path = require('path');

const filesToCopy = ['main.js', 'firebase-init.js', 'index.html', 'cardManager.js', 'cards.csv', 'cardModels.js', 'cards-therapy - Sheet1.csv'];
const destDir = path.join(__dirname, 'public');

// Ensure public directory exists
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
  console.log('Created public directory');
}

filesToCopy.forEach(file => {
  const src = path.join(__dirname, file);
  const dest = path.join(destDir, file);
  
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} to public/`);
  } else {
    console.warn(`Warning: ${file} does not exist in project root.`);
  }
});