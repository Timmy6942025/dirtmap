import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const logs = [];
  page.on('console', msg => logs.push({ type: msg.type(), text: msg.text().substring(0, 200) }));
  
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(5000);
  
  const info = await page.evaluate(() => ({
    hasGraph: !!document.querySelector('.network-graph-cytoscape'),
    hasCanvas: !!document.querySelector('.network-graph-cytoscape canvas'),
    labelCount: document.querySelectorAll('.node-name-label').length,
  }));
  console.log('Page info:', JSON.stringify(info, null, 2));
  
  const canvas = await page.locator('.network-graph-cytoscape canvas').first();
  const bbox = await canvas.boundingBox();
  console.log('Canvas:', JSON.stringify(bbox));
  
  // Try clicking different positions to select a node
  const clickPositions = [
    [0.5, 0.5], [0.4, 0.5], [0.6, 0.5], [0.5, 0.4], [0.5, 0.6],
    [0.35, 0.45], [0.65, 0.55], [0.45, 0.35], [0.55, 0.65],
    [0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.5, 0.7],
    [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]
  ];
  
  let foundNode = null;
  for (const [xp, yp] of clickPositions) {
    await page.mouse.click(bbox.x + bbox.width * xp, bbox.y + bbox.height * yp);
    await page.waitForTimeout(400);
    const selected = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.node-name-label'))
        .filter(l => parseFloat(l.style.opacity) > 0.89)
        .map(l => l.textContent);
    });
    if (selected.length > 0) {
      foundNode = selected[0];
      console.log(`Selected node: "${foundNode}" at (${xp}, ${yp})`);
      break;
    }
  }
  
  await page.waitForTimeout(1500);
  
  // Get all labels and their opacity to understand what's visible
  const labelData = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.node-name-label')).map(l => ({
      name: l.textContent,
      opacity: l.style.opacity,
    }));
  });
  console.log('All labels after selection:', JSON.stringify(labelData, null, 2));
  
  // Now try to access the Cytoscape instance by looking for window globals
  const cyData = await page.evaluate(() => {
    const container = document.querySelector('.network-graph-cytoscape');
    if (!container) return { error: 'no container' };
    
    // Check for window globals that might hold cy ref
    const cyKeys = Object.keys(window).filter(k => {
      try { return typeof window[k] === 'object' && window[k] !== null && 'nodes' in window[k]; } catch(e) { return false; }
    });
    
    return {
      containerChildren: container.children.length,
      possibleCyKeys: cyKeys.slice(0, 5),
    };
  });
  console.log('Cy data:', JSON.stringify(cyData));
  
  const errors = logs.filter(l => l.type === 'error');
  if (errors.length > 0) console.log('Console errors:', JSON.stringify(errors, null, 2));
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
