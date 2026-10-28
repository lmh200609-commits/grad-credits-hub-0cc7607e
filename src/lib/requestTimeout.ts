export async function withRequestTimeout<T>(request: PromiseLike<T>, milliseconds: number, message: string, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(request),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { onTimeout?.(); reject(new Error(message)); }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}