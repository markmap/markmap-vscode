/** Whether a path from a document stays inside the document's folder. */
export function isSafeRelPath(raw: string) {
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return false;
  }
  if (/^([a-zA-Z]:)?[\\/]/.test(path)) return false;
  return !path.split(/[/\\]/).includes('..');
}
