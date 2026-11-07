import { walk } from '@markmap/page';
import { isSafeRelPath } from '../paths';

/**
 * Remark plugin that points relative images at the document's folder. Images that would
 * leave the folder lose their URL, so they show their alt text.
 */
export function remarkLocalImages(getBaseUri: () => string) {
  return () => (tree: Parameters<typeof walk>[0]) => {
    walk(tree, (node) => {
      if (node.type !== 'image' || /^[\w-]+:/.test(node.url)) return;
      node.url = isSafeRelPath(node.url)
        ? `${getBaseUri().replace(/\/$/, '')}/${node.url.replace(/^\.\//, '')}`
        : '';
    });
  };
}
