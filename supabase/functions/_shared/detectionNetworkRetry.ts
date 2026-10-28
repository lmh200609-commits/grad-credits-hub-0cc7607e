export async function retryConnection<T>(operation: () => Promise<T>, canRetry: () => boolean): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (!(error instanceof Error) || !/timeout|abort|connect|fetch|network/i.test(`${error.name} ${error.message}`) || !canRetry()) throw error;
    return await operation();
  }
}

export function detectionFailed(result: { status?: string; error?: unknown; reason?: string }): boolean {
  return result.status === "error" || !!result.error;
}