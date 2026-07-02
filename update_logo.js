import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagePath = path.resolve(__dirname, 'src/assets/One X Transmission Logo.png');
const outputPath = path.resolve(__dirname, 'src/assets/logo.js');

console.log('Reading image from:', imagePath);
console.log('Writing output to:', outputPath);

try {
  if (!fs.existsSync(imagePath)) {
      console.error('Error: Image file not found at ' + imagePath);
      process.exit(1);
  }
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const dataUri = `data:image/png;base64,${base64Image}`;
  
  const content = `// Auto-generated logo file
export const logoBase64 = '${dataUri}';
`;

  fs.writeFileSync(outputPath, content);
  console.log('Successfully updated logo.js with new base64 image.');
} catch (error) {
  console.error('Error processing logo:', error);
}
