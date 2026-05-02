const { chromium } = require('@playwright/test');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Collect console messages
  const logs = [];
  page.on('console', msg => logs.push({ type: msg.type(), text: msg.text().substring(0, 200) }));
  
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(5000);
  
  // Check page loaded
  const info = await page.evaluate(() => ({
    title: document.title,
    hasGraph: !!document.querySelector('.network-graph-cytoscape'),
    hasCanvas: !!document.querySelector('.network-graph-cytoscape canvas'),
    labelCount: document.querySelectorAll('.node-name-label').length,
    bodyHTML: document.body.innerHTML.substring(0, 800)
  }));
  console.log('Page info:', JSON.stringify(info, null, 2));
  
  // Try clicking on the canvas to select a node
  const canvas = await page.locator('.network-graph-cytoscape canvas').first();
  const bbox = await canvas.boundingBox();
  console.log('Canvas:', bbox);
  
  // Try different positions to find nodes
  const clickPositions = [
    [0.5, 0.5], [0.4, 0.5], [0.6, 0.5], [0.5, 0.4], [0.5, 0.6],
    [0.35, 0.45], [0.65, 0.55], [0.45, 0.35], [0.55, 0.65],
    [0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.5, 0.7]
  ];
  
  let selectedNode = null;
  for (const [xp, yp] of clickPositions) {
    await page.mouse.click(bbox.x + bbox.width * xp, bbox.y + bbox.height * yp);
    await page.waitForTimeout(300);
    const labels = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.node-name-label'))
        .filter(l => parseFloat(l.style.opacity) > 0.9)
        .map(l => l.textContent);
    });
    if (labels.length > 0) {
      selectedNode = labels[0];
      console.log(`Selected: ${selectedNode} at (${xp}, ${yp})`);
      break;
    }
  }
  
  await page.waitForTimeout(1000);
  
  // Now check what we see
  const afterSelection = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.node-name-label'));
    const data = labels.map(l => {
      const op = parseFloat(l.style.opacity);
      return { name: l.textContent, opacity: op, visible: op > 0.01 };
    });
    return { labels: data, count: labels.length };
  });
  console.log('After selection:', JSON.stringify(afterSelection, null, 2));
  
  // Check console errors
  const errors = logs.filter(l => l.type === 'error');
  if (errors.length > 0) console.log('Errors:', errors);
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
