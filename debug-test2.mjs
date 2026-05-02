import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173');
  
  // Wait longer for fcose layout to fully complete (takes ~3-5s)
  console.log('Waiting 6s for fcose layout...');
  await page.waitForTimeout(6000);
  
  // Inject a helper to access the cytoscape instance via React DevTools
  // Or by finding it via the container's data
  const initResult = await page.evaluate(() => {
    const container = document.querySelector('.network-graph-cytoscape');
    if (!container) return { error: 'no container' };
    
    // Check what's in the container
    const children = Array.from(container.children).map(c => ({
      tag: c.tagName,
      classes: c.className,
      childCount: c.children.length
    }));
    
    // Check for any canvas
    const canvases = container.querySelectorAll('canvas');
    
    // Look for React fiber
    const keys = Object.keys(container);
    const reactKeys = keys.filter(k => k.startsWith('__react'));
    
    return {
      containerHTML: container.innerHTML.substring(0, 200),
      children: children,
      canvasCount: canvases.length,
      canvasSizes: Array.from(canvases).map(c => ({ w: c.width, h: c.height })),
      reactKeys: reactKeys
    };
  });
  console.log('Container info:', JSON.stringify(initResult, null, 2));
  
  // Wait a bit more
  await page.waitForTimeout(2000);
  
  // Check labels again
  const labelCount = await page.evaluate(() => document.querySelectorAll('.node-name-label').length);
  console.log(`Label count after waiting: ${labelCount}`);
  
  // Now try to inject code into the page that exposes the cy ref
  // We can do this by adding a window property in the React component temporarily
  // But since we can't modify the component, let's try a different approach:
  // Intercept the cytoscape init call
  
  // Try to click on the canvas at center
  const canvas = await page.locator('.network-graph-cytoscape canvas').first();
  const bbox = await canvas.boundingBox();
  
  // Try many positions to find a node
  console.log('Trying to click nodes...');
  for (let i = 0; i < 20; i++) {
    const xp = 0.2 + (i % 5) * 0.15;
    const yp = 0.2 + Math.floor(i / 5) * 0.15;
    await page.mouse.click(bbox.x + bbox.width * xp, bbox.y + bbox.height * yp);
    await page.waitForTimeout(300);
    
    const state = await page.evaluate(() => {
      const selected = Array.from(document.querySelectorAll('.node-name-label'))
        .filter(l => parseFloat(l.style.opacity) > 0.89)
        .map(l => l.textContent);
      return { 
        selectedCount: selected.length,
        selectedNames: selected,
        allLabels: Array.from(document.querySelectorAll('.node-name-label')).map(l => ({ name: l.textContent, opacity: l.style.opacity }))
      };
    });
    
    if (state.selectedCount > 0) {
      console.log(`Found selected: ${state.selectedNames.join(', ')} at grid (${i%5}, ${Math.floor(i/5)})`);
      
      // Now check if the legend appeared (means selection is active)
      const hasLegend = await page.evaluate(() => !!document.querySelector('.direction-legend'));
      console.log(`Direction legend visible: ${hasLegend}`);
      
      // Check what legend says
      if (hasLegend) {
        const legendText = await page.evaluate(() => document.querySelector('.direction-legend')?.textContent);
        console.log(`Legend text: ${legendText}`);
      }
      
      break;
    }
  }
  
  // Check final state
  const finalState = await page.evaluate(() => {
    return {
      labelCount: document.querySelectorAll('.node-name-label').length,
      allLabels: Array.from(document.querySelectorAll('.node-name-label')).map(l => ({ name: l.textContent, opacity: l.style.opacity })),
      hasLegend: !!document.querySelector('.direction-legend'),
      rightPanel: document.querySelector('.right-panel, [class*="right"]') ? 'exists' : 'none'
    };
  });
  console.log('Final state:', JSON.stringify(finalState, null, 2));
  
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
