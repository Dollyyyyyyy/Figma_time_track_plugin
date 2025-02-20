/* 
   This block is your old boilerplate sample. We leave it commented out.
   figma.showUI(__html__);
   figma.ui.onmessage = (msg: {type: string, count: number}) => {
     if (msg.type === 'create-shapes') {
       // ...
     }
     figma.closePlugin();
   };
*/

// ================== START OF YOUR CUSTOM PLUGIN CODE ================== //

// Simulate fetching from your spreadsheet
async function fetchSpreadsheetData(): Promise<Array<{ name: string; time: number }>> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        { name: "Button Primary", time: 5 },
        { name: "Button Secondary", time: 3 },
        { name: "Checkbox", time: 2 },
        { name: "Card", time: 8 },
        { name: "Drop Down", time: 10 },
        { name: "Switch", time: 1 },
        // etc.
      ]);
    }, 500);
  });
}

interface NodeTree {
  name: string;
  matchedTime: number | undefined; // undefined if explicitly selected but no match
  subtreeTime: number;             // sum of matchedTime + children’s subtreeTime
  isExplicit: boolean;             // true if user selected this node directly
  children: NodeTree[];
}

function getAllDescendants(node: BaseNode): BaseNode[] {
  const out: BaseNode[] = [];
  if ("children" in node) {
    for (const child of node.children) {
      out.push(child);
      out.push(...getAllDescendants(child));
    }
  }
  return out;
}

/**
 * Recursively builds a hierarchy for `node`.
 * - If this node's name matches spreadsheet => `matchedTime = row.time`
 * - If no match and `isExplicit` => `matchedTime = undefined` (so UI can show "No match found")
 * - If no match and not explicit => `matchedTime = 0`
 * - `subtreeTime` = (matchedTime or 0) + sum of child subtreeTimes
 */
function buildNodeTree(
  node: BaseNode,
  spreadsheet: Array<{ name: string; time: number }>,
  isExplicit: boolean
): NodeTree {
  // Gather child NodeTrees
  let childTrees: NodeTree[] = [];
  if ("children" in node) {
    for (const child of node.children) {
      childTrees.push(buildNodeTree(child, spreadsheet, false));
    }
  }

  // Does this node have a direct match in spreadsheet?
  const nodeName = node.name.trim();
  const row = spreadsheet.find((r) => r.name.toLowerCase() === nodeName.toLowerCase());
  let matchedTime: number | undefined;
  if (row) {
    matchedTime = row.time;
  } else {
    // No match
    matchedTime = isExplicit ? undefined : 0;
  }

  // subtreeTime = (matchedTime or 0) + sum of children's subtreeTime
  const childSum = childTrees.reduce((acc, c) => acc + c.subtreeTime, 0);
  const numericMatch = matchedTime ?? 0; // treat undefined as 0 for summation
  const subtreeTime = numericMatch + childSum;

  return {
    name: node.name,
    matchedTime,
    subtreeTime,
    isExplicit,
    children: childTrees,
  };
}

async function runLookup() {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.ui.postMessage({ type: "NO_SELECTION" });
    return;
  }

  const spreadsheet = await fetchSpreadsheetData();

  // Build your flat results array (like your existing approach)
  // plus a totalTime for the entire selection
  const results: Array<{ nodeName: string; time?: number }> = [];
  let totalTime = 0;

  // We'll also build the hierarchical structures for each top-level node
  const hierarchies: NodeTree[] = [];

  for (const node of selection) {
    // 1) Build the hierarchy for this selected node
    const tree = buildNodeTree(node, spreadsheet, true);
    hierarchies.push(tree);

    // 2) (Optional) For your old “flat” logic, we can replicate it:
    //    gather the node + all descendants, match them, sum up times, etc.
    const nodesToCheck = [node, ...getAllDescendants(node)];
    for (const n of nodesToCheck) {
      if (
        n.type === "COMPONENT" ||
        n.type === "INSTANCE" ||
        n.type === "FRAME" ||
        n.type === "GROUP" ||
        n.type === "COMPONENT_SET" ||
        n.type === "ELLIPSE" ||
        n.type === "POLYGON" ||
        n.type === "RECTANGLE" ||
        n.type === "TEXT" ||
        n.type === "SHAPE_WITH_TEXT" ||
        n.type === "TABLE" ||
        n.type === "STICKY" ||
        n.type === "STAR" ||
        n.type === "VECTOR" ||
        n.type === "SECTION"
      ) {
        const nameTrim = n.name.trim();
        const matchRow = spreadsheet.find(
          (r) => r.name.toLowerCase() === nameTrim.toLowerCase()
        );
        if (matchRow) {
          results.push({ nodeName: nameTrim, time: matchRow.time });
          totalTime += matchRow.time;
        } else {
          // Show "No match found" only if n == node (i.e. explicitly selected)
          // else skip.
          if (n === node) {
            results.push({ nodeName: nameTrim, time: undefined });
          }
        }
      }
    }
  }

  // Post everything to the UI
  figma.ui.postMessage({
    type: "SHOW_RESULTS",
    payload: {
      results,
      totalTime,
      hierarchies, // the new hierarchical data
    },
  });
}

// Show the UI
figma.showUI(__html__, { width: 400, height: 300 });

// Run once
runLookup();

// Listen for re-run
figma.ui.onmessage = (msg) => {
  if (msg.type === "RUN_LOOKUP") {
    runLookup();
  }
};
