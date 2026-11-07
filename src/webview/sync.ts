import type { MarkmapNode } from '@markmap/core';
import type { Markmap } from '@markmap/view';

const FLASH_DURATION = 1000;

/** The last node in document order that starts at or before an offset owns that offset. */
export function nodeAtOffset(root: MarkmapNode, offset: number) {
  let best: MarkmapNode | undefined;
  const visit = (node: MarkmapNode) => {
    if (node.position && node.position.start <= offset) best = node;
    node.children.forEach(visit);
  };
  visit(root);
  return best;
}

export function isInView(mm: Markmap, id: string) {
  const rect = mm.screenRect(id);
  if (!rect) return false;
  const box = mm.element.getBoundingClientRect();
  return (
    rect.x >= box.x &&
    rect.y >= box.y &&
    rect.x + rect.width <= box.right &&
    rect.y + rect.height <= box.bottom
  );
}

/** Returns a function that shows where a node is for a moment, following it as the view moves. */
export function createFlash() {
  const el = document.createElement('div');
  el.className = 'node-flash';
  let run = 0;
  return (mm: Markmap, id: string) => {
    run += 1;
    const current = run;
    const start = performance.now();
    const follow = () => {
      if (current !== run) return;
      const rect = mm.screenRect(id);
      if (!rect || performance.now() - start > FLASH_DURATION) {
        el.remove();
        return;
      }
      el.style.left = `${rect.x}px`;
      el.style.top = `${rect.y}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      document.body.append(el);
      requestAnimationFrame(follow);
    };
    follow();
  };
}

/** The node drawn at a pointer event, if any. */
export function nodeAtEvent(mm: Markmap, event: MouseEvent) {
  const box = mm.element.getBoundingClientRect();
  const [x, y] = mm.transform.invert([
    event.clientX - box.x,
    event.clientY - box.y,
  ]);
  return mm.result?.layout.nodes.find(
    ({ rect }) =>
      x >= rect.x &&
      x <= rect.x + rect.width &&
      y >= rect.y &&
      y <= rect.y + rect.height,
  )?.node;
}
